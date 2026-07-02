import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Localization from "expo-localization";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "../../../context/theme";
import { useSubscriptionContext } from "../../../context/subscription";
import { usePullToRefresh } from "../../../hooks/usePullToRefresh";
import { supabase } from "../../../lib/supabase";
import {
  extractPdfTextFromStoragePath,
  guessMimeType,
  ocrImage,
  uploadUriAsset,
} from "../../../lib/extraction";
import { Radius, Spacing, Typography } from "../../../constants/fonts";
import {
  Button,
  Card,
  Input,
  ListRow,
  ProgressBar,
  StepFlow,
  type StepDef,
} from "../../../components/ui";
import PaywallModal from "../../../components/PaywallModal";
import wordnetIndex from "../../../generated/wordnet-index.json";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

type Institution = {
  school_id: string;
  name: string;
  is_primary: boolean;
};

type PickedFile = {
  uri: string;
  name: string;
  mimeType: string;
};

type SyllabusMode = "text" | "image" | "file" | null;

type OutlineUnit = {
  tempId: string;
  title: string;
  sequenceNo: number;
  description?: string | null;
};

type OutlineChapter = {
  tempId: string;
  title: string;
  sequenceNo: number;
  unitTempId: string | null;
  description?: string | null;
};

type OutlineLesson = {
  title: string;
  sequenceNo: number;
  chapterTempId: string;
  learningObjectives?: string | null;
  content?: string | null;
};

type ParsedOutline = {
  units: OutlineUnit[];
  chapters: OutlineChapter[];
  lessons: OutlineLesson[];
};

type WordnetIndexShape = {
  by_initial?: Record<string, string[]>;
};

const WORDNET_BY_INITIAL = ((wordnetIndex as WordnetIndexShape).by_initial ?? {}) as Record<
  string,
  string[]
>;
const WORDNET_SET_CACHE = new Map<string, Set<string>>();

function getWordnetBucket(initial: string) {
  return WORDNET_BY_INITIAL[initial] ?? [];
}

function getWordnetBucketSet(initial: string) {
  const cached = WORDNET_SET_CACHE.get(initial);
  if (cached) return cached;
  const created = new Set(getWordnetBucket(initial));
  WORDNET_SET_CACHE.set(initial, created);
  return created;
}

function applyOriginalCase(original: string, replacement: string) {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function boundedLevenshtein(a: string, b: string, maxDistance: number) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }

  return prev[b.length];
}

function correctWordWithWordnet(token: string) {
  if (!/^[A-Za-z]{4,24}$/.test(token)) return token;
  const lower = token.toLowerCase();
  const initial = lower[0];
  const bucket = getWordnetBucket(initial);
  if (bucket.length === 0) return token;
  if (getWordnetBucketSet(initial).has(lower)) return token;

  let bestWord: string | null = null;
  let bestDistance = 3;
  for (const candidate of bucket) {
    if (Math.abs(candidate.length - lower.length) > 2) continue;
    const distance = boundedLevenshtein(lower, candidate, 2);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestWord = candidate;
      if (distance === 1) break;
    }
  }

  if (!bestWord || bestDistance > 2) return token;
  return applyOriginalCase(token, bestWord);
}

function guessExtension(mimeType?: string | null) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "application/pdf") return "pdf";
  return "jpg";
}

function formatAcademicYear(startYear: number) {
  return `${startYear}-${startYear + 1}`;
}

function normalizeSyllabusText(rawText: string) {
  const baseLines = rawText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\t/g, " ").replace(/[ ]{2,}/g, " ").trim())
    .map((line) => line.replace(/^[\u2022\u2023\u25E6\u2043\u2219*•·●▪◦\-]+\s*/g, "").trim())
    .filter((line) => line.length >= 3 && line.length <= 220)
    .filter((line) => !/^\d+$/.test(line))
    .filter((line) => !/^page\s+\d+$/i.test(line));

  const lines: string[] = [];
  for (let i = 0; i < baseLines.length; i += 1) {
    const current = baseLines[i]
      .replace(/\b(Unit|Chapter|Lesson)\s*([0-9IVXLCDM]+)\b/gi, "$1 $2")
      .replace(/\bLesson\s*O\b/gi, "Lesson 0");
    const next = baseLines[i + 1] ?? "";

    // OCR sometimes splits: "Unit" + "I Things Around You".
    if (/^unit$/i.test(current)) {
      const continuation = next.match(/^([IVXLCDM]+)\s+(.+)$/i);
      if (continuation) {
        lines.push(`Unit ${continuation[1]} ${continuation[2]}`.trim());
        i += 1;
        continue;
      }
      const looseContinuation = next.match(/^[)\]}.,\s-]*([A-Za-z].+)$/);
      if (looseContinuation && !/^(chapter|lesson|unit)\b/i.test(looseContinuation[1])) {
        lines.push(`Unit ${looseContinuation[1]}`.trim());
        i += 1;
        continue;
      }
    }

    // OCR sometimes prefixes headings with noise chars, e.g. "o Lesson 2", "a Chapter 2".
    const cleanedHeadingPrefix = current.replace(/^(?:[A-Za-z]{1,2})\s+(?=(unit|chapter|lesson)\b)/i, "");
    lines.push(cleanedHeadingPrefix.trim());
  }

  return lines;
}

function stripNumberingPrefix(text: string) {
  return text.replace(/^([A-Z]|\d+|[IVXLCDM]+)([.\-:)\]])\s*/i, "").trim();
}

function stripTrailingPageNumber(text: string) {
  return text.replace(/\s+\d{1,4}\s*$/, "").trim();
}

function parseRomanNumeral(token: string) {
  const value = token.toUpperCase();
  if (!/^[IVXLCDM]+$/.test(value)) return null;
  const map: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };
  let total = 0;
  for (let i = 0; i < value.length; i += 1) {
    const current = map[value[i]];
    const next = map[value[i + 1]] ?? 0;
    total += current < next ? -current : current;
  }
  return total > 0 ? total : null;
}

function parseHeadingSequence(token: string | null, type: "unit" | "chapter" | "lesson") {
  if (!token) return null;
  const normalized = token.trim();
  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) return Number(normalized);
  if (/^[IVXLCDM]+$/i.test(normalized)) return parseRomanNumeral(normalized);

  if (type === "lesson" && /^[0-9IVXLCDM]+([.\-][0-9IVXLCDM]+)+$/i.test(normalized)) {
    const pieces = normalized.split(/[.\-]/).filter(Boolean);
    const last = pieces[pieces.length - 1];
    if (/^\d+$/.test(last)) return Number(last);
    return parseRomanNumeral(last);
  }

  return null;
}

function isWeakOutlineTitle(text: string) {
  const value = text.trim();
  if (!value) return true;
  if (!/[A-Za-z]/.test(value)) return true;
  return /^([A-Z]|\d+|[IVXLCDM]+)([.\-]\d+)?$/i.test(value);
}

