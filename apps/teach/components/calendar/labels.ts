// components/calendar/labels.ts
//
// Turns scheduler block groups into the short, human display labels the
// calendar shows on each bar:
//
//   L1: Introduction to Science      (lesson — number runs across the plan)
//   SW2: Lesson 3 & 4                (seatwork — restarts every term)
//   Q1: Lesson 1 & 2                 (quiz)
//   PRJ1: Body system diagram        (project)
//   Prelim: Periodic Exam            (exam — one per term, no number)
//
// Lesson numbers are continuous across the whole plan; every other subcategory
// is numbered independently per term, in curriculum order.

import type { JsonObject, SessionCategory, SessionSubcategory } from "../../algorithm/00_types";

const SUBCATEGORY_PREFIX: Record<string, string> = {
  // written_work
  quiz: "Q",
  assignment: "A",
  seatwork: "SW",
  // performance_task
  activity: "ACT",
  lab_report: "LR",
  reporting: "REP",
  project: "PRJ",
  // buffer
  review: "REV",
  preparation: "PREP",
  orientation: "ORN",
  other: "BUF",
};

const EXAM_LABEL: Record<string, string> = {
  prelim: "Prelim",
  midterm: "Midterm",
  final: "Final",
};

export type RawBlockGroup = {
  id: string;
  category: SessionCategory;
  subcategory: SessionSubcategory | null;
  rawTitle: string;
  metadata: JsonObject | null;
  /** ISO dates this block (group) occupies; will be sorted/de-duped here. */
  dates: string[];
};

export type LabeledBlock = Omit<RawBlockGroup, "metadata"> & {
  metadata: JsonObject | null;
  termNo: number;
  prefix: string;
  title: string;
};

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function titleCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Strip a leading scheduler-generated ordinal prefix ("Final Quiz 1: ",
// "Lesson 3: ", ...) so we don't render "Q1: Final Quiz 1: L1-L2". Requires a
// known category word followed by a colon, so plain titles ("Lesson 1 & 2",
// "Photosynthesis", "1.1 Cells") are left untouched.
const STRIP_PREFIX_RE =
  /^(?:(?:prelim|midterm|final)\s+)?(?:lesson|quiz|seatwork|assignment|activity|lab\s*report|reporting|project|review|preparation|orientation|buffer|exam)\s*#?\s*\d*\s*:\s*/i;

function cleanTitle(raw: string, fallback: string): string {
  const stripped = (raw ?? "").replace(STRIP_PREFIX_RE, "").trim();
  return stripped.length > 0 ? stripped : fallback;
}

function earliest(group: RawBlockGroup): string {
  return group.dates[0] ?? "";
}

export function labelBlocks(groups: RawBlockGroup[]): LabeledBlock[] {
  const normalized = groups.map((g) => ({
    ...g,
    dates: Array.from(new Set(g.dates)).sort(),
  }));
  const withTerm = normalized.map((g) => ({
    ...g,
    termNo: numberOf(g.metadata?.term_no) ?? 1,
  }));

  // --- Lessons: continuous numbering across the whole plan -----------------
  const lessons = withTerm
    .filter((g) => g.category === "lesson")
    .sort((a, b) => {
      const an = numberOf(a.metadata?.lesson_no);
      const bn = numberOf(b.metadata?.lesson_no);
      if (an != null && bn != null) return an - bn;
      if (an != null) return -1;
      if (bn != null) return 1;
      return earliest(a).localeCompare(earliest(b));
    });
  const lessonNoById = new Map<string, number>();
  let runningLesson = 0;
  for (const lesson of lessons) {
    const explicit = numberOf(lesson.metadata?.lesson_no);
    const n = explicit ?? runningLesson + 1;
    runningLesson = Math.max(runningLesson, n);
    lessonNoById.set(lesson.id, n);
  }

  // --- Everything else: per term, per subcategory, in curriculum order -----
  const ordinalById = new Map<string, number>();
  const buckets = new Map<string, typeof withTerm>();
  for (const g of withTerm) {
    if (g.category === "lesson" || g.category === "exam") continue;
    const key = `${g.termNo}::${g.category}::${g.subcategory ?? "other"}`;
    const list = buckets.get(key) ?? [];
    list.push(g);
    buckets.set(key, list);
  }
  for (const list of buckets.values()) {
    list
      .slice()
      .sort((a, b) => earliest(a).localeCompare(earliest(b)) || a.rawTitle.localeCompare(b.rawTitle))
      .forEach((g, index) => {
        const quizNo = g.subcategory === "quiz" ? numberOf(g.metadata?.quiz_no) : null;
        ordinalById.set(g.id, quizNo ?? index + 1);
      });
  }

  return withTerm.map((g) => {
    if (g.category === "lesson") {
      return {
        ...g,
        prefix: `L${lessonNoById.get(g.id) ?? 1}:`,
        title: cleanTitle(g.rawTitle, "Lesson"),
      };
    }
    if (g.category === "exam") {
      const label = EXAM_LABEL[g.subcategory ?? "final"] ?? "Exam";
      return { ...g, prefix: `${label}:`, title: cleanTitle(g.rawTitle, `${label} Exam`) };
    }
    const sub = g.subcategory ?? "other";
    const prefix = SUBCATEGORY_PREFIX[sub] ?? "B";
    const scopeSummary = typeof g.metadata?.scope_summary === "string" ? g.metadata.scope_summary : "";
    return {
      ...g,
      prefix: `${prefix}${ordinalById.get(g.id) ?? 1}:`,
      title: cleanTitle(g.rawTitle, scopeSummary || titleCase(sub)),
    };
  });
}
