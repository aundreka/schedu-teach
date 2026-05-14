// algorithm/buildBlocks.ts
//
// Builds the ordered block stream for a lesson plan, TERM BY TERM. A term is
// the stretch of class days that ends on an exam date, so a plan with N exams
// has N terms (e.g. 3 exams → Prelim / Midterm / Final). Lessons are split
// across the terms in proportion to how many meeting slots each term contains
// ("by available class days"); the teacher's written-work and performance-task
// totals are divided floor(total / terms) with the leftover handed to the
// earlier terms first (Prelim > Midterm > Final). Quizzes are generated inside
// every term, one after every `quizEveryNLessons` lessons.
//
// The blocks come out in this emit order, per term:
//   lesson, [quiz], [written work], [performance task], ... , review, exam
// and `placeBlocks` then slots them onto the calendar one block per meeting,
// pinning each exam to its date.

type PreferredSessionType = "lecture" | "laboratory" | "mixed" | "any";
type LegacyDifficulty = "easy" | "medium" | "hard";
type LegacyBlockType = "lesson" | "written_work" | "performance_task" | "exam" | "buffer";

export type LegacyTOCUnit = {
  id: string;
  courseId: string;
  chapterId: string;
  chapterTitle: string;
  title: string;
  order: number;
  estimatedMinutes: number;
  difficulty: LegacyDifficulty;
  preferredSessionType: PreferredSessionType;
  required: boolean;
};

export type LegacyTeacherRules = {
  quizMode: "none" | "hybrid";
  quizEveryNLessons: number;
  writtenWorkMode: "total";
  minWW: number;
  allowLessonWrittenWorkOverlay: boolean;
  preferLessonWrittenWorkOverlay: boolean;
  minPT: number;
  includeReviewBeforeExam: boolean;
};

export type LegacyExamBlockTemplate = {
  id: string;
  title: string;
  estimatedMinutes: number;
  subcategory: "prelim" | "midterm" | "final";
  preferredDate: string | null;
  required: boolean;
};

export type LegacySlot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionType: "lecture" | "laboratory";
  slotNumber?: number;
};

export type LegacyBlock = {
  id: string;
  title: string;
  type: LegacyBlockType;
  subcategory: string;
  preferredSessionType: PreferredSessionType;
  estimatedMinutes: number;
  minMinutes: number | null;
  maxMinutes: number | null;
  required: boolean;
  splittable: boolean;
  overlayMode: "none";
  dependencies: string[];
  metadata: Record<string, unknown>;
  sourceTocId?: string;
};