function replaceWholeWordInsensitive(text: string, wrong: string, correct: string) {
  const pattern = new RegExp(`\\b${wrong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
  return text.replace(pattern, (matched) => {
    if (matched === matched.toUpperCase()) return correct.toUpperCase();
    if (matched[0] === matched[0].toUpperCase()) return correct[0].toUpperCase() + correct.slice(1);
    return correct;
  });
}

function fixCommonOcrTypos(text: string) {
  let next = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bSiz\b/g, "Size")
    .replace(/\bthout\b/gi, "without")
    .replace(/\bNervoUs\b/g, "Nervous")
    .replace(/^[^A-Za-z0-9]+/, "");

  const dictionary: [string, string][] = [
    ["eorth", "earth"],
    ["spcca", "space"],
    ["chartges", "changes"],
    ["earh", "earth"],
    ["wegther", "weather"],
    ["paitermsin", "patterns in"],
    ["phutipjines", "philippines"],
    ["mofion", "motion"],
    ["soldr", "solar"],
    ["oendocrine", "endocrine"],
  ];

  for (const [wrong, correct] of dictionary) {
    next = replaceWholeWordInsensitive(next, wrong, correct);
  }

  next = next.replace(/\b[A-Za-z]{4,24}\b/g, (word) => correctWordWithWordnet(word));

  return next;
}

function cleanOutlineTitle(text: string) {
  const normalized = fixCommonOcrTypos(
    stripTrailingPageNumber(stripNumberingPrefix(text))
    .replace(/[|]+/g, " ")
    .replace(/[.]{2,}/g, " ")
    .replace(/\s+[A-Za-z]*\d+[A-Za-z]+\s*$/, "")
    .replace(/[.:;\-]+$/, "")
    .replace(/[ ]{2,}/g, " ")
    .trim()
  );
  return isWeakOutlineTitle(normalized) ? null : normalized;
}

function formatOutlineTitle(text: string) {
  const cleaned = cleanOutlineTitle(text);
  if (!cleaned) return null;

  const normalized = cleaned
    .replace(/\s+/g, " ")
    .replace(/[.]+$/, "")
    .trim();

  if (!normalized || normalized.length > 90) return null;

  if (normalized === normalized.toUpperCase() && /[A-Z]{3,}/.test(normalized)) {
    return normalized
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .replace(/\b(And|Or|Of|For|To|With|In|On|The|A|An)\b/g, (word, offset) =>
        offset === 0 ? word : word.toLowerCase()
      );
  }

  return normalized;
}

function formatOutlineBodyLine(text: string) {
  const cleaned = fixCommonOcrTypos(
    stripTrailingPageNumber(text)
      .replace(/[|]+/g, " ")
      .replace(/[ ]{2,}/g, " ")
      .trim()
  )
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 4) return null;
  if (/^(contents|table of contents)$/i.test(cleaned)) return null;
  return cleaned;
}

function normalizeBulletObjective(text: string) {
  const cleaned = formatOutlineBodyLine(
    text.replace(/^(?:[\u2022\u2023\u25E6\u2043\u2219*•·●▪◦-]|\d+[.)]?|[A-Za-z][.)]?)\s+/, "")
  );
  if (!cleaned) return null;
  return cleaned.replace(/[.;:]+$/, "").trim();
}

function parseHeading(line: string, type: "unit" | "chapter" | "lesson") {
  const escaped = type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tokenPattern =
    type === "lesson"
      ? "[0-9IVXLCDM]+(?:[.\\-][0-9IVXLCDM]+)*"
      : "[0-9IVXLCDM]+";
  const headingRegex = new RegExp(
    `^${escaped}\\s*(${tokenPattern})?(?:\\s*[:.\\-\\)\\]]\\s*|\\s+)?(.+)?$`,
    "i"
  );
  const match = line.match(headingRegex);
  if (!match) return null;

  const rawTitle = (match[2] ?? "").trim();
  const cleanTitle = cleanOutlineTitle(rawTitle);
  const seqToken = (match[1] ?? "").trim();
  if (type === "chapter" && !seqToken && cleanTitle && /^(test|review|assessment)$/i.test(cleanTitle)) {
    return null;
  }
  return {
    token: seqToken || null,
    title: cleanTitle || null,
  };
}

function parseAnyHeading(line: string) {
  return parseHeading(line, "unit") || parseHeading(line, "chapter") || parseHeading(line, "lesson");
}

function isObjectiveHeading(line: string) {
  return /^(learning objectives?|intended learning outcomes?|objectives?|outcomes?)$/i.test(line.trim());
}

function isObjectiveLeadIn(line: string) {
  return /^(at the end of (?:the )?(?:lesson|chapter|unit)|students (?:should|will|are expected to) be able to)\b/i.test(
    line.trim()
  );
}

function isLikelyObjectiveItem(line: string) {
  const value = line.trim();
  if (!value) return false;
  if (/^[\u2022\u2023\u25E6\u2043\u2219*•·●▪◦\-]/.test(value)) return true;
  if (/^\d+[.)]\s+/.test(value)) return true;
  if (/^[a-z][.)]\s+/i.test(value)) return true;
  return /^(identify|describe|explain|differentiate|analyze|analyse|compare|classify|solve|construct|apply|demonstrate|evaluate|illustrate|discuss|define|interpret|use|create|relate|recognize|outline|summarize)\b/i.test(
    value
  );
}

function joinParagraphLines(lines: string[]) {
  const cleaned = lines.map((line) => formatOutlineBodyLine(line)).filter((line): line is string => Boolean(line));
  return cleaned.length > 0 ? cleaned.join(" ") : null;
}

function formatObjectives(items: string[]) {
  const cleaned = items
    .map((item) => normalizeBulletObjective(item))
    .filter((item): item is string => Boolean(item));
  return cleaned.length > 0 ? cleaned.map((item) => `- ${item}`).join("\n") : null;
}

function isLikelyTitleNoise(line: string) {
  const value = line.trim();
  if (!value) return true;
  if (/^contents$/i.test(value)) return true;
  if (/^table of contents$/i.test(value)) return true;
  if (/^preface\.?$/i.test(value)) return true;
  if (/^welcome to /i.test(value)) return true;
  if (/^chapter test$/i.test(value)) return true;
  if (/^science in action$/i.test(value)) return true;
  if (/^digital adventures in science$/i.test(value)) return true;
  if (/reproduced|without written|thout written/i.test(value)) return true;
  if (value.length < 4) return true;
  if (!/[A-Za-z]/.test(value)) return true;
  if (/\d/.test(value) && !/^(Unit|Chapter|Lesson)\s+/i.test(value)) return true;
  if (/^[a-z\s.,'|-]+$/.test(value) && !/^(and|or|of|for|to|with|in|on)\b/.test(value)) return true;
  if (/^[A-Za-z]+\s*[0-9]+$/.test(value)) return true;

  const tokens = value
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length >= 2) {
    const knownWords = new Set([
      "earth",
      "space",
      "science",
      "matter",
      "mixtures",
      "characteristics",
      "homogeneous",
      "heterogeneous",
      "separating",
      "components",
      "living",
      "things",
      "environment",
      "different",
      "systems",
      "human",
      "body",
      "integumentary",
      "musculoskeletal",
      "digestive",
      "excretory",
      "respiratory",
      "circulatory",
      "nervous",
      "endocrine",
      "diversity",
      "animals",
      "vertebrates",
      "invertebrates",
      "plate",
      "tectonics",
      "galaxies",
      "universe",
      "electromagnetic",
      "waves",
      "spectrum",
      "light",
      "optics",
      "reflection",
      "image",
      "formation",
      "refraction",
      "lenses",
      "changes",
      "shape",
      "size",
      "state",
      "states",
      "solids",
      "liquids",
      "gases",
      "and",
      "the",
      "of",
      "to",
      "in",
      "their",
    ]);
    const knownCount = tokens.filter((token) => knownWords.has(token)).length;
    const suspiciousCount = tokens.filter((token) => /[a-z][A-Z]/.test(token) || !/[aeiou]/i.test(token)).length;
    if (knownCount === 0 && suspiciousCount >= Math.ceil(tokens.length / 2)) return true;
  }

  return false;
}

function mergeContinuationTitles(lines: string[]) {
  const merged: string[] = [];
  for (const line of lines) {
    if (merged.length === 0) {
      merged.push(line);
      continue;
    }

    const previous = merged[merged.length - 1];
    if (/^(and|or|of|for|to|with|in|on)\b/i.test(line) && /[,;:]$/.test(previous)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${line}`.replace(/[ ]{2,}/g, " ").trim();
      continue;
    }

    merged.push(line);
  }
  return merged;
}

type ParsedSequenceEntry = {
  value: number;
  explicit: boolean;
};

function normalizeLikelyOcrSequence(entries: ParsedSequenceEntry[]) {
  if (entries.length < 3) return entries.map((entry) => entry.value);

  let bestStart = -1;
  let bestLength = 1;
  let i = 0;
  while (i < entries.length - 1) {
    if (entries[i + 1].value !== entries[i].value + 1) {
      i += 1;
      continue;
    }
    let end = i + 1;
    while (end + 1 < entries.length && entries[end + 1].value === entries[end].value + 1) {
      end += 1;
    }
    const length = end - i + 1;
    if (length > bestLength) {
      bestStart = i;
      bestLength = length;
    }
    i = end + 1;
  }

  if (bestStart < 0 || bestLength < 2) return entries.map((entry) => entry.value);

  const result = entries.map((entry) => entry.value);
  const anchorIndex = bestStart;
  const anchorValue = entries[anchorIndex].value;

  for (let index = 0; index < entries.length; index += 1) {
    if (index >= bestStart && index < bestStart + bestLength) continue;

    const expected = anchorValue + (index - anchorIndex);
    if (expected < 1) continue;

    const current = entries[index];
    const difference = Math.abs(current.value - expected);
    if (difference < 2) continue;

    if (current.explicit || difference >= 4) {
      result[index] = expected;
    }
  }

  return result;
}

