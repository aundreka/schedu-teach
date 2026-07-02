import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Radius, Spacing, Typography } from "../../../constants/fonts";
import { useAppTheme } from "../../../context/theme";
import { usePullToRefresh } from "../../../hooks/usePullToRefresh";
import { supabase } from "../../../lib/supabase";
import {
  extractPdfTextFromStoragePath,
  guessMimeType,
  ocrImage,
  uploadUriAsset,
} from "../../../lib/extraction";
import {
  Button,
  Card,
  Input,
  ListRow,
  ProgressBar,
  StepFlow,
  type StepDef,
} from "../../../components/ui";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

type SubjectOption = {
  subject_id: string;
  school_id: string;
  code: string;
  title: string;
};

type ChapterOption = {
  chapter_id: string;
  subject_id: string;
  title: string;
  sequence_no: number;
  lessonSequenceNos: number[];
};

type PickedAsset = {
  uri: string;
  name: string;
  mimeType: string;
};

type UploadMode = "text" | "image" | "file" | null;

function getParamValue(value?: string | string[]) {
  if (!value) return "";
  return Array.isArray(value) ? String(value[0] ?? "") : String(value);
}

const LESSON_SECTION_HEADINGS = new Set([
  "lesson",
  "chapter",
  "unit",
  "objectives",
  "learning objectives",
  "goals",
  "materials",
  "resources",
  "procedure",
  "procedures",
  "activity",
  "activities",
  "discussion",
  "introduction",
  "motivation",
  "presentation",
  "practice",
  "guided practice",
  "independent practice",
  "assessment",
  "evaluation",
  "summary",
  "review",
  "assignment",
  "homework",
  "references",
  "source",
  "sources",
  "key concepts",
  "examples",
  "content",
]);

function toTitleCase(text: string) {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeInlineSpacing(text: string) {
  return text
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .trim();
}

function stripOcrNoise(line: string) {
  return normalizeInlineSpacing(
    line
      .replace(/[|¦]+/g, " ")
      .replace(/[~_]{2,}/g, " ")
      .replace(/[^\S\r\n]*[•●◦▪■□◆◇]+[^\S\r\n]*/g, " • ")
      .replace(/^[\s"'`~|\\/_\-.,:;]+/, "")
      .replace(/[\s"'`~|\\/_\-.,:;]+$/, "")
  );
}

function isLikelyPageNoise(line: string) {
  const value = line.trim();
  if (!value) return true;
  if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(value)) return true;
  if (/^\d+\s+of\s+\d+$/i.test(value)) return true;
  if (/^\d{1,4}$/.test(value)) return true;
  if (/^[^\w]{1,4}$/.test(value)) return true;
  return false;
}

function isHeadingLine(line: string) {
  const value = line.replace(/[:.]+$/, "").trim();
  if (!value || value.length > 80) return false;
  if (/^(lesson|chapter|unit)\s+[0-9ivxlcdm]+/i.test(value)) return true;
  return LESSON_SECTION_HEADINGS.has(value.toLowerCase());
}

function normalizeHeading(line: string) {
  const value = normalizeInlineSpacing(line.replace(/[:.]+$/, "").trim());
  const numberedHeading = value.match(/^(lesson|chapter|unit)\s+([0-9ivxlcdm]+)(.*)$/i);
  if (numberedHeading) {
    const label = toTitleCase(numberedHeading[1]);
    const sequence = numberedHeading[2].toUpperCase();
    const rest = normalizeInlineSpacing(numberedHeading[3] ?? "").replace(/^[-:)\].\s]+/, "");
    return rest ? `${label} ${sequence}: ${capitalizeSentence(rest)}` : `${label} ${sequence}`;
  }
  return toTitleCase(value);
}

function isBulletLine(line: string) {
  return /^([•●◦▪■□◆◇*\-–—]|\d+[.)]|[A-Za-z][.)])\s+/.test(line.trim());
}

function normalizeBulletLine(line: string) {
  const value = line.trim().replace(/^([•●◦▪■□◆◇*\-–—]|\d+[.)]|[A-Za-z][.)])\s+/, "");
  return `- ${capitalizeSentence(value)}`;
}