type BuildBlocksParams = {
  courseId: string;
  tocUnits: LegacyTOCUnit[];
  teacherRules: LegacyTeacherRules;
  examBlockTemplates: LegacyExamBlockTemplate[];
  slots: LegacySlot[];
  initialDelayDates: string[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function clampPositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function sortSlots(slots: LegacySlot[]): LegacySlot[] {
  return slots.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    return (a.slotNumber ?? 1) - (b.slotNumber ?? 1);
  });
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

// Index (into the sorted slot list) of the slot on `date`, or the meeting slot
// closest to it when that day has no class.
function nearestSlotIndex(slots: LegacySlot[], date: string): number {
  const exact = slots.findIndex((slot) => slot.date === date);
  if (exact >= 0) return exact;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  slots.forEach((slot, index) => {
    const distance = Math.abs(daysBetween(slot.date, date));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

// --- block factories -------------------------------------------------------

function makeLessonBlock(unit: LegacyTOCUnit, lessonIndex: number, termIndex: number): LegacyBlock {
  return {
    id: `lesson_${lessonIndex + 1}`,
    title: unit.title,
    type: "lesson",
    subcategory: unit.preferredSessionType === "laboratory" ? "laboratory" : "lecture",
    preferredSessionType: unit.preferredSessionType,
    estimatedMinutes: clampPositive(unit.estimatedMinutes, 60),
    minMinutes: null,
    maxMinutes: null,
    required: unit.required,
    splittable: false,
    overlayMode: "none",
    dependencies: [],
    metadata: {
      chapterId: unit.chapterId,
      chapterTitle: unit.chapterTitle,
      difficulty: unit.difficulty,
      order: unit.order,
      courseId: unit.courseId,
      term_no: termIndex + 1,
      lesson_no: lessonIndex + 1,
    },
    sourceTocId: unit.id,
  };
}

function makeWrittenWorkBlock(wwIndex: number, termIndex: number): LegacyBlock {
  return {
    id: `written_work_${wwIndex + 1}`,
    title: `Written Work ${wwIndex + 1}`,
    type: "written_work",
    subcategory: wwIndex % 2 === 0 ? "assignment" : "seatwork",
    preferredSessionType: "lecture",
    estimatedMinutes: 60,
    minMinutes: null,
    maxMinutes: null,
    required: true,
    splittable: false,
    overlayMode: "none",
    dependencies: [],
    metadata: { term_no: termIndex + 1 },
  };
}

function makeQuizBlock(quizIndex: number, termIndex: number): LegacyBlock {
  return {
    id: `quiz_${quizIndex + 1}`,
    title: `Quiz ${quizIndex + 1}`,
    type: "written_work",
    subcategory: "quiz",
    preferredSessionType: "lecture",
    estimatedMinutes: 45,
    minMinutes: null,
    maxMinutes: null,
    required: true,
    splittable: false,
    overlayMode: "none",
    dependencies: [],
    metadata: { term_no: termIndex + 1, quiz_no: quizIndex + 1 },
  };
}

function makePerformanceTaskBlock(ptIndex: number, termIndex: number): LegacyBlock {
  const subcategories = ["activity", "project", "reporting", "lab_report"] as const;
  const subcategory = subcategories[ptIndex % subcategories.length];
  return {
    id: `performance_task_${ptIndex + 1}`,
    title: `Performance Task ${ptIndex + 1}`,
    type: "performance_task",
    subcategory,
    preferredSessionType: subcategory === "lab_report" ? "laboratory" : "lecture",
    estimatedMinutes: subcategory === "project" ? 90 : 60,
    minMinutes: null,
    maxMinutes: null,
    required: true,
    splittable: false,
    overlayMode: "none",
    dependencies: [],
    metadata: { term_no: termIndex + 1 },
  };
}

function makeReviewBlock(termIndex: number, examTitle: string): LegacyBlock {
  return {
    id: `review_${termIndex + 1}`,
    title: `${examTitle} Review`,
    type: "buffer",
    subcategory: "review",
    preferredSessionType: "lecture",
    estimatedMinutes: 60,
    minMinutes: null,
    maxMinutes: null,
    required: false,
    splittable: false,
    overlayMode: "none",
    dependencies: [],
    metadata: { term_no: termIndex + 1 },
  };
}

function makeExamBlock(template: LegacyExamBlockTemplate, termIndex: number): LegacyBlock {
  return {
    id: template.id || `exam_${termIndex + 1}`,
    title: template.title,
    type: "exam",
    subcategory: template.subcategory,
    preferredSessionType: "lecture",
    estimatedMinutes: clampPositive(template.estimatedMinutes, 90),
    minMinutes: null,
    maxMinutes: null,
    required: template.required,
    splittable: false,
    overlayMode: "none",
    dependencies: [],
    metadata: { preferredDate: template.preferredDate, term_no: termIndex + 1, exam_subcategory: template.subcategory },
  };
}

// --- distribution helpers --------------------------------------------------

// Split `total` items across parts weighted by `weights`, never losing or
// inventing items. Leftover from the floor division goes to the heaviest parts
// first (earlier on ties). When there is enough to go around, every part that
// has any weight is guaranteed at least one item.
function splitByWeight(total: number, weights: number[]): number[] {
  const parts = weights.length;
  if (parts === 0) return [];
  if (total <= 0) return weights.map(() => 0);
  const sum = weights.reduce((acc, w) => acc + w, 0);
  const out = sum <= 0 ? weights.map(() => Math.floor(total / parts)) : weights.map((w) => Math.floor((total * w) / sum));
  let remainder = total - out.reduce((acc, v) => acc + v, 0);
  const byWeightDesc = weights.map((_w, i) => i).sort((a, b) => weights[b] - weights[a] || a - b);
  let oi = 0;
  while (remainder > 0) {
    out[byWeightDesc[oi % parts]] += 1;
    remainder -= 1;
    oi += 1;
  }
  if (total >= parts) {
    for (let i = 0; i < parts; i += 1) {
      if (out[i] > 0 || weights[i] <= 0) continue;
      const donor = out.map((_, j) => j).filter((j) => out[j] > 1).sort((a, b) => out[b] - out[a])[0];
      if (donor == null) break;
      out[donor] -= 1;
      out[i] += 1;
    }
  }
  return out;
}

// floor(total / parts) for every part, the remainder handed to the earliest
// parts first (Prelim > Midterm > Final).
function splitEvenFrontLoaded(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const extra = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

// `count` 1-indexed positions in 1..span, spread out (each one means "after
// this many lessons in the term").
function spreadPositions(count: number, span: number): number[] {
  if (count <= 0) return [];
  if (span <= 0) return Array.from({ length: count }, () => 1);
  return Array.from({ length: count }, (_, j) =>
    Math.min(span, Math.max(1, Math.round(((j + 0.5) * span) / count))),
  );
}

// Quiz cadence inside a term: one quiz after every 2 lessons, except — when
// the term's lesson count is odd — the final quiz covers the last 3 lessons.
// So 5 lessons → quizzes after L2 and L5; 6 lessons → after L2, L4, L6.
function quizPositionsForTerm(lessonCount: number): number[] {
  if (lessonCount < 2) return [];
  const positions: number[] = [];
  const regularLimit = lessonCount % 2 === 0 ? lessonCount : lessonCount - 3;
  for (let p = 2; p <= regularLimit; p += 2) positions.push(p);
  if (lessonCount % 2 === 1) positions.push(lessonCount);
  return positions;
}

// --- main ------------------------------------------------------------------

export function buildBlocks(params: BuildBlocksParams): LegacyBlock[] {
  const lessons = params.tocUnits.slice().sort((a, b) => a.order - b.order);
  const slots = sortSlots(params.slots);

  // Exams define the terms. Order them chronologically so term 0 is the
  // earliest exam ("Prelim").
  const examTemplates = params.examBlockTemplates.slice().sort((a, b) => {
    const da = a.preferredDate && ISO_DATE.test(a.preferredDate) ? a.preferredDate : "9999-12-31";
    const db = b.preferredDate && ISO_DATE.test(b.preferredDate) ? b.preferredDate : "9999-12-31";
    return da.localeCompare(db);
  });
  const termCount = Math.max(1, examTemplates.length);

  // Slot index of each exam — strictly increasing, and (where slots allow)
  // leaving at least one content slot before each exam.
  const examSlotIndex: number[] = [];
  let lowerBound = 0;
  examTemplates.forEach((template, i) => {
    const remainingExams = examTemplates.length - i;
    const upper = slots.length - remainingExams;
    let idx =
      template.preferredDate && ISO_DATE.test(template.preferredDate) && slots.length > 0
        ? nearestSlotIndex(slots, template.preferredDate)
        : Math.min(lowerBound, Math.max(0, slots.length - 1));
    idx = Math.max(idx, lowerBound);
    if (slots.length > 0) idx = Math.min(idx, Math.max(lowerBound, upper));
    examSlotIndex.push(idx);
    lowerBound = idx + 1;
  });

  // How many content slots each term holds (slots strictly between consecutive
  // exams; the last term also keeps any slots trailing after the final exam).
  const termContentSlotCounts: number[] = [];
  for (let i = 0; i < termCount; i += 1) {
    const startIdx = i === 0 ? 0 : examSlotIndex[i - 1] + 1;
    const endExclusive = i === termCount - 1 ? slots.length : examSlotIndex[i] ?? slots.length;
    let count = 0;
    for (let s = startIdx; s < endExclusive; s += 1) {
      if (examSlotIndex[i] !== undefined && s === examSlotIndex[i]) continue;
      count += 1;
    }
    termContentSlotCounts.push(Math.max(0, count));
  }
  const wwPerTerm = splitEvenFrontLoaded(clampNonNegative(params.teacherRules.minWW), termCount);
  const ptPerTerm = splitEvenFrontLoaded(clampNonNegative(params.teacherRules.minPT), termCount);
  const quizzesEnabled =
    params.teacherRules.quizMode === "hybrid" && clampNonNegative(params.teacherRules.quizEveryNLessons) > 0;
  const reviewReserve = params.teacherRules.includeReviewBeforeExam ? 1 : 0;

  // Lessons are spread "by available class days", but a term's days also have to
  // hold its written work, performance tasks and quizzes. After reserving slots
  // for the written work / performance tasks (and one for the review), the rest
  // is split ~2:1 between lessons and the quizzes that ride along with them
  // (one quiz per two lessons), so a term's blocks fit its days.
  const lessonWeights = termContentSlotCounts.map((slotCount, i) => {
    if (slotCount <= 0) return 0;
    const lessonPlusQuizBudget = slotCount - (wwPerTerm[i] ?? 0) - (ptPerTerm[i] ?? 0) - reviewReserve;
    const weight = quizzesEnabled
      ? Math.round((Math.max(0, lessonPlusQuizBudget) * 2) / 3)
      : Math.max(0, lessonPlusQuizBudget);
    return Math.max(1, weight);
  });
  const lessonsPerTerm = lessonWeights.some((w) => w > 0)
    ? splitByWeight(lessons.length, lessonWeights)
    : splitEvenFrontLoaded(lessons.length, termCount);

  const blocks: LegacyBlock[] = [];
  let lessonCursor = 0;
  let lessonNo = 0;
  let wwNo = 0;
  let ptNo = 0;
  let quizNo = 0;

  for (let term = 0; term < termCount; term += 1) {
    const k = lessonsPerTerm[term] ?? 0;
    const termLessons = lessons.slice(lessonCursor, lessonCursor + k);
    lessonCursor += k;

    const wwCount = wwPerTerm[term] ?? 0;
    const ptCount = ptPerTerm[term] ?? 0;
    const quizPositions = quizzesEnabled ? quizPositionsForTerm(k) : [];
    const wwPositions = spreadPositions(wwCount, Math.max(1, k));
    const ptPositions = spreadPositions(ptCount, Math.max(1, k));

    const slotCount = termContentSlotCounts[term] ?? 0;
    const contentCount = k + quizPositions.length + wwCount + ptCount;
    const includeReview = params.teacherRules.includeReviewBeforeExam && contentCount < slotCount;

    let wi = 0;
    let pi = 0;
    let qi = 0;
    for (let li = 1; li <= k; li += 1) {
      blocks.push(makeLessonBlock(termLessons[li - 1], lessonNo, term));
      lessonNo += 1;
      while (qi < quizPositions.length && quizPositions[qi] === li) {
        blocks.push(makeQuizBlock(quizNo, term));
        quizNo += 1;
        qi += 1;
      }
      while (wi < wwPositions.length && wwPositions[wi] <= li) {
        blocks.push(makeWrittenWorkBlock(wwNo, term));
        wwNo += 1;
        wi += 1;
      }
      while (pi < ptPositions.length && ptPositions[pi] <= li) {
        blocks.push(makePerformanceTaskBlock(ptNo, term));
        ptNo += 1;
        pi += 1;
      }
    }
    // Anything that did not land between lessons (short terms) goes after them.
    while (qi < quizPositions.length) {
      blocks.push(makeQuizBlock(quizNo, term));
      quizNo += 1;
      qi += 1;
    }
    while (wi < wwPositions.length) {
      blocks.push(makeWrittenWorkBlock(wwNo, term));
      wwNo += 1;
      wi += 1;
    }
    while (pi < ptPositions.length) {
      blocks.push(makePerformanceTaskBlock(ptNo, term));
      ptNo += 1;
      pi += 1;
    }

    const examTemplate = examTemplates[term];
    if (examTemplate) {
      if (includeReview) blocks.push(makeReviewBlock(term, examTemplate.title));
      blocks.push(makeExamBlock(examTemplate, term));
    }
  }

  // Safety net: never drop a lesson if the weighting math left a remainder.
  if (lessonCursor < lessons.length) {
    let insertAt = blocks.length;
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      if (blocks[i].type === "exam") {
        insertAt = i;
        break;
      }
    }
    if (insertAt > 0 && blocks[insertAt - 1]?.type === "buffer") insertAt -= 1;
    const tail = lessons.slice(lessonCursor).map((unit) => {
      const block = makeLessonBlock(unit, lessonNo, termCount - 1);
      lessonNo += 1;
      return block;
    });
    blocks.splice(insertAt, 0, ...tail);
  }

  // Linear dependency chain in emit order (same as the previous behaviour).
  return blocks.map((block, index) => ({
    ...block,
    dependencies: index > 0 ? [blocks[index - 1].id] : [],
  }));
}