function parseOutlineFromText(rawText: string): ParsedOutline {
  const lines = normalizeSyllabusText(rawText);
  const units: OutlineUnit[] = [];
  const chapters: OutlineChapter[] = [];
  const lessons: OutlineLesson[] = [];
  const chapterIndicesByBucket = new Map<string, number[]>();
  const lessonIndicesByChapterTempId = new Map<string, number[]>();
  const chapterHadExplicitSeq = new Map<string, boolean>();
  const lessonHadExplicitSeq = new Map<string, boolean[]>();
  const candidateTitleLinesByBucket = new Map<string, string[]>();
  const lessonCountByChapterTempId = new Map<string, number>();
  const nextLessonSequenceByChapterTempId = new Map<string, number>();
  let nextChapterSequence = 1;

  let currentUnitTempId: string | null = null;
  let currentChapterTempId: string | null = null;
  let currentLessonIndex: number | null = null;
  let collectingObjectives = false;
  let objectiveItems: string[] = [];
  let pendingDescriptionLines: string[] = [];
  const rootBucketKey = "__root__";

  const getBucketKey = (unitTempId: string | null) => unitTempId ?? rootBucketKey;
  const pushCandidate = (bucketKey: string, title: string) => {
    const list = candidateTitleLinesByBucket.get(bucketKey) ?? [];
    list.push(title);
    candidateTitleLinesByBucket.set(bucketKey, list);
  };
  const pushChapterIndex = (bucketKey: string, chapterIndex: number) => {
    const list = chapterIndicesByBucket.get(bucketKey) ?? [];
    list.push(chapterIndex);
    chapterIndicesByBucket.set(bucketKey, list);
  };
  const ensureChapterForCurrentScope = () => {
    const chapterTempId = `c_${chapters.length + 1}`;
    const bucketKey = getBucketKey(currentUnitTempId);
    const sequenceNo = nextChapterSequence;
    nextChapterSequence += 1;
    chapters.push({
      tempId: chapterTempId,
      title: "",
      sequenceNo,
      unitTempId: currentUnitTempId,
    });
    pushChapterIndex(bucketKey, chapters.length - 1);
    lessonIndicesByChapterTempId.set(chapterTempId, []);
    lessonHadExplicitSeq.set(chapterTempId, []);
    lessonCountByChapterTempId.set(chapterTempId, 0);
    nextLessonSequenceByChapterTempId.set(chapterTempId, 1);
    chapterHadExplicitSeq.set(chapterTempId, false);
    currentChapterTempId = chapterTempId;
    return chapterTempId;
  };

  const flushCurrentLessonObjectives = () => {
    if (currentLessonIndex === null) return;
    const lesson = lessons[currentLessonIndex];
    if (!lesson) return;
    if (objectiveItems.length === 0) return;
    lesson.learningObjectives = formatObjectives(objectiveItems);
    objectiveItems = [];
  };

  const appendDescriptionToCurrentScope = () => {
    const description = joinParagraphLines(pendingDescriptionLines);
    pendingDescriptionLines = [];
    if (!description) return;

    if (currentLessonIndex !== null && lessons[currentLessonIndex]) {
      const existing = lessons[currentLessonIndex].content?.trim();
      lessons[currentLessonIndex].content = existing ? `${existing}\n\n${description}` : description;
      return;
    }

    if (currentChapterTempId) {
      const chapter = chapters.find((entry) => entry.tempId === currentChapterTempId);
      if (chapter) {
        const existing = chapter.description?.trim();
        chapter.description = existing ? `${existing}\n\n${description}` : description;
        return;
      }
    }

    if (currentUnitTempId) {
      const unit = units.find((entry) => entry.tempId === currentUnitTempId);
      if (unit) {
        const existing = unit.description?.trim();
        unit.description = existing ? `${existing}\n\n${description}` : description;
      }
    }
  };

  const flushScopeBuffers = () => {
    flushCurrentLessonObjectives();
    collectingObjectives = false;
    appendDescriptionToCurrentScope();
  };

  for (const line of lines) {
    if (isObjectiveHeading(line)) {
      appendDescriptionToCurrentScope();
      flushCurrentLessonObjectives();
      collectingObjectives = true;
      continue;
    }

    if (parseAnyHeading(line)) {
      flushScopeBuffers();
    }

    const unitMatch = parseHeading(line, "unit");
    if (unitMatch) {
      const tempId = `u_${units.length + 1}`;
      const fallback = unitMatch.token ? `Unit ${unitMatch.token}` : `Unit ${units.length + 1}`;
      units.push({
        tempId,
        title: formatOutlineTitle(unitMatch.title ?? fallback) ?? fallback,
        sequenceNo: units.length + 1,
        description: null,
      });
      currentUnitTempId = tempId;
      currentChapterTempId = null;
      currentLessonIndex = null;
      continue;
    }

    const chapterMatch = parseHeading(line, "chapter");
    if (chapterMatch) {
      const tempId = `c_${chapters.length + 1}`;
      const parsedChapterSeq = parseHeadingSequence(chapterMatch.token, "chapter");
      const chapterSequenceNo = parsedChapterSeq ?? nextChapterSequence;
      nextChapterSequence = Math.max(nextChapterSequence, chapterSequenceNo + 1);
      const fallback = chapterMatch.token
        ? `Chapter ${chapterMatch.token}`
        : `Chapter ${chapterSequenceNo}`;
      chapters.push({
        tempId,
        title: formatOutlineTitle(chapterMatch.title ?? fallback) ?? fallback,
        sequenceNo: chapterSequenceNo,
        unitTempId: currentUnitTempId,
        description: null,
      });
      pushChapterIndex(getBucketKey(currentUnitTempId), chapters.length - 1);
      lessonIndicesByChapterTempId.set(tempId, []);
      lessonHadExplicitSeq.set(tempId, []);
      lessonCountByChapterTempId.set(tempId, 0);
      nextLessonSequenceByChapterTempId.set(tempId, 1);
      chapterHadExplicitSeq.set(tempId, parsedChapterSeq !== null);
      currentChapterTempId = tempId;
      currentLessonIndex = null;
      continue;
    }

    const lessonMatch = parseHeading(line, "lesson");
    if (lessonMatch) {
      const chapterTempId = currentChapterTempId ?? ensureChapterForCurrentScope();
      const chapterLessonCount = lessonCountByChapterTempId.get(chapterTempId) ?? 0;
      const parsedLessonSeq = parseHeadingSequence(lessonMatch.token, "lesson");
      const nextLessonSequence = nextLessonSequenceByChapterTempId.get(chapterTempId) ?? 1;
      const lessonSequenceNo = parsedLessonSeq ?? nextLessonSequence;
      nextLessonSequenceByChapterTempId.set(
        chapterTempId,
        Math.max(nextLessonSequence, lessonSequenceNo + 1)
      );
      const fallback = lessonMatch.token
        ? `Lesson ${lessonMatch.token}`
        : `Lesson ${lessonSequenceNo}`;

      lessons.push({
        title: formatOutlineTitle(lessonMatch.title ?? fallback) ?? fallback,
        sequenceNo: lessonSequenceNo,
        chapterTempId,
        learningObjectives: null,
        content: null,
      });
      const lessonIndex = lessons.length - 1;
      const lessonIndices = lessonIndicesByChapterTempId.get(chapterTempId) ?? [];
      lessonIndices.push(lessonIndex);
      lessonIndicesByChapterTempId.set(chapterTempId, lessonIndices);
      const lessonExplicitFlags = lessonHadExplicitSeq.get(chapterTempId) ?? [];
      lessonExplicitFlags.push(parsedLessonSeq !== null);
      lessonHadExplicitSeq.set(chapterTempId, lessonExplicitFlags);
      lessonCountByChapterTempId.set(chapterTempId, chapterLessonCount + 1);
      currentLessonIndex = lessonIndex;
      continue;
    }

    const cleanedTitle = cleanOutlineTitle(line);
    if (!cleanedTitle || isLikelyTitleNoise(cleanedTitle) || parseAnyHeading(cleanedTitle)) continue;

    if (collectingObjectives || isObjectiveLeadIn(line) || isLikelyObjectiveItem(line)) {
      collectingObjectives = true;
      const normalizedObjective = normalizeBulletObjective(line);
      if (normalizedObjective) {
        objectiveItems.push(normalizedObjective);
      }
      continue;
    }

    const formattedBody = formatOutlineBodyLine(line);
    if (formattedBody && (currentChapterTempId || currentUnitTempId)) {
      pendingDescriptionLines.push(formattedBody);
      continue;
    }

    pushCandidate(getBucketKey(currentUnitTempId), formatOutlineTitle(cleanedTitle) ?? cleanedTitle);
  }

  flushScopeBuffers();

  // Normalize OCR outliers (e.g., 1, 9, 10, 11 -> 8, 9, 10, 11).
  const chapterEntries = chapters.map((chapter) => ({
    value: chapter.sequenceNo,
    explicit: chapterHadExplicitSeq.get(chapter.tempId) ?? false,
  }));
  const normalizedChapterSequence = normalizeLikelyOcrSequence(chapterEntries);
  chapters.forEach((chapter, index) => {
    chapter.sequenceNo = normalizedChapterSequence[index] ?? chapter.sequenceNo;
    if (/^Chapter\s+[A-Za-z0-9.\-]+\s*$/i.test(chapter.title)) {
      chapter.title = `Chapter ${chapter.sequenceNo}`;
    }
  });

  for (const chapter of chapters) {
    const lessonIndices = lessonIndicesByChapterTempId.get(chapter.tempId) ?? [];
    if (lessonIndices.length === 0) continue;
    const explicitFlags = lessonHadExplicitSeq.get(chapter.tempId) ?? [];
    const lessonEntries = lessonIndices.map((lessonIndex, offset) => ({
      value: lessons[lessonIndex]?.sequenceNo ?? offset + 1,
      explicit: explicitFlags[offset] ?? false,
    }));
    const normalizedLessonSequence = normalizeLikelyOcrSequence(lessonEntries);
    lessonIndices.forEach((lessonIndex, offset) => {
      const lesson = lessons[lessonIndex];
      if (!lesson) return;
      lesson.sequenceNo = normalizedLessonSequence[offset] ?? lesson.sequenceNo;
      if (/^Lesson\s+[A-Za-z0-9.\-]+\s*$/i.test(lesson.title)) {
        lesson.title = `Lesson ${lesson.sequenceNo}`;
      }
    });
  }

  const assignSequentialTitles = (bucketKey: string, unitIndex: number | null) => {
    const candidates = mergeContinuationTitles(candidateTitleLinesByBucket.get(bucketKey) ?? []);
    if (candidates.length === 0) return;

    let pointer = 0;
    if (unitIndex !== null && units[unitIndex] && /^Unit\s+/i.test(units[unitIndex].title)) {
      units[unitIndex].title = formatOutlineTitle(candidates[pointer] ?? "") ?? units[unitIndex].title;
      pointer += 1;
    }

    const chapterIndices = chapterIndicesByBucket.get(bucketKey) ?? [];
    for (const chapterIndex of chapterIndices) {
      const chapter = chapters[chapterIndex];
      if (!chapter) continue;

      if (/^Chapter\s+/i.test(chapter.title) && pointer < candidates.length) {
        chapter.title = formatOutlineTitle(candidates[pointer]) ?? chapter.title;
        pointer += 1;
      }

      const lessonIndices = lessonIndicesByChapterTempId.get(chapter.tempId) ?? [];
      for (const lessonIndex of lessonIndices) {
        const lesson = lessons[lessonIndex];
        if (!lesson) continue;
        if (/^Lesson\s+/i.test(lesson.title) && pointer < candidates.length) {
          lesson.title = formatOutlineTitle(candidates[pointer]) ?? lesson.title;
          pointer += 1;
        }
      }
    }
  };

  for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
    assignSequentialTitles(units[unitIndex].tempId, unitIndex);
  }
  assignSequentialTitles(rootBucketKey, null);

  // Fallback for plain TOCs without explicit unit/chapter/lesson keywords.
  if (chapters.length === 0 && lessons.length === 0) {
    const plainCandidates = mergeContinuationTitles(
      lines
        .map((line) => cleanOutlineTitle(line))
        .filter((line): line is string => Boolean(line))
        .filter((line) => !isLikelyTitleNoise(line) && !parseAnyHeading(line))
    );
    if (plainCandidates.length > 0) {
      const fallbackChapterTempId = "c_1";
      chapters.push({
        tempId: fallbackChapterTempId,
        title: "Outline",
        sequenceNo: 1,
        unitTempId: null,
      });
      plainCandidates.forEach((title, index) => {
        lessons.push({
          title: formatOutlineTitle(title) ?? title,
          sequenceNo: index + 1,
          chapterTempId: fallbackChapterTempId,
          learningObjectives: null,
          content: null,
        });
      });
    }
  }

  return { units, chapters, lessons };
}