function capitalizeSentence(text: string) {
  const value = normalizeInlineSpacing(text);
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shouldJoinWithPrevious(previous: string, next: string) {
  if (!previous || !next) return false;
  if (isHeadingLine(previous) || isHeadingLine(next)) return false;
  if (isBulletLine(previous) || isBulletLine(next)) return false;
  if (/[.!?:]$/.test(previous)) return false;
  if (/^(and|but|or|so|because|which|that|who|when|where|while|using|with|for|to|of|in|on)\b/i.test(next)) {
    return true;
  }
  if (/^[a-z(]/.test(next)) return true;
  if (/[,;]$/.test(previous)) return true;
  if (previous.length < 70 && next.length < 70) return true;
  return false;
}

function splitLineIntoSegments(line: string) {
  return line
    .split(/\s{2,}/)
    .map((part) => stripOcrNoise(part))
    .filter(Boolean);
}

function formatExtractedLessonText(rawText: string) {
  const normalizedLines = rawText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .flatMap((line) => splitLineIntoSegments(line))
    .map((line) => stripOcrNoise(line))
    .filter((line) => line.length > 0)
    .filter((line) => !isLikelyPageNoise(line));

  const dedupedLines: string[] = [];
  const seen = new Set<string>();
  for (const line of normalizedLines) {
    const key = line.toLowerCase();
    if (seen.has(key) && (isHeadingLine(line) || line.length <= 40)) continue;
    seen.add(key);
    dedupedLines.push(line);
  }

  const mergedLines: string[] = [];
  for (const line of dedupedLines) {
    if (mergedLines.length === 0) {
      mergedLines.push(line);
      continue;
    }

    const previous = mergedLines[mergedLines.length - 1];
    if (shouldJoinWithPrevious(previous, line)) {
      mergedLines[mergedLines.length - 1] = normalizeInlineSpacing(`${previous} ${line}`);
      continue;
    }

    mergedLines.push(line);
  }

  const formattedLines: string[] = [];
  let previousType: "heading" | "bullet" | "paragraph" | null = null;

  for (const line of mergedLines) {
    let nextLine = line;
    let currentType: "heading" | "bullet" | "paragraph";

    if (isHeadingLine(nextLine)) {
      nextLine = normalizeHeading(nextLine);
      currentType = "heading";
    } else if (isBulletLine(nextLine)) {
      nextLine = normalizeBulletLine(nextLine);
      currentType = "bullet";
    } else {
      nextLine = capitalizeSentence(nextLine);
      currentType = "paragraph";
    }

    if (formattedLines.length > 0) {
      const last = formattedLines[formattedLines.length - 1];
      if (last !== "") {
        const needsSpacing =
          currentType === "heading" ||
          previousType === "heading" ||
          currentType !== previousType;
        if (needsSpacing) {
          formattedLines.push("");
        }
      }
    }

    formattedLines.push(nextLine);
    previousType = currentType;
  }

  return formattedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildLessonContent(params: {
  text: string;
  imageStoragePath: string | null;
  fileStoragePath: string | null;
  formatting: string;
}) {
  const sections: string[] = [];
  const normalizedText = params.text.trim();
  const normalizedFormatting = params.formatting.trim();

  if (normalizedText) sections.push(normalizedText);

  if (params.imageStoragePath || params.fileStoragePath) {
    const attachments: string[] = [];
    if (params.imageStoragePath) attachments.push(`Image: ${params.imageStoragePath}`);
    if (params.fileStoragePath) attachments.push(`File: ${params.fileStoragePath}`);
    sections.push(`Source\n${attachments.map((item) => `- ${item}`).join("\n")}`);
  }

  if (normalizedFormatting) {
    sections.push(`Formatting Lesson:\n${normalizedFormatting}`);
  }

  return sections.join("\n\n").trim() || null;
}

function AnimatedUploadBtn({
  active,
  activeBg,
  inactiveBg,
  onPress,
  children,
  accessibilityLabel,
}: {
  active: boolean;
  activeBg: string;
  inactiveBg: string;
  onPress: () => void;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.uploadActionButton, { backgroundColor: active ? activeBg : inactiveBg }, animStyle]}>
      <Pressable
        style={styles.uploadActionInner}
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

const LESSON_STEPS: StepDef[] = [
  {
    key: "placement",
    title: "Where does this lesson go?",
    subtitle: "Pick the subject and where the lesson sits.",
  },
  {
    key: "content",
    title: "Add the lesson content",
    subtitle: "Type it, snap a photo, or attach a file.",
  },
  {
    key: "review",
    title: "Review & add",
    subtitle: "Tap a row to jump back and change it.",
  },
];

type LessonFieldErrors = {
  subject?: string;
  lessonNumber?: string;
};

export default function CreateLessonScreen() {
  const { colors: c } = useAppTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    subjectId?: string | string[];
    chapterId?: string | string[];
    chapterNumber?: string | string[];
    lessonNumber?: string | string[];
  }>();
  const requestedSubjectId = useMemo(() => getParamValue(params.subjectId), [params.subjectId]);
  const requestedChapterId = useMemo(() => getParamValue(params.chapterId), [params.chapterId]);
  const requestedChapterNumber = useMemo(() => getParamValue(params.chapterNumber), [params.chapterNumber]);
  const requestedLessonNumber = useMemo(() => getParamValue(params.lessonNumber), [params.lessonNumber]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState("");
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [chapters, setChapters] = useState<ChapterOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [chapterNumber, setChapterNumber] = useState("");
  const [lessonNumber, setLessonNumber] = useState("");
  const [title, setTitle] = useState("");
  const [lessonText, setLessonText] = useState("");
  const [formatting, setFormatting] = useState("");
  const [uploadMode, setUploadMode] = useState<UploadMode>(null);
  const [imageAsset, setImageAsset] = useState<PickedAsset | null>(null);
  const [fileAsset, setFileAsset] = useState<PickedAsset | null>(null);
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const selectedSubjectIdRef = useRef("");

  const [stepIndex, setStepIndex] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<LessonFieldErrors>({});

  // Extraction runs on step 2's Continue; results are cached so the final
  // save never re-uploads or re-extracts what we already have.
  const [extracting, setExtracting] = useState(false);
  const [extractStage, setExtractStage] = useState("");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [imageStoragePath, setImageStoragePath] = useState<string | null>(null);
  const [fileStoragePath, setFileStoragePath] = useState<string | null>(null);

  const resetExtractionCache = () => {
    setExtractedText(null);
    setImageStoragePath(null);
    setFileStoragePath(null);
    setExtractError(null);
  };

  useEffect(() => {
    selectedSubjectIdRef.current = selectedSubjectId;
  }, [selectedSubjectId]);

  const loadChapters = useCallback(async (subjectId: string) => {
    if (!subjectId) {
      setChapters([]);
      return [] as ChapterOption[];
    }

    const { data, error } = await supabase
      .from("chapters")
      .select("chapter_id, subject_id, title, sequence_no, lessons(lesson_id, sequence_no)")
      .eq("subject_id", subjectId)
      .order("sequence_no", { ascending: true });
    if (error) throw error;

    const mapped = (data ?? []).map((row: any) => ({
      chapter_id: String(row.chapter_id),
      subject_id: String(row.subject_id),
      title: String(row.title),
      sequence_no: Number(row.sequence_no ?? 0),
      lessonSequenceNos: (row?.lessons ?? [])
        .map((lesson: any) => Number(lesson.sequence_no ?? 0))
        .filter((value: number) => Number.isFinite(value) && value > 0)
        .sort((a: number, b: number) => a - b),
    }));

    setChapters(mapped);
    return mapped;
  }, []);

  const loadBase = useCallback(async () => {
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
        .from("user_subjects")
        .select("subject:subjects(subject_id, school_id, code, title)")
        .eq("user_id", user.id);
      if (error) throw error;

      const mappedSubjects = (data ?? [])
        .map((row: any) => {
          const subjectRaw = row?.subject;
          const subject = Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw;
          if (!subject?.subject_id || !subject?.school_id || !subject?.code || !subject?.title) return null;
          return {
            subject_id: String(subject.subject_id),
            school_id: String(subject.school_id),
            code: String(subject.code),
            title: String(subject.title),
          } satisfies SubjectOption;
        })
        .filter((item: SubjectOption | null): item is SubjectOption => Boolean(item))
        .sort((a, b) => `${a.code} ${a.title}`.localeCompare(`${b.code} ${b.title}`));

      setSubjects(mappedSubjects);

      const nextSubjectId =
        (requestedSubjectId && mappedSubjects.some((item) => item.subject_id === requestedSubjectId) && requestedSubjectId) ||
        (selectedSubjectIdRef.current &&
          mappedSubjects.some((item) => item.subject_id === selectedSubjectIdRef.current) &&
          selectedSubjectIdRef.current) ||
        "";

      setSelectedSubjectId(nextSubjectId);

      if (!nextSubjectId) {
        setChapters([]);
        setChapterNumber("");
        setLessonNumber("");
      } else {
        const loadedChapters = await loadChapters(nextSubjectId);
        if (requestedChapterId) {
          const requestedChapter =
            loadedChapters.find((item) => item.chapter_id === requestedChapterId) ?? null;
          setChapterNumber(requestedChapter ? String(requestedChapter.sequence_no) : "");
        } else if (requestedChapterNumber) {
          setChapterNumber(requestedChapterNumber);
        }

        if (requestedLessonNumber) {
          setLessonNumber(requestedLessonNumber);
        }
      }
    } catch (err: any) {
      Alert.alert("Unable to load lesson form", err?.message ?? "Please try again.");
      setSubjects([]);
      setChapters([]);
      setSelectedSubjectId("");
      setChapterNumber("");
      setLessonNumber("");
    } finally {
      setLoading(false);
    }
  }, [loadChapters, requestedChapterId, requestedChapterNumber, requestedLessonNumber, requestedSubjectId]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  const { refreshing, onRefresh } = usePullToRefresh(loadBase);

  const selectedSubject = useMemo(
    () => subjects.find((item) => item.subject_id === selectedSubjectId) ?? null,
    [selectedSubjectId, subjects]
  );

  const normalizedChapterNumber = useMemo(() => {
    const value = Number(chapterNumber.trim());
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  }, [chapterNumber]);

  const normalizedLessonNumber = useMemo(() => {
    const value = Number(lessonNumber.trim());
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  }, [lessonNumber]);

  const matchingChapter = useMemo(() => {
    if (!normalizedChapterNumber) return null;
    return chapters.find((item) => item.sequence_no === normalizedChapterNumber) ?? null;
  }, [chapters, normalizedChapterNumber]);


  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/create");
  };

  const handlePickSubject = async (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setSubjectPickerOpen(false);
    setFieldErrors((current) => ({ ...current, subject: undefined }));
    setChapterNumber("");
    setLessonNumber("");

    try {
      await loadChapters(subjectId);
    } catch (err: any) {
      Alert.alert("Unable to load chapters", err?.message ?? "Please try again.");
      setChapters([]);
    }
  };

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo library access to upload an image.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    setImageAsset({
      uri: asset.uri,
      name: asset.fileName || `lesson_image_${Date.now()}.jpg`,
      mimeType: asset.mimeType || "image/jpeg",
    });
    setFileAsset(null);
    setUploadMode("image");
    resetExtractionCache();
  };

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
      ],
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    setFileAsset({
      uri: asset.uri,
      name: asset.name,
      mimeType: guessMimeType(asset.name, asset.mimeType),
    });
    setImageAsset(null);
    setUploadMode("file");
    resetExtractionCache();
  };

  const selectTextMode = () => {
    setUploadMode("text");
    setImageAsset(null);
    setFileAsset(null);
    resetExtractionCache();
  };

  const validatePlacementStep = () => {
    const errors: LessonFieldErrors = {};
    if (!selectedSubject) errors.subject = "Choose a subject.";
    if (!normalizedLessonNumber) errors.lessonNumber = "Enter a lesson number.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const skipContentStep = () => {
    setUploadMode(null);
    setLessonText("");
    setImageAsset(null);
    setFileAsset(null);
    resetExtractionCache();
    setStepIndex(2);
  };

  const handleContentContinue = async () => {
    setExtractError(null);

    if (uploadMode === "image" && imageAsset) {
      if (extractedText !== null && imageStoragePath) {
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
          imageStoragePath ??
          (await uploadUriAsset({
            uri: imageAsset.uri,
            userId,
            fileName: imageAsset.name,
            mimeType: imageAsset.mimeType,
            folder: "image",
            scope: "lessons",
          }));
        setImageStoragePath(storagePath);
        const text = formatExtractedLessonText(await ocrImage(imageAsset.uri, setExtractStage));
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

    if (uploadMode === "file" && fileAsset) {
      if (extractedText !== null && fileStoragePath) {
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
        const mimeType = fileAsset.mimeType || guessMimeType(fileAsset.name, "application/octet-stream");
        const storagePath =
          fileStoragePath ??
          (await uploadUriAsset({
            uri: fileAsset.uri,
            userId,
            fileName: fileAsset.name,
            mimeType,
            folder: "file",
            scope: "lessons",
          }));
        setFileStoragePath(storagePath);
        const text =
          mimeType === "application/pdf"
            ? formatExtractedLessonText(await extractPdfTextFromStoragePath(storagePath, setExtractStage))
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

    // Typed text (or nothing selected) needs no extraction.
    setStepIndex(2);
  };

  const handleSave = async () => {
    if (!userId) {
      Alert.alert("Session error", "Please sign in again.");
      return;
    }
    if (!selectedSubject) {
      Alert.alert("Subject required", "Choose a subject first.");
      return;
    }
    if (!normalizedLessonNumber) {
      Alert.alert("Lesson required", "Enter a lesson number.");
      return;
    }

    setSaving(true);
    try {
      let lessonImagePath: string | null = null;
      let lessonFilePath: string | null = null;
      let extractedLessonText = "";

      if (uploadMode === "image" && imageAsset) {
        // Reuse the upload + OCR from step 2 when available.
        lessonImagePath =
          imageStoragePath ??
          (await uploadUriAsset({
            uri: imageAsset.uri,
            userId,
            fileName: imageAsset.name,
            mimeType: imageAsset.mimeType,
            folder: "image",
            scope: "lessons",
          }));
        extractedLessonText =
          extractedText ?? formatExtractedLessonText(await ocrImage(imageAsset.uri));
      }

      if (uploadMode === "file" && fileAsset) {
        const mimeType = fileAsset.mimeType || guessMimeType(fileAsset.name, "application/octet-stream");
        lessonFilePath =
          fileStoragePath ??
          (await uploadUriAsset({
            uri: fileAsset.uri,
            userId,
            fileName: fileAsset.name,
            mimeType,
            folder: "file",
            scope: "lessons",
          }));
        if (mimeType === "application/pdf") {
          extractedLessonText =
            extractedText ??
            formatExtractedLessonText(await extractPdfTextFromStoragePath(lessonFilePath));
        }
      }

      let chapterToUse = matchingChapter;

      if (!chapterToUse && normalizedChapterNumber) {
        const { data: insertedChapter, error: chapterInsertError } = await supabase
          .from("chapters")
          .insert({
            subject_id: selectedSubject.subject_id,
            title: `Chapter ${normalizedChapterNumber}`,
            sequence_no: normalizedChapterNumber,
            status: "draft",
          })
          .select("chapter_id, subject_id, title, sequence_no")
          .single();
        if (chapterInsertError) throw chapterInsertError;

        chapterToUse = {
          chapter_id: String(insertedChapter.chapter_id),
          subject_id: String(insertedChapter.subject_id),
          title: String(insertedChapter.title),
          sequence_no: Number(insertedChapter.sequence_no ?? normalizedChapterNumber),
          lessonSequenceNos: [],
        };
        setChapters((current) =>
          [...current, chapterToUse!].sort((a, b) => a.sequence_no - b.sequence_no)
        );
      }

      if (!chapterToUse && !normalizedChapterNumber) {
        const generalChapter = chapters.find((item) => item.title.trim().toLowerCase() === "general") ?? null;
        if (generalChapter) {
          chapterToUse = generalChapter;
        } else {
          const nextChapterSequence =
            chapters.reduce((max, item) => Math.max(max, item.sequence_no), 0) + 1;
          const { data: insertedChapter, error: chapterInsertError } = await supabase
            .from("chapters")
            .insert({
              subject_id: selectedSubject.subject_id,
              title: "General",
              sequence_no: nextChapterSequence,
              status: "draft",
            })
            .select("chapter_id, subject_id, title, sequence_no")
            .single();
          if (chapterInsertError) throw chapterInsertError;

          chapterToUse = {
            chapter_id: String(insertedChapter.chapter_id),
            subject_id: String(insertedChapter.subject_id),
            title: String(insertedChapter.title),
            sequence_no: Number(insertedChapter.sequence_no ?? nextChapterSequence),
            lessonSequenceNos: [],
          };
          setChapters((current) =>
            [...current, chapterToUse!].sort((a, b) => a.sequence_no - b.sequence_no)
          );
        }
      }

      if (!chapterToUse) {
        throw new Error("Could not resolve a chapter for this lesson.");
      }

      if (chapterToUse.lessonSequenceNos.includes(normalizedLessonNumber)) {
        Alert.alert("Lesson number in use", "That lesson number already exists in this chapter.");
        return;
      }

      const normalizedTitle = title.trim() || `Lesson ${normalizedLessonNumber}`;
      const content = buildLessonContent({
        text: lessonText.trim() || extractedLessonText,
        imageStoragePath: lessonImagePath,
        fileStoragePath: lessonFilePath,
        formatting,
      });

      const { error } = await supabase.from("lessons").insert({
        chapter_id: chapterToUse.chapter_id,
        title: normalizedTitle,
        content,
        sequence_no: normalizedLessonNumber,
        status: "draft",
      });
      if (error) throw error;

      Alert.alert("Lesson created", "The lesson was saved.", [
        {
          text: "OK",
          onPress: () =>
            router.replace({
              pathname: "/library/subject_detail",
              params: { subjectId: selectedSubject.subject_id, openChapterId: chapterToUse.chapter_id },
            }),
        },
      ]);
    } catch (err: any) {
      Alert.alert("Could not create lesson", err?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.tint} />
      </View>
    );
  }

  const contentStatus = (() => {
    if (uploadMode === "text" && lessonText.trim()) {
      return `${lessonText.trim().length.toLocaleString()} characters typed`;
    }
    if (extractedText !== null) {
      return extractedText.trim()
        ? `${extractedText.trim().length.toLocaleString()} characters extracted`
        : "No text detected";
    }
    if (uploadMode === "image" && imageAsset) return imageAsset.name;
    if (uploadMode === "file" && fileAsset) return fileAsset.name;
    return "Skipped";
  })();

  const chapterSummary = matchingChapter
    ? `Ch. ${matchingChapter.sequence_no} · ${matchingChapter.title}`
    : normalizedChapterNumber
      ? `Chapter ${normalizedChapterNumber} (new)`
      : "General (auto)";

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
      if (validatePlacementStep()) setStepIndex(1);
      return;
    }
    if (stepIndex === 1) {
      void handleContentContinue();
      return;
    }
    void handleSave();
  };

  const handleStepBack = () => {
    if (stepIndex === 0) {
      handleBack();
      return;
    }
    setExtractError(null);
    setStepIndex(stepIndex - 1);
  };

  const nextLabel =
    stepIndex === 2 ? "Create lesson" : stepIndex === 1 && extractError ? "Try again" : "Continue";
  const nextLoading = stepIndex === 1 ? extracting : stepIndex === 2 ? saving : false;

  const placementStep = (
    <ScrollView
      contentContainerStyle={styles.stepScroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
    >
      <View style={styles.fieldGap}>
        <Text
          style={[
            Typography.bodySm,
            styles.pickerLabel,
            { color: fieldErrors.subject ? c.danger : c.mutedText },
          ]}
        >
          Subject
        </Text>
        <Pressable
          onPress={() => setSubjectPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Subject: ${
            selectedSubject ? `${selectedSubject.code} - ${selectedSubject.title}` : "none selected"
          }`}
          style={[
            styles.pickerField,
            {
              backgroundColor: c.surfaceAlt,
              borderColor: fieldErrors.subject ? c.danger : c.border,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[Typography.body, styles.pickerValue, { color: selectedSubject ? c.text : c.faintText }]}
          >
            {selectedSubject ? `${selectedSubject.code} - ${selectedSubject.title}` : "Choose subject"}
          </Text>
          <Ionicons name="chevron-down" size={16} color={c.mutedText} />
        </Pressable>
        {!!fieldErrors.subject && (
          <Text
            accessibilityLiveRegion="polite"
            style={[Typography.caption, styles.fieldError, { color: c.danger }]}
          >
            {fieldErrors.subject}
          </Text>
        )}
      </View>

      <View style={styles.fieldRow}>
        <Input
          label="Chapter number"
          value={chapterNumber}
          onChangeText={(value) => setChapterNumber(value.replace(/[^0-9]/g, ""))}
          placeholder="Optional"
          keyboardType="number-pad"
          helper={matchingChapter ? matchingChapter.title : undefined}
          containerStyle={styles.fieldFlex}
        />
        <Input
          label="Lesson number"
          value={lessonNumber}
          onChangeText={(value) => {
            setLessonNumber(value.replace(/[^0-9]/g, ""));
            if (fieldErrors.lessonNumber) {
              setFieldErrors((current) => ({ ...current, lessonNumber: undefined }));
            }
          }}
          placeholder="e.g. 1"
          keyboardType="number-pad"
          error={fieldErrors.lessonNumber}
          containerStyle={styles.fieldFlex}
        />
      </View>

      <Input
        label="Title"
        value={title}
        onChangeText={setTitle}
        placeholder="Optional — defaults to the lesson number"
        containerStyle={styles.fieldGap}
      />
    </ScrollView>
  );

  const contentStep = (
    <View style={styles.contentStep}>
      <Card variant="flat" padded={false} style={styles.dropZone}>
        {uploadMode === "text" ? (
          <TextInput
            value={lessonText}
            onChangeText={setLessonText}
            placeholder="Paste or type lesson content here."
            placeholderTextColor={c.faintText}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Lesson content text"
            style={[Typography.body, styles.dropZoneTextInput, { color: c.text }]}
          />
        ) : uploadMode === "image" && imageAsset ? (
          <Image
            source={{ uri: imageAsset.uri }}
            style={styles.dropZoneImage}
            resizeMode="cover"
            accessibilityLabel="Selected lesson image"
          />
        ) : uploadMode === "file" && fileAsset ? (
          <View style={styles.dropZoneCenter}>
            <Ionicons name="document-outline" size={40} color={c.text} />
            <Text numberOfLines={3} style={[Typography.bodySm, styles.dropZoneFileName, { color: c.text }]}>
              {fileAsset.name}
            </Text>
          </View>
        ) : (
          <View style={styles.dropZoneCenter}>
            <Ionicons name="cloud-upload-outline" size={40} color={c.faintText} />
            <Text style={[Typography.bodySm, styles.dropZoneHint, { color: c.mutedText }]}>
              Select text, image, or file for this lesson.
            </Text>
          </View>
        )}
      </Card>

      <View style={styles.modeRow}>
        <AnimatedUploadBtn
          active={uploadMode === "text"}
          activeBg={c.tintSoft}
          inactiveBg={c.surfaceAlt}
          onPress={selectTextMode}
          accessibilityLabel="Type lesson text"
        >
          <Text style={[styles.uploadActionText, { color: uploadMode === "text" ? c.tintDeep : c.text }]}>
            T
          </Text>
        </AnimatedUploadBtn>

        <AnimatedUploadBtn
          active={uploadMode === "image"}
          activeBg={c.tintSoft}
          inactiveBg={c.surfaceAlt}
          onPress={handlePickImage}
          accessibilityLabel="Attach image"
        >
          <Ionicons name="image-outline" size={24} color={uploadMode === "image" ? c.tintDeep : c.text} />
        </AnimatedUploadBtn>

        <AnimatedUploadBtn
          active={uploadMode === "file"}
          activeBg={c.tintSoft}
          inactiveBg={c.surfaceAlt}
          onPress={handlePickFile}
          accessibilityLabel="Attach file"
        >
          <Ionicons name="document-outline" size={24} color={uploadMode === "file" ? c.tintDeep : c.text} />
        </AnimatedUploadBtn>
      </View>

      {extracting ? (
        <View style={styles.extractionWrap}>
          <ProgressBar value={stageProgress} accessibilityLabel="Lesson content extraction progress" />
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
    <ScrollView contentContainerStyle={styles.stepScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Card padded={false} style={styles.reviewCard}>
        <ListRow
          icon="book-outline"
          title="Subject"
          value={selectedSubject ? `${selectedSubject.code} - ${selectedSubject.title}` : "—"}
          onPress={() => setStepIndex(0)}
          accessibilityLabel={`Subject: ${
            selectedSubject ? `${selectedSubject.code} - ${selectedSubject.title}` : "not set"
          }. Edit`}
        />
        <ListRow
          icon="albums-outline"
          title="Chapter"
          value={chapterSummary}
          onPress={() => setStepIndex(0)}
          accessibilityLabel={`Chapter: ${chapterSummary}. Edit`}
        />
        <ListRow
          icon="list-outline"
          title="Lesson number"
          value={normalizedLessonNumber ? String(normalizedLessonNumber) : "—"}
          onPress={() => setStepIndex(0)}
          accessibilityLabel={`Lesson number: ${normalizedLessonNumber ?? "not set"}. Edit`}
        />
        <ListRow
          icon="text-outline"
          title="Title"
          value={title.trim() || (normalizedLessonNumber ? `Lesson ${normalizedLessonNumber}` : "—")}
          onPress={() => setStepIndex(0)}
          accessibilityLabel={`Title: ${title.trim() || "auto"}. Edit`}
        />
        <ListRow
          icon="document-text-outline"
          title="Content"
          value={contentStatus}
          onPress={() => setStepIndex(1)}
          divider={false}
          accessibilityLabel={`Content: ${contentStatus}. Edit`}
        />
      </Card>

      <Input
        label="Formatting (optional)"
        value={formatting}
        onChangeText={setFormatting}
        placeholder="(No bullet points, precise descriptions, summarized descriptions, etc.)"
        multiline
        style={styles.multilineInput}
        containerStyle={styles.formattingField}
      />
    </ScrollView>
  );

  return (
    <View style={[styles.page, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <StepFlow
          steps={LESSON_STEPS}
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
                onPress={skipContentStep}
                disabled={extracting}
                accessibilityLabel="Skip adding lesson content for now"
              />
            ) : undefined
          }
        >
          {stepIndex === 0 ? placementStep : stepIndex === 1 ? contentStep : reviewStep}
        </StepFlow>
      </KeyboardAvoidingView>

      <Modal
        visible={subjectPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSubjectPickerOpen(false)}
      >
        <Pressable
          style={[styles.modalBackdrop, { backgroundColor: c.backdrop }]}
          onPress={() => setSubjectPickerOpen(false)}
        >
          <Pressable
            style={[styles.modalCard, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={[Typography.h3, styles.modalTitle, { color: c.text }]}>Select Subject</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {subjects.length > 0 ? (
                subjects.map((subject) => (
                  <Pressable
                    key={subject.subject_id}
                    accessibilityRole="button"
                    accessibilityLabel={`${subject.code} - ${subject.title}`}
                    style={[styles.modalItem, { borderBottomColor: c.hairline }]}
                    onPress={() => handlePickSubject(subject.subject_id)}
                  >
                    <Text style={[Typography.body, { color: c.text }]}>
                      {`${subject.code} - ${subject.title}`}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Text style={[Typography.body, styles.emptyPickerText, { color: c.mutedText }]}>
                  No subjects found.
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  contentStep: { flex: 1 },
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
  uploadActionButton: {
    width: 64,
    height: 52,
    borderRadius: Radius.md,
    overflow: "hidden",
  },
  uploadActionInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadActionText: {
    fontSize: 24,
    lineHeight: 26,
    fontWeight: "500",
  },
  extractionWrap: { marginTop: Spacing.lg, gap: Spacing.sm },
  extractionStage: { textAlign: "center" },
  extractionError: { marginTop: Spacing.lg, textAlign: "center" },
  reviewCard: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl },
  formattingField: { marginBottom: Spacing.lg },
  multilineInput: { minHeight: 96, textAlignVertical: "top" },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: Spacing.lg,
  },
  modalCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: "70%",
    paddingVertical: Spacing.sm,
  },
  modalTitle: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  modalItem: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyPickerText: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
});