function dumpExtractedOutlineDebug(rawText: string, source: SyllabusMode) {
  const rawLines = rawText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const normalizedLines = normalizeSyllabusText(rawText);
  const numberedLines = normalizedLines.map((line, index) => `${index + 1}. ${line}`);
  const consoleDump = [
    "[Outline Debug Dump]",
    `Source: ${source ?? "unknown"}`,
    `Raw text chars: ${rawText.length}`,
    `Raw line count: ${rawLines.length}`,
    `Normalized line count: ${normalizedLines.length}`,
    numberedLines.join("\n"),
  ].join("\n");

  console.log(consoleDump);

  const preview = numberedLines.slice(0, 18).join("\n");
  const suffix =
    numberedLines.length > 18
      ? `\n\n...and ${numberedLines.length - 18} more line(s). Full dump is in console logs.`
      : "";

  Alert.alert(
    "OCR Debug Dump",
    `Source: ${source ?? "unknown"}\nNormalized lines: ${numberedLines.length}\n\n${preview}${suffix}`
  );
}

function isMissingUnitSchema(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("relation") && message.includes("units") && message.includes("does not exist")
  );
}

async function persistOutline(params: { subjectId: string; rawText: string; outline?: ParsedOutline }) {
  const { subjectId, rawText, outline: preParsedOutline } = params;
  const outline = preParsedOutline ?? parseOutlineFromText(rawText);
  if (outline.chapters.length === 0) {
    return {
      units: 0,
      chapters: 0,
      lessons: 0,
      usedUnits: false,
    };
  }

  const unitIdByTempId = new Map<string, string>();
  let usedUnits = false;

  if (outline.units.length > 0) {
    for (const unit of outline.units) {
      const { data, error } = await supabase
        .from("units")
        .insert({
          subject_id: subjectId,
          title: unit.title,
          description: unit.description ?? null,
          sequence_no: unit.sequenceNo,
          status: "published",
        })
        .select("unit_id")
        .single();
      if (error) {
        if (isMissingUnitSchema(error)) {
          unitIdByTempId.clear();
          break;
        }
        throw error;
      }
      unitIdByTempId.set(unit.tempId, String((data as { unit_id: string }).unit_id));
      usedUnits = true;
    }
  }

  const chapterIdByTempId = new Map<string, string>();
  for (const chapter of outline.chapters) {
    const resolvedUnitId = chapter.unitTempId ? unitIdByTempId.get(chapter.unitTempId) ?? null : null;
    const chapterPayload: Record<string, any> = {
      subject_id: subjectId,
      title: chapter.title,
      description: chapter.description ?? null,
      sequence_no: chapter.sequenceNo,
      status: "published",
    };
    if (resolvedUnitId) {
      chapterPayload.unit_id = resolvedUnitId;
    }

    const { data, error } = await supabase
      .from("chapters")
      .insert(chapterPayload)
      .select("chapter_id")
      .single();
    if (error) throw error;
    chapterIdByTempId.set(chapter.tempId, String((data as { chapter_id: string }).chapter_id));
  }

  let createdLessons = 0;
  for (const lesson of outline.lessons) {
    const chapterId = chapterIdByTempId.get(lesson.chapterTempId);
    if (!chapterId) continue;
    const { error } = await supabase.from("lessons").insert({
      chapter_id: chapterId,
      title: lesson.title,
      content: lesson.content ?? null,
      learning_objectives: lesson.learningObjectives ?? null,
      sequence_no: lesson.sequenceNo,
      status: "published",
    });
    if (error) throw error;
    createdLessons += 1;
  }

  return {
    units: usedUnits ? outline.units.length : 0,
    chapters: outline.chapters.length,
    lessons: createdLessons,
    usedUnits,
  };
}

function AnimatedToolBtn({
  active,
  cardBg,
  activeBorder,
  inactiveBorder,
  onPress,
  children,
  accessibilityLabel,
}: {
  active: boolean;
  cardBg: string;
  activeBorder: string;
  inactiveBorder: string;
  onPress: () => void;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View
      style={[
        styles.toolBtn,
        { borderColor: active ? activeBorder : inactiveBorder, backgroundColor: cardBg },
        animStyle,
      ]}
    >
      <Pressable
        style={styles.toolBtnInner}
        accessibilityRole={accessibilityLabel ? "button" : undefined}
        accessibilityLabel={accessibilityLabel}
        onPressIn={() => { scale.value = withTiming(0.88, { duration: 70 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 9, stiffness: 200 }); }}
        onPress={() => { Haptics.selectionAsync(); onPress(); }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

const SUBJECT_STEPS: StepDef[] = [
  {
    key: "details",
    title: "What are you teaching?",
    subtitle: "The basics — you can edit everything later.",
  },
  {
    key: "syllabus",
    title: "Add your syllabus",
    subtitle: "We'll turn it into chapters and lessons automatically.",
  },
  {
    key: "review",
    title: "Review & create",
    subtitle: "Tap a row to jump back and change it.",
  },
];

type SubjectFieldErrors = {
  title?: string;
  code?: string;
  institution?: string;
};

export default function SubjectScreen() {
  const { colors: c } = useAppTheme();
  const sub = useSubscriptionContext();
  const insets = useSafeAreaInsets();
  const regionCode = Localization.getLocales()[0]?.regionCode ?? null;
  const nowYear = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [institutions, setInstitutions] = useState<Institution[]>([]);

  const [stepIndex, setStepIndex] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<SubjectFieldErrors>({});

  const [overview, setOverview] = useState("");
  const [title, setTitle] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [year, setYear] = useState("");
  const [schoolYearStart, setSchoolYearStart] = useState<number | null>(null);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");
  const [schoolPickerOpen, setSchoolPickerOpen] = useState(false);
  const [schoolYearPickerOpen, setSchoolYearPickerOpen] = useState(false);
  const [schoolYearPickerYear, setSchoolYearPickerYear] = useState(nowYear);
  const [coverImageUri, setCoverImageUri] = useState<string | null>(null);
  const [syllabusMode, setSyllabusMode] = useState<SyllabusMode>(null);
  const [syllabusText, setSyllabusText] = useState("");
  const [syllabusImage, setSyllabusImage] = useState<PickedFile | null>(null);
  const [syllabusFile, setSyllabusFile] = useState<PickedFile | null>(null);

  // Extraction runs on step 2's Continue; results are cached so the final
  // save never re-uploads or re-extracts what we already have.
  const [extracting, setExtracting] = useState(false);
  const [extractStage, setExtractStage] = useState("");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [syllabusStoragePath, setSyllabusStoragePath] = useState<string | null>(null);

  const resetExtractionCache = () => {
    setExtractedText(null);
    setSyllabusStoragePath(null);
    setExtractError(null);
  };

  const academicYear = useMemo(() => {
    if (!schoolYearStart) return "";
    return formatAcademicYear(schoolYearStart);
  }, [schoolYearStart]);
  const selectedInstitution = useMemo(
    () => institutions.find((item) => item.school_id === selectedSchoolId) ?? null,
    [institutions, selectedSchoolId]
  );

  const loadSubjectForm = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("No signed-in user found.");

      setUserId(user.id);

      const { data, error } = await supabase
        .from("user_schools")
        .select("is_primary, school:schools(school_id, name)")
        .eq("user_id", user.id)
        .order("is_primary", { ascending: false });

      if (error) throw error;

      const mapped = (data ?? [])
        .map((row: any) => {
          const schoolRaw = row.school;
          const school = Array.isArray(schoolRaw) ? schoolRaw[0] : schoolRaw;
          if (!school?.school_id || !school?.name) return null;
          return {
            school_id: school.school_id as string,
            name: school.name as string,
            is_primary: Boolean(row?.is_primary),
          } satisfies Institution;
        })
        .filter((row: Institution | null): row is Institution => Boolean(row));

      setInstitutions(mapped);
      if (mapped.length > 0) {
        setSelectedSchoolId(mapped[0].school_id);
      }
    } catch (err: any) {
      Alert.alert("Unable to load subject form", err?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubjectForm();
  }, [loadSubjectForm]);

  const { refreshing, onRefresh } = usePullToRefresh(loadSubjectForm);

  const openSchoolYearPicker = () => {
    setSchoolYearPickerYear(schoolYearStart ?? nowYear);
    setSchoolYearPickerOpen(true);
  };

  const openSchoolPicker = () => {
    if (institutions.length === 0) return;
    setSchoolPickerOpen(true);
  };

  const applyPickedSchoolYear = () => {
    setSchoolYearStart(schoolYearPickerYear);
    setSchoolYearPickerOpen(false);
  };

  const pickCoverImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo library access to upload a cover image.");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    if (res.canceled) return;
    setCoverImageUri(res.assets[0]?.uri ?? null);
  };

  const pickSyllabusImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo library access to upload syllabus image.");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });
    if (res.canceled) return;

    const asset = res.assets[0];
    setSyllabusMode("image");
    setSyllabusImage({
      uri: asset.uri,
      name: asset.fileName || `syllabus_image_${Date.now()}.jpg`,
      mimeType: asset.mimeType || "image/jpeg",
    });
    setSyllabusFile(null);
    resetExtractionCache();
  };

  const pickSyllabusFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: "application/pdf",
    });
    if (res.canceled) return;

    const file = res.assets[0];
    setSyllabusMode("file");
    setSyllabusFile({
      uri: file.uri,
      name: file.name,
      mimeType: file.mimeType || "application/octet-stream",
    });
    setSyllabusImage(null);
    resetExtractionCache();
  };

  const selectSyllabusTextMode = () => {
    setSyllabusMode("text");
    setSyllabusImage(null);
    setSyllabusFile(null);
    resetExtractionCache();
  };

  const validateDetailsStep = () => {
    const errors: SubjectFieldErrors = {};
    if (!title.trim()) errors.title = "Subject title is required.";
    if (!subjectCode.trim()) errors.code = "Subject code is required.";
    if (!selectedSchoolId) errors.institution = "Choose an academic institution.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const skipSyllabusStep = () => {
    setSyllabusMode(null);
    setSyllabusText("");
    setSyllabusImage(null);
    setSyllabusFile(null);
    resetExtractionCache();
    setStepIndex(2);
  };

  const handleSyllabusContinue = async () => {
    setExtractError(null);

    if (syllabusMode === "text") {
      if (!syllabusText.trim()) {
        setExtractError("Add curriculum text, or choose an image or PDF instead.");
        return;
      }
      setStepIndex(2);
      return;
    }

    if (syllabusMode === "image" && syllabusImage) {
      if (extractedText !== null && syllabusStoragePath) {
        setStepIndex(2);
        return;
      }
      if (!userId) {
        setExtractError("Session error. Please sign in again.");
        return;
      }
      setExtracting(true);
      try {
        setExtractStage("Uploading image…");
        const storagePath =
          syllabusStoragePath ??
          (await uploadUriAsset({
            uri: syllabusImage.uri,
            userId,
            fileName: syllabusImage.name,
            mimeType: syllabusImage.mimeType,
            folder: "syllabus",
            scope: "subjects",
          }));
        setSyllabusStoragePath(storagePath);
        const text = await ocrImage(syllabusImage.uri, setExtractStage);
        setExtractedText(text);
        setStepIndex(2);
      } catch (err: any) {
        setExtractError(err?.message ?? "Could not read the image. Please try again.");
      } finally {
        setExtracting(false);
        setExtractStage("");
      }
      return;
    }

    if (syllabusMode === "file" && syllabusFile) {
      if (extractedText !== null && syllabusStoragePath) {
        setStepIndex(2);
        return;
      }
      if (!userId) {
        setExtractError("Session error. Please sign in again.");
        return;
      }
      setExtracting(true);
      try {
        setExtractStage("Uploading file…");
        const mimeType = syllabusFile.mimeType || guessMimeType(syllabusFile.name, "application/pdf");
        const storagePath =
          syllabusStoragePath ??
          (await uploadUriAsset({
            uri: syllabusFile.uri,
            userId,
            fileName: syllabusFile.name,
            mimeType,
            folder: "syllabus",
            scope: "subjects",
          }));
        setSyllabusStoragePath(storagePath);
        const text =
          mimeType === "application/pdf"
            ? await extractPdfTextFromStoragePath(storagePath, setExtractStage)
            : "";
        setExtractedText(text);
        setStepIndex(2);
      } catch (err: any) {
        setExtractError(err?.message ?? "Could not read the file. Please try again.");
      } finally {
        setExtracting(false);
        setExtractStage("");
      }
      return;
    }

    // Nothing selected — same as skipping.
    setStepIndex(2);
  };

  const handleSave = async () => {
    const normalizedTitle = title.trim();
    const normalizedCode = subjectCode.trim();
    const normalizedYear = year.trim();
    const normalizedAcademicYear = academicYear.trim();
    const normalizedOverview = overview.trim();

    if (!userId) {
      Alert.alert("Session error", "Please sign in again.");
      return;
    }
    if (!normalizedTitle) {
      Alert.alert("Missing title", "Subject title is required.");
      return;
    }
    if (!normalizedCode) {
      Alert.alert("Missing subject code", "Subject code is required.");
      return;
    }
    if (!selectedSchoolId) {
      Alert.alert("Missing institution", "Choose an academic institution.");
      return;
    }
    if (syllabusMode === "text" && !syllabusText.trim()) {
      Alert.alert("Missing curriculum text", "Add curriculum text or choose image/pdf.");
      return;
    }
    if (syllabusMode === "image" && !syllabusImage) {
      Alert.alert("Missing curriculum image", "Select an image to continue.");
      return;
    }
    if (syllabusMode === "file" && !syllabusFile) {
      Alert.alert("Missing curriculum file", "Select a PDF to continue.");
      return;
    }

    if (sub.subjectQuotaExceeded) {
      setPaywallVisible(true);
      return;
    }

    setSaving(true);
    try {
      let detectedOutlineText = "";
      let parsedDetectedOutline: ParsedOutline | null = null;

      let subjectImagePath: string | null = null;
      if (coverImageUri) {
        const inferredMime = guessMimeType(coverImageUri, "image/jpeg");
        const ext = guessExtension(inferredMime);
        const coverName = `subject_cover_${Date.now()}.${ext}`;
        subjectImagePath = await uploadUriAsset({
          uri: coverImageUri,
          userId,
          fileName: coverName,
          mimeType: inferredMime,
          folder: "cover",
          scope: "subjects",
        });
      }

      let syllabusValue: string | null = null;
      let syllabusKind: "text" | "image" | "file" | null = null;
      let syllabusMimeType: string | null = null;

      if (syllabusMode === "text" && syllabusText.trim()) {
        syllabusValue = syllabusText.trim();
        syllabusKind = "text";
        syllabusMimeType = "text/plain";
        detectedOutlineText = syllabusText.trim();
      }

      if (syllabusMode === "image" && syllabusImage) {
        // Reuse the upload + OCR from step 2 when available.
        syllabusValue =
          syllabusStoragePath ??
          (await uploadUriAsset({
            uri: syllabusImage.uri,
            userId,
            fileName: syllabusImage.name,
            mimeType: syllabusImage.mimeType,
            folder: "syllabus",
            scope: "subjects",
          }));
        syllabusKind = "image";
        syllabusMimeType = syllabusImage.mimeType || "image/jpeg";
        detectedOutlineText = extractedText ?? (await ocrImage(syllabusImage.uri));
      }

      if (syllabusMode === "file" && syllabusFile) {
        const mimeType = syllabusFile.mimeType || guessMimeType(syllabusFile.name, "application/pdf");
        syllabusValue =
          syllabusStoragePath ??
          (await uploadUriAsset({
            uri: syllabusFile.uri,
            userId,
            fileName: syllabusFile.name,
            mimeType,
            folder: "syllabus",
            scope: "subjects",
          }));
        syllabusKind = "file";
        syllabusMimeType = mimeType;
        if (mimeType === "application/pdf") {
          detectedOutlineText = extractedText ?? (await extractPdfTextFromStoragePath(syllabusValue));
        }
      }

      if (__DEV__ && detectedOutlineText.trim()) {
        dumpExtractedOutlineDebug(detectedOutlineText, syllabusMode);
      }
      if (detectedOutlineText.trim()) {
        parsedDetectedOutline = parseOutlineFromText(detectedOutlineText);
      }

      const { data: created, error: subjectError } = await supabase
        .from("subjects")
        .insert({
          school_id: selectedSchoolId,
          code: normalizedCode,
          title: normalizedTitle,
          year: normalizedYear || null,
          academic_year: normalizedAcademicYear || null,
          subject_image: subjectImagePath,
          syllabus: syllabusValue,
          syllabus_kind: syllabusKind,
          syllabus_mime_type: syllabusMimeType,
          description: normalizedOverview || null,
          unit_no:
            parsedDetectedOutline && parsedDetectedOutline.units.length > 0
              ? parsedDetectedOutline.units.length
              : null,
          status: "published",
        })
        .select("subject_id")
        .single();

      if (subjectError) throw subjectError;

      const subjectId = (created as { subject_id: string } | null)?.subject_id;
      if (!subjectId) throw new Error("Created subject id not returned.");

      const { error: userSubjectError } = await supabase.rpc("create_user_subject", {
        p_subject_id: subjectId,
      });
      if (userSubjectError) {
        if (userSubjectError.message?.includes("quota_exceeded")) {
          // Clean up the orphaned subject row before showing the paywall.
          await supabase.from("subjects").delete().eq("subject_id", subjectId);
          setSaving(false);
          setPaywallVisible(true);
          return;
        }
        throw userSubjectError;
      }

      let outlineSummary = "";
      if (detectedOutlineText.trim()) {
        try {
          const createdOutline = await persistOutline({
            subjectId,
            rawText: detectedOutlineText,
            outline: parsedDetectedOutline ?? undefined,
          });
          if (createdOutline.chapters > 0) {
            outlineSummary = ` Created ${createdOutline.chapters} chapter(s) and ${createdOutline.lessons} lesson(s)${
              createdOutline.usedUnits ? ` across ${createdOutline.units} unit(s).` : "."
            }`;
          }
        } catch (outlineError: any) {
          outlineSummary = ` Subject saved, but outline import failed: ${
            outlineError?.message ?? "Unknown error"
          }`;
        }
      }

      setOverview("");
      setTitle("");
      setSubjectCode("");
      setYear("");
      setSchoolYearStart(null);
      setCoverImageUri(null);
      setSyllabusMode(null);
      setSyllabusText("");
      setSyllabusImage(null);
      setSyllabusFile(null);
      setStepIndex(0);
      setFieldErrors({});
      resetExtractionCache();
      if (institutions.length > 0) {
        setSelectedSchoolId(institutions[0].school_id);
      } else {
        setSelectedSchoolId("");
      }

      Alert.alert("Subject created", `Your subject was saved successfully.${outlineSummary}`, [
        {
          text: "OK",
          onPress: () => router.replace("/library"),
        },
      ]);
    } catch (err: any) {
      if (String(err?.message || "").toLowerCase().includes("subjects_school_id_code_key")) {
        Alert.alert("Duplicate code", "This subject code already exists for the selected institution.");
      } else {
        Alert.alert("Could not create subject", err?.message ?? "Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.tint} />
      </View>
    );
  }

  const syllabusStatus = (() => {
    if (syllabusMode === "text" && syllabusText.trim()) {
      return `${syllabusText.trim().length.toLocaleString()} characters typed`;
    }
    if (extractedText !== null) {
      return extractedText.trim()
        ? `${extractedText.trim().length.toLocaleString()} characters extracted`
        : "No text detected";
    }
    if (syllabusMode === "image" && syllabusImage) return syllabusImage.name;
    if (syllabusMode === "file" && syllabusFile) return syllabusFile.name;
    return "Skipped";
  })();

  const stageProgress =
    extractStage === "Uploading image…" || extractStage === "Uploading file…"
      ? 0.25
      : extractStage === "Reading text…"
        ? 0.6
        : extractStage === "Cleaning up…"
          ? 0.9
          : 0;

  const handleNext = () => {
    if (stepIndex === 0) {
      if (validateDetailsStep()) setStepIndex(1);
      return;
    }
    if (stepIndex === 1) {
      void handleSyllabusContinue();
      return;
    }
    void handleSave();
  };

  const handleStepBack = () => {
    if (stepIndex === 0) {
      router.back();
      return;
    }
    setExtractError(null);
    setStepIndex(stepIndex - 1);
  };

  const nextLabel =
    stepIndex === 2 ? "Create subject" : stepIndex === 1 && extractError ? "Try again" : "Continue";
  const nextLoading = stepIndex === 1 ? extracting : stepIndex === 2 ? saving : false;

  const detailsStep = (
    <ScrollView
      contentContainerStyle={styles.stepScroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
    >
      <Input
        label="Subject title"
        value={title}
        onChangeText={(value) => {
          setTitle(value);
          if (fieldErrors.title) setFieldErrors((current) => ({ ...current, title: undefined }));
        }}
        placeholder="e.g. General Science"
        error={fieldErrors.title}
        containerStyle={styles.fieldGap}
      />

      <View style={styles.fieldRow}>
        <Input
          label="Subject code"
          value={subjectCode}
          onChangeText={(value) => {
            setSubjectCode(value);
            if (fieldErrors.code) setFieldErrors((current) => ({ ...current, code: undefined }));
          }}
          placeholder="e.g. SCI 7"
          autoCapitalize="characters"
          error={fieldErrors.code}
          containerStyle={styles.fieldFlex}
        />
        <Input
          label="Year level"
          value={year}
          onChangeText={setYear}
          placeholder="Optional"
          containerStyle={styles.fieldFlex}
        />
      </View>

      <View style={styles.fieldGap}>
        <Text
          style={[
            Typography.bodySm,
            styles.pickerLabel,
            { color: fieldErrors.institution ? c.danger : c.mutedText },
          ]}
        >
          Institution
        </Text>
        <Pressable
          onPress={() => {
            if (fieldErrors.institution) {
              setFieldErrors((current) => ({ ...current, institution: undefined }));
            }
            openSchoolPicker();
          }}
          disabled={institutions.length === 0}
          accessibilityRole="button"
          accessibilityLabel={`Institution: ${selectedInstitution?.name ?? "none selected"}`}
          style={[
            styles.pickerField,
            {
              backgroundColor: c.surfaceAlt,
              borderColor: fieldErrors.institution ? c.danger : c.border,
              opacity: institutions.length === 0 ? 0.6 : 1,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[Typography.body, styles.pickerValue, { color: selectedInstitution ? c.text : c.faintText }]}
          >
            {selectedInstitution?.name ??
              (institutions.length === 0 ? "No schools found" : "Choose institution")}
          </Text>
          <Ionicons name="chevron-down" size={16} color={c.mutedText} />
        </Pressable>
        {!!fieldErrors.institution && (
          <Text
            accessibilityLiveRegion="polite"
            style={[Typography.caption, styles.fieldError, { color: c.danger }]}
          >
            {fieldErrors.institution}
          </Text>
        )}
      </View>

      <View style={styles.fieldGap}>
        <Text style={[Typography.bodySm, styles.pickerLabel, { color: c.mutedText }]}>School year</Text>
        <Pressable
          onPress={openSchoolYearPicker}
          accessibilityRole="button"
          accessibilityLabel={`School year: ${schoolYearStart ? academicYear : "not set"}`}
          style={[styles.pickerField, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
        >
          <Text
            style={[Typography.body, styles.pickerValue, { color: schoolYearStart ? c.text : c.faintText }]}
          >
            {schoolYearStart ? academicYear : "Optional"}
          </Text>
          <Ionicons name="chevron-down" size={16} color={c.mutedText} />
        </Pressable>
      </View>

      <Input
        label="Description"
        value={overview}
        onChangeText={setOverview}
        placeholder="Brief description (optional)"
        multiline
        style={styles.multilineInput}
        containerStyle={styles.fieldGap}
      />

      <Pressable
        onPress={pickCoverImage}
        accessibilityRole="button"
        accessibilityLabel={coverImageUri ? "Change cover image" : "Add cover image"}
        style={[styles.coverControl, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
      >
        {coverImageUri ? (
          <Image source={{ uri: coverImageUri }} style={styles.coverThumb} />
        ) : (
          <View style={[styles.coverThumb, styles.coverThumbEmpty, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="image-outline" size={18} color={c.mutedText} />
          </View>
        )}
        <Text style={[Typography.bodySm, styles.coverLabel, { color: c.mutedText }]}>
          {coverImageUri ? "Change cover image" : "Add cover image (optional)"}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={c.faintText} />
      </Pressable>
    </ScrollView>
  );

  const syllabusStep = (
    <View style={styles.syllabusStep}>
      <Card variant="flat" padded={false} style={styles.dropZone}>
        {syllabusMode === "text" ? (
          <TextInput
            value={syllabusText}
            onChangeText={setSyllabusText}
            placeholder="Type or paste your syllabus…"
            placeholderTextColor={c.faintText}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Syllabus text"
            style={[Typography.body, styles.dropZoneTextInput, { color: c.text }]}
          />
        ) : syllabusMode === "image" && syllabusImage ? (
          <Image
            source={{ uri: syllabusImage.uri }}
            style={styles.dropZoneImage}
            resizeMode="cover"
            accessibilityLabel="Selected syllabus image"
          />
        ) : syllabusMode === "file" && syllabusFile ? (
          <View style={styles.dropZoneCenter}>
            <Ionicons name="document-outline" size={40} color={c.text} />
            <Text numberOfLines={3} style={[Typography.bodySm, styles.dropZoneFileName, { color: c.text }]}>
              {syllabusFile.name}
            </Text>
          </View>
        ) : (
          <View style={styles.dropZoneCenter}>
            <Ionicons name="cloud-upload-outline" size={40} color={c.faintText} />
            <Text style={[Typography.bodySm, styles.dropZoneHint, { color: c.mutedText }]}>
              Type it, snap a photo, or attach a PDF
            </Text>
          </View>
        )}
      </Card>

      <View style={styles.modeRow}>
        <AnimatedToolBtn
          active={syllabusMode === "text"}
          cardBg={c.card}
          activeBorder={c.tint}
          inactiveBorder={c.border}
          onPress={selectSyllabusTextMode}
          accessibilityLabel="Type syllabus text"
        >
          <Text style={[styles.toolText, { color: syllabusMode === "text" ? c.tint : c.text }]}>T</Text>
        </AnimatedToolBtn>

        <AnimatedToolBtn
          active={syllabusMode === "image"}
          cardBg={c.card}
          activeBorder={c.tint}
          inactiveBorder={c.border}
          onPress={pickSyllabusImage}
          accessibilityLabel="Upload syllabus image"
        >
          <Ionicons name="image-outline" size={20} color={syllabusMode === "image" ? c.tint : c.text} />
        </AnimatedToolBtn>

        <AnimatedToolBtn
          active={syllabusMode === "file"}
          cardBg={c.card}
          activeBorder={c.tint}
          inactiveBorder={c.border}
          onPress={pickSyllabusFile}
          accessibilityLabel="Upload syllabus PDF"
        >
          <Ionicons name="document-outline" size={20} color={syllabusMode === "file" ? c.tint : c.text} />
        </AnimatedToolBtn>
      </View>

      {extracting ? (
        <View style={styles.extractionWrap}>
          <ProgressBar value={stageProgress} accessibilityLabel="Syllabus extraction progress" />
          <Text
            accessibilityLiveRegion="polite"
            style={[Typography.caption, styles.extractionStage, { color: c.mutedText }]}
          >
            {extractStage || "Working…"}
          </Text>
        </View>
      ) : null}

      {extractError && !extracting ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[Typography.bodySm, styles.extractionError, { color: c.danger }]}
        >
          {extractError}
        </Text>
      ) : null}
    </View>
  );

  const reviewStep = (
    <ScrollView contentContainerStyle={styles.stepScroll} showsVerticalScrollIndicator={false}>
      <Card padded={false} style={styles.reviewCard}>
        <ListRow
          icon="book-outline"
          title="Title"
          value={title.trim() || "—"}
          onPress={() => setStepIndex(0)}
          accessibilityLabel={`Title: ${title.trim() || "not set"}. Edit`}
        />
        <ListRow
          icon="pricetag-outline"
          title="Code"
          value={subjectCode.trim() || "—"}
          onPress={() => setStepIndex(0)}
          accessibilityLabel={`Subject code: ${subjectCode.trim() || "not set"}. Edit`}
        />
        <ListRow
          icon="school-outline"
          title="Institution"
          value={selectedInstitution?.name ?? "—"}
          onPress={() => setStepIndex(0)}
          accessibilityLabel={`Institution: ${selectedInstitution?.name ?? "not set"}. Edit`}
        />
        <ListRow
          icon="calendar-outline"
          title="Year"
          value={[year.trim(), academicYear].filter(Boolean).join(" · ") || "—"}
          onPress={() => setStepIndex(0)}
          accessibilityLabel={`Year: ${[year.trim(), academicYear].filter(Boolean).join(", ") || "not set"}. Edit`}
        />
        <ListRow
          icon="document-text-outline"
          title="Syllabus"
          value={syllabusStatus}
          onPress={() => setStepIndex(1)}
          divider={false}
          accessibilityLabel={`Syllabus: ${syllabusStatus}. Edit`}
        />
      </Card>
    </ScrollView>
  );

  return (
    <View style={[styles.page, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <StepFlow
          steps={SUBJECT_STEPS}
          index={stepIndex}
          onBack={handleStepBack}
          backLabelOnFirst="Cancel"
          nextLabel={nextLabel}
          onNext={handleNext}
          nextLoading={nextLoading}
          footerExtra={
            stepIndex === 1 ? (
              <Button
                title="Skip for now"
                variant="ghost"
                onPress={skipSyllabusStep}
                disabled={extracting}
                accessibilityLabel="Skip adding a syllabus for now"
              />
            ) : undefined
          }
        >
          {stepIndex === 0 ? detailsStep : stepIndex === 1 ? syllabusStep : reviewStep}
        </StepFlow>
      </KeyboardAvoidingView>

      <Modal
        visible={schoolPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSchoolPickerOpen(false)}
      >
        <Pressable
          style={[styles.modalBackdrop, { backgroundColor: c.backdrop }]}
          onPress={() => setSchoolPickerOpen(false)}
        >
          <Pressable
            style={[styles.dateModalCard, { borderColor: c.border, backgroundColor: c.card }]}
            onPress={() => {}}
          >
            <Text style={[Typography.h3, styles.modalTitle, { color: c.text }]}>Pick Institution</Text>
            <View style={styles.schoolList}>
              {institutions.map((school) => {
                const selected = school.school_id === selectedSchoolId;
                return (
                  <Pressable
                    key={school.school_id}
                    accessibilityRole="button"
                    accessibilityLabel={school.name}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setSelectedSchoolId(school.school_id);
                      setFieldErrors((current) => ({ ...current, institution: undefined }));
                      setSchoolPickerOpen(false);
                    }}
                    style={[
                      styles.schoolOption,
                      {
                        borderColor: selected ? c.tint : c.border,
                        backgroundColor: selected ? c.tintSoft : c.card,
                      },
                    ]}
                  >
                    <Text style={[Typography.body, styles.schoolOptionText, { color: c.text }]}>
                      {school.name}
                    </Text>
                    {selected ? <Ionicons name="checkmark" size={18} color={c.tint} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={schoolYearPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSchoolYearPickerOpen(false)}
      >
        <Pressable
          style={[styles.modalBackdrop, { backgroundColor: c.backdrop }]}
          onPress={() => setSchoolYearPickerOpen(false)}
        >
          <Pressable
            style={[styles.dateModalCard, { borderColor: c.border, backgroundColor: c.card }]}
            onPress={() => {}}
          >
            <Text style={[Typography.h3, styles.modalTitle, { color: c.text }]}>Pick School Year</Text>
            <View style={styles.yearPickerCol}>
              <Picker
                selectedValue={schoolYearPickerYear}
                onValueChange={(value) => setSchoolYearPickerYear(Number(value))}
              >
                {Array.from({ length: 16 }).map((_, index) => {
                  const pickerYear = nowYear - 5 + index;
                  return (
                    <Picker.Item
                      key={pickerYear}
                      label={formatAcademicYear(pickerYear)}
                      value={pickerYear}
                    />
                  );
                })}
              </Picker>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set school year"
              style={[styles.modalDoneButton, { backgroundColor: c.tint }]}
              onPress={applyPickedSchoolYear}
            >
              <Text style={[Typography.bodyMedium, { color: c.onTint }]}>Set Year</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        quotaType="subject"
        regionCode={regionCode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  stepScroll: { paddingBottom: Spacing.xxl },
  fieldGap: { marginBottom: Spacing.lg },
  fieldRow: { flexDirection: "row", gap: Spacing.md },
  fieldFlex: { flex: 1, marginBottom: Spacing.lg },
  pickerLabel: { marginBottom: Spacing.xs, fontWeight: "500" },
  pickerField: {
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  pickerValue: { flex: 1 },
  fieldError: { marginTop: Spacing.xs },
  multilineInput: { minHeight: 84, textAlignVertical: "top" },
  coverControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  coverThumb: { width: 44, height: 44, borderRadius: Radius.sm },
  coverThumbEmpty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  coverLabel: { flex: 1, fontWeight: "500" },
  syllabusStep: { flex: 1 },
  dropZone: { minHeight: 240, maxHeight: 400, flexShrink: 1, overflow: "hidden" },
  dropZoneTextInput: { flex: 1, minHeight: 240, padding: Spacing.lg },
  dropZoneImage: { width: "100%", height: "100%", minHeight: 240 },
  dropZoneCenter: {
    flex: 1,
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  dropZoneFileName: { textAlign: "center" },
  dropZoneHint: { textAlign: "center" },
  modeRow: { flexDirection: "row", justifyContent: "center", gap: Spacing.md, marginTop: Spacing.lg },
  toolBtn: { width: 52, height: 52, borderRadius: Radius.md, borderWidth: 1.5, overflow: "hidden" },
  toolBtnInner: { flex: 1, alignItems: "center", justifyContent: "center" },
  toolText: { fontSize: 22, fontWeight: "700" },
  extractionWrap: { marginTop: Spacing.lg, gap: Spacing.sm },
  extractionStage: { textAlign: "center" },
  extractionError: { marginTop: Spacing.lg, textAlign: "center" },
  reviewCard: { paddingHorizontal: Spacing.lg },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: Spacing.lg },
  dateModalCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  yearPickerCol: { minHeight: 180, justifyContent: "center" },
  modalTitle: { marginBottom: Spacing.xs },
  schoolList: { gap: Spacing.sm },
  schoolOption: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  schoolOptionText: { flex: 1 },
  modalDoneButton: {
    alignSelf: "flex-end",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
  },
});
