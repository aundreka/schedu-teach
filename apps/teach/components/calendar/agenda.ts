// components/calendar/agenda.ts
//
// Data layer for the *daily* calendar view (which spans ALL of the teacher's
// lesson plans) and the block editor funnel:
//
//   • loadDayAgenda(userId, dateISO) → every plan + a flat list of *block*
//     entries landing on that day. Each entry carries its own class context so
//     the daily view can render one card per block (not per slot).
//   • createManualBlock / updateBlock / deleteBlock — the editor's mutations.
//     A manual block lives "outside" the scheduler's recurring slots: it has no
//     slot_id and carries its own date in metadata.manual_date.

import type { JsonObject, SessionCategory, SessionSubcategory } from "../../algorithm/00_types";
import { supabase } from "../../lib/supabase";
import { labelBlocks, type RawBlockGroup } from "./labels";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanLesson = {
  lessonId: string;
  title: string;
  sequenceNo: number; // position within its chapter
  unitId: string | null;
  unitTitle: string | null;
  unitSequenceNo: number | null;
  chapterId: string | null;
  chapterTitle: string | null;
  chapterSequenceNo: number | null;
};

export type PlanWithLessons = {
  lessonPlanId: string;
  subjectId: string;
  subjectTitle: string;
  subjectCode: string;
  subjectYear: string | null;
  sectionName: string;
  subtitle: string; // "Grade 8 - Tesla"
  color: string;
  lessons: PlanLesson[];
};

/**
 * One scheduled block on the day — renders as its own card on the daily
 * timeline. Carries its class context so the card can be drawn standalone.
 */
export type DayBlock = {
  blockId: string;
  groupId: string;
  label: string; // "L2", "SW3", "Q1", "Prelim"
  title: string; // cleaned display title, e.g. "Introduction to Science"
  category: SessionCategory;
  subcategory: SessionSubcategory | null;
  scopeLessonIds: string[];
  lessonId: string | null;
  startTime: string;
  endTime: string;
  manual: boolean;
  isSuspended: boolean;
  lockReason: string | null;
  // class context (one card per block; this is what the card shows / where the
  // detail-page deep links resolve to)
  lessonPlanId: string;
  subjectId: string;
  subjectTitle: string;
  subjectCode: string;
  subtitle: string;
  color: string;
};

export type DayAgenda = {
  dateISO: string;
  plans: PlanWithLessons[];
  entries: DayBlock[];
};

export type BlockEditValues = {
  lessonPlanId: string;
  category: SessionCategory;
  subcategory: SessionSubcategory;
  scopeLessonIds: string[];
  startTime: string; // "HH:MM:SS"
  endTime: string; // "HH:MM:SS"
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return (value as T) ?? null;
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function normTime(value: unknown): string {
  const m = String(value ?? "").match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return "00:00:00";
  return `${m[1].padStart(2, "0")}:${m[2]}:${(m[3] ?? "00").padStart(2, "0")}`;
}

function normalizeYear(year: string | null): string {
  const v = (year ?? "").trim();
  if (!v) return "";
  if (/^grade\b/i.test(v)) return v;
  if (/^\d+$/.test(v)) return `Grade ${v}`;
  return v;
}

function planSubtitle(year: string | null, section: string): string {
  return [normalizeYear(year), section].filter(Boolean).join(" - ");
}

const SUBJECT_PALETTE = ["#EA6EA4", "#5A92D2", "#7A93B1", "#66A29A", "#E0B341", "#A985D6"] as const;

export function subjectColor(code: string, year: string | null): string {
  const c = (code ?? "").toUpperCase().trim();
  if (c.startsWith("MAT")) return "#EA6EA4";
  if (c.startsWith("SCI8")) return "#5A92D2";
  if (c.startsWith("SCI9")) return "#7A93B1";
  const seed = `${c}|${(year ?? "").toLowerCase()}`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return SUBJECT_PALETTE[h % SUBJECT_PALETTE.length];
}

function makeKey(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function titleCaseSub(sub: string): string {
  return sub
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function blockTitle(values: BlockEditValues, lessons: PlanLesson[]): string {
  const byId = new Map(lessons.map((l) => [l.lessonId, l]));
  const scoped = values.scopeLessonIds.map((id) => byId.get(id)).filter((l): l is PlanLesson => Boolean(l));
  if (values.category === "lesson") return scoped[0]?.title ?? "Lesson";
  const sub = titleCaseSub(values.subcategory);
  if (scoped.length === 0) return sub;
  return `${sub}: ${scoped.map((l) => `L${l.sequenceNo}`).join(", ")}`;
}

function metadataScopeIds(metadata: JsonObject | null | undefined, fallbackLessonId: string | null): string[] {
  const raw = metadata?.scope_lesson_ids;
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);
  return fallbackLessonId ? [fallbackLessonId] : [];
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const PLAN_SELECT =
  "lesson_plan_id, title, subject:subjects(subject_id, code, title, year), section:sections(name)";

function rowToPlan(row: any): PlanWithLessons | null {
  const subject = unwrap<any>(row?.subject);
  const section = unwrap<any>(row?.section);
  const id = String(row?.lesson_plan_id ?? "");
  if (!id) return null;
  const code = String(subject?.code ?? "");
  const year = subject?.year != null ? String(subject.year) : null;
  const sectionName = String(section?.name ?? "");
  return {
    lessonPlanId: id,
    subjectId: String(subject?.subject_id ?? ""),
    subjectTitle: String(subject?.title || code || "Subject"),
    subjectCode: code,
    subjectYear: year,
    sectionName,
    subtitle: planSubtitle(year, sectionName),
    color: subjectColor(code, year),
    lessons: [],
  };
}

export async function loadUserPlansWithLessons(userId: string): Promise<PlanWithLessons[]> {
  const { data: planRows, error: planErr } = await supabase
    .from("lesson_plans")
    .select(PLAN_SELECT)
    .eq("user_id", userId);
  if (planErr) throw planErr;

  const plans = (planRows ?? [])
    .map(rowToPlan)
    .filter((p: PlanWithLessons | null): p is PlanWithLessons => Boolean(p));
  if (plans.length === 0) return [];

  const planIds = plans.map((p) => p.lessonPlanId);
  const { data: pscRows } = await supabase
    .from("plan_subject_content")
    .select(
      "lesson_plan_id, content_level, unit_id, chapter_id, lesson_id, sequence_no, selected_title, lesson:lessons(title, sequence_no)",
    )
    .in("lesson_plan_id", planIds)
    .in("content_level", ["unit", "chapter", "lesson"]);

  type UnitInfo = { title: string; sequenceNo: number };
  type ChapterInfo = { title: string; sequenceNo: number; unitId: string | null };
  const unitsByPlan = new Map<string, Map<string, UnitInfo>>();
  const chaptersByPlan = new Map<string, Map<string, ChapterInfo>>();
  const lessonRowsByPlan = new Map<string, any[]>();

  for (const row of pscRows ?? []) {
    const pid = String(row?.lesson_plan_id ?? "");
    if (!pid) continue;
    const level = String(row?.content_level ?? "");
    if (level === "unit" && row?.unit_id) {
      const map = unitsByPlan.get(pid) ?? new Map<string, UnitInfo>();
      map.set(String(row.unit_id), {
        title: String(row?.selected_title || "Unit"),
        sequenceNo: Number(row?.sequence_no ?? 0),
      });
      unitsByPlan.set(pid, map);
    } else if (level === "chapter" && row?.chapter_id) {
      const map = chaptersByPlan.get(pid) ?? new Map<string, ChapterInfo>();
      map.set(String(row.chapter_id), {
        title: String(row?.selected_title || "Chapter"),
        sequenceNo: Number(row?.sequence_no ?? 0),
        unitId: row?.unit_id ? String(row.unit_id) : null,
      });
      chaptersByPlan.set(pid, map);
    } else if (level === "lesson" && row?.lesson_id) {
      pushTo(lessonRowsByPlan, pid, row);
    }
  }

  for (const plan of plans) {
    const units = unitsByPlan.get(plan.lessonPlanId) ?? new Map<string, UnitInfo>();
    const chapters = chaptersByPlan.get(plan.lessonPlanId) ?? new Map<string, ChapterInfo>();
    const rows = lessonRowsByPlan.get(plan.lessonPlanId) ?? [];
    const lessons: PlanLesson[] = rows.map((row: any) => {
      const lesson = unwrap<any>(row?.lesson);
      const chapterId = row?.chapter_id ? String(row.chapter_id) : null;
      const chapter = chapterId ? chapters.get(chapterId) ?? null : null;
      const unitId = chapter?.unitId ?? (row?.unit_id ? String(row.unit_id) : null);
      const unit = unitId ? units.get(unitId) ?? null : null;
      return {
        lessonId: String(row.lesson_id),
        title: String(row?.selected_title || lesson?.title || "Lesson"),
        sequenceNo: Number(row?.sequence_no ?? lesson?.sequence_no ?? 1),
        unitId,
        unitTitle: unit?.title ?? null,
        unitSequenceNo: unit?.sequenceNo ?? null,
        chapterId,
        chapterTitle: chapter?.title ?? null,
        chapterSequenceNo: chapter?.sequenceNo ?? null,
      };
    });
    lessons.sort(
      (a, b) =>
        (a.unitSequenceNo ?? Number.POSITIVE_INFINITY) - (b.unitSequenceNo ?? Number.POSITIVE_INFINITY) ||
        (a.chapterSequenceNo ?? Number.POSITIVE_INFINITY) -
          (b.chapterSequenceNo ?? Number.POSITIVE_INFINITY) ||
        a.sequenceNo - b.sequenceNo ||
        a.title.localeCompare(b.title),
    );
    plan.lessons = lessons;
  }
  return plans;
}

export async function loadDayAgenda(userId: string, dateISO: string): Promise<DayAgenda> {
  const plans = await loadUserPlansWithLessons(userId);
  if (plans.length === 0) return { dateISO, plans: [], entries: [] };

  const planById = new Map(plans.map((p) => [p.lessonPlanId, p]));
  const planIds = plans.map((p) => p.lessonPlanId);

  const [{ data: slotRows }, { data: blockRows }] = await Promise.all([
    supabase.from("slots").select("slot_id, lesson_plan_id, slot_date").in("lesson_plan_id", planIds),
    supabase
      .from("blocks")
      .select(
        "block_id, lesson_plan_id, slot_id, root_block_id, lesson_id, session_category, session_subcategory, title, start_time, end_time, order_no, metadata",
      )
      .in("lesson_plan_id", planIds),
  ]);

  const slotDateById = new Map<string, string>();
  for (const slot of slotRows ?? []) {
    if (slot?.slot_id) slotDateById.set(String(slot.slot_id), String(slot.slot_date ?? ""));
  }

  const blocksByPlan = new Map<string, any[]>();
  for (const block of blockRows ?? []) {
    const pid = String(block?.lesson_plan_id ?? "");
    if (pid) pushTo(blocksByPlan, pid, block);
  }

  const entries: DayBlock[] = [];
  for (const [planId, planBlocks] of blocksByPlan) {
    const plan = planById.get(planId);
    if (!plan) continue;

    const dateOf = (block: any): string => {
      if (block?.slot_id) return slotDateById.get(String(block.slot_id)) ?? "";
      const md = block?.metadata?.manual_date;
      return typeof md === "string" ? md : "";
    };

    // Per-plan labels (numbers reset per term; lessons run continuously).
    const groups = new Map<string, RawBlockGroup>();
    for (const block of planBlocks) {
      const gid = block?.root_block_id ? String(block.root_block_id) : String(block?.block_id ?? "");
      if (!gid) continue;
      const date = dateOf(block);
      const existing = groups.get(gid);
      if (existing) {
        if (date && !existing.dates.includes(date)) existing.dates.push(date);
      } else {
        groups.set(gid, {
          id: gid,
          category: (block?.session_category as SessionCategory) ?? "lesson",
          subcategory: (block?.session_subcategory as SessionSubcategory) ?? null,
          rawTitle: String(block?.title ?? "Block"),
          metadata: (block?.metadata as JsonObject) ?? null,
          dates: date ? [date] : [],
        });
      }
    }
    const labelByGid = new Map(labelBlocks(Array.from(groups.values())).map((l) => [l.id, l]));

    for (const block of planBlocks) {
      if (dateOf(block) !== dateISO) continue;
      const gid = block?.root_block_id ? String(block.root_block_id) : String(block?.block_id ?? "");
      const labeled = labelByGid.get(gid);
      const startTime = normTime(block?.start_time);
      const endTime = normTime(block?.end_time);
      const lessonId = block?.lesson_id ? String(block.lesson_id) : null;
      const lockReason =
        typeof block?.metadata?.lock_reason === "string" && block.metadata.lock_reason.trim()
          ? String(block.metadata.lock_reason).trim()
          : null;
      entries.push({
        blockId: String(block?.block_id ?? gid),
        groupId: gid,
        label: (labeled?.prefix ?? "").replace(/:$/, "") || "—",
        title: labeled?.title ?? String(block?.title ?? ""),
        category: labeled?.category ?? ((block?.session_category as SessionCategory) ?? "lesson"),
        subcategory: labeled?.subcategory ?? ((block?.session_subcategory as SessionSubcategory) ?? null),
        scopeLessonIds: metadataScopeIds(block?.metadata as JsonObject | null, lessonId),
        lessonId,
        startTime,
        endTime,
        manual: block?.metadata?.manual === true || block?.slot_id == null,
        isSuspended: Boolean(lockReason),
        lockReason,
        lessonPlanId: planId,
        subjectId: plan.subjectId,
        subjectTitle: plan.subjectTitle,
        subjectCode: plan.subjectCode,
        subtitle: plan.subtitle,
        color: plan.color,
      });
    }
  }

  entries.sort(
    (a, b) =>
      a.startTime.localeCompare(b.startTime) ||
      a.endTime.localeCompare(b.endTime) ||
      a.subjectTitle.localeCompare(b.subjectTitle) ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
  return { dateISO, plans, entries };
}

// ---------------------------------------------------------------------------
// Overlap detection
// ---------------------------------------------------------------------------

function timeToMins(value: string): number {
  const [h, m] = String(value ?? "").split(":");
  return Number(h ?? 0) * 60 + Number(m ?? 0);
}

export type Conflict = { subjectTitle: string; label: string; startTime: string; endTime: string };

/** Returns the first existing block on `dateISO` whose time range overlaps
 *  [start, end). Considers all blocks across the same user's plans on that
 *  day. `ignoreBlockId` skips the block being edited. */
export async function findOverlap(opts: {
  userId: string;
  dateISO: string;
  startTime: string;
  endTime: string;
  ignoreBlockId?: string;
}): Promise<Conflict | null> {
  const startMin = timeToMins(opts.startTime);
  const endMin = timeToMins(opts.endTime);
  if (endMin <= startMin) return null;

  const day = await loadDayAgenda(opts.userId, opts.dateISO);
  for (const entry of day.entries) {
    if (opts.ignoreBlockId && entry.blockId === opts.ignoreBlockId) continue;
    const eStart = timeToMins(entry.startTime);
    const eEnd = timeToMins(entry.endTime);
    if (startMin < eEnd && eStart < endMin) {
      return {
        subjectTitle: entry.subjectTitle,
        label: entry.label,
        startTime: entry.startTime,
        endTime: entry.endTime,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Suspension: bulk-locking every block in selected lesson plans with a reason.
// Stored in `blocks.metadata.lock_reason` (so existing `is_locked` semantics
// owned by the scheduler are untouched).
// ---------------------------------------------------------------------------

export async function suspendLessonPlans(planIds: string[], reason: string): Promise<void> {
  const trimmed = reason.trim();
  if (!trimmed || planIds.length === 0) return;
  const { data, error: readErr } = await supabase
    .from("blocks")
    .select("block_id, metadata")
    .in("lesson_plan_id", planIds);
  if (readErr) throw readErr;
  for (const row of data ?? []) {
    const prev = ((row?.metadata as JsonObject | null) ?? {}) as JsonObject;
    const { error } = await supabase
      .from("blocks")
      .update({ metadata: { ...prev, lock_reason: trimmed } })
      .eq("block_id", String(row.block_id));
    if (error) throw error;
  }
}

export async function unsuspendLessonPlans(planIds: string[]): Promise<void> {
  if (planIds.length === 0) return;
  const { data, error: readErr } = await supabase
    .from("blocks")
    .select("block_id, metadata")
    .in("lesson_plan_id", planIds);
  if (readErr) throw readErr;
  for (const row of data ?? []) {
    const prev = ((row?.metadata as JsonObject | null) ?? {}) as JsonObject;
    if (!("lock_reason" in prev)) continue;
    const next: JsonObject = { ...prev };
    delete next.lock_reason;
    const { error } = await supabase
      .from("blocks")
      .update({ metadata: next })
      .eq("block_id", String(row.block_id));
    if (error) throw error;
  }
}

/** Plans where every block carries a non-empty lock_reason. */
export function lockedPlanIds(agenda: DayAgenda): string[] {
  return agenda.plans
    .filter((p) => {
      const entriesForPlan = agenda.entries.filter((e) => e.lessonPlanId === p.lessonPlanId);
      return entriesForPlan.length > 0 && entriesForPlan.every((e) => e.isSuspended);
    })
    .map((p) => p.lessonPlanId);
}

// ---------------------------------------------------------------------------
// Mutations (the block editor funnel)
// ---------------------------------------------------------------------------

export async function createManualBlock(
  values: BlockEditValues,
  dateISO: string,
  lessons: PlanLesson[],
): Promise<void> {
  const key = makeKey("manual");
  const lessonId =
    values.category === "lesson" && values.scopeLessonIds.length === 1 ? values.scopeLessonIds[0] : null;
  const title = blockTitle(values, lessons);
  const { error } = await supabase.from("blocks").insert({
    lesson_plan_id: values.lessonPlanId,
    slot_id: null,
    root_block_id: null,
    lesson_id: lessonId,
    algorithm_block_key: key,
    block_key: key,
    title,
    description: null,
    session_category: values.category,
    session_subcategory: values.subcategory,
    meeting_type: null,
    start_time: values.startTime,
    end_time: values.endTime,
    required: true,
    splittable: false,
    preferred_session_type: "any",
    dependency_keys: [],
    order_no: 1,
    is_locked: true,
    ww_subtype: values.category === "written_work" ? values.subcategory : null,
    pt_subtype: values.category === "performance_task" ? values.subcategory : null,
    metadata: {
      source: "manual",
      manual: true,
      manual_date: dateISO,
      scope_lesson_ids: values.scopeLessonIds,
      scope_summary: title,
    },
  });
  if (error) throw error;
}

export async function updateBlock(blockId: string, values: BlockEditValues, lessons: PlanLesson[]): Promise<void> {
  const { data: current, error: getErr } = await supabase
    .from("blocks")
    .select("metadata")
    .eq("block_id", blockId)
    .single();
  if (getErr) throw getErr;

  const prevMeta = ((current?.metadata as JsonObject | null) ?? {}) as JsonObject;
  const lessonId =
    values.category === "lesson" && values.scopeLessonIds.length === 1 ? values.scopeLessonIds[0] : null;
  const title = blockTitle(values, lessons);
  const { error } = await supabase
    .from("blocks")
    .update({
      session_category: values.category,
      session_subcategory: values.subcategory,
      ww_subtype: values.category === "written_work" ? values.subcategory : null,
      pt_subtype: values.category === "performance_task" ? values.subcategory : null,
      lesson_id: lessonId,
      start_time: values.startTime,
      end_time: values.endTime,
      title,
      metadata: { ...prevMeta, scope_lesson_ids: values.scopeLessonIds, scope_summary: title },
    })
    .eq("block_id", blockId);
  if (error) throw error;
}

export async function deleteBlock(blockId: string): Promise<void> {
  const { error } = await supabase.from("blocks").delete().eq("block_id", blockId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Sample agenda — mirrors the daily mock, used when the teacher has no plans.
// ---------------------------------------------------------------------------

export const DEMO_AGENDA_DATE = "2026-10-30"; // Friday, October 30

function demoLesson(
  lessonId: string,
  title: string,
  sequenceNo: number,
  unitId: string,
  unitTitle: string,
  unitSequenceNo: number,
  chapterId: string,
  chapterTitle: string,
  chapterSequenceNo: number,
): PlanLesson {
  return {
    lessonId,
    title,
    sequenceNo,
    unitId,
    unitTitle,
    unitSequenceNo,
    chapterId,
    chapterTitle,
    chapterSequenceNo,
  };
}

export const DEMO_AGENDA_PLANS: PlanWithLessons[] = [
  {
    lessonPlanId: "__demo_sci8",
    subjectId: "__demo_sci8",
    subjectTitle: "SCIENCE",
    subjectCode: "SCI8",
    subjectYear: "8",
    sectionName: "Tesla",
    subtitle: "Grade 8 - Tesla",
    color: "#5A92D2",
    lessons: [
      demoLesson("d8-1", "Introduction to Science", 1, "u-bio", "Biology", 1, "c-foundations", "Chapter 1: Foundations", 1),
      demoLesson("d8-2", "The Human Body", 1, "u-bio", "Biology", 1, "c-body", "Chapter 2: Human Body", 2),
      demoLesson("d8-3", "Digestive System", 2, "u-bio", "Biology", 1, "c-body", "Chapter 2: Human Body", 2),
      demoLesson("d8-4", "Skeletal System", 3, "u-bio", "Biology", 1, "c-body", "Chapter 2: Human Body", 2),
      demoLesson("d8-5", "Muscular System", 4, "u-bio", "Biology", 1, "c-body", "Chapter 2: Human Body", 2),
    ],
  },
  {
    lessonPlanId: "__demo_math10",
    subjectId: "__demo_math10",
    subjectTitle: "MATHEMATICS",
    subjectCode: "MAT10",
    subjectYear: "10",
    sectionName: "Newton",
    subtitle: "Grade 10 - Newton",
    color: "#EA6EA4",
    lessons: [
      demoLesson("dm-1", "Linear Equations", 1, "u-alg", "Algebra", 1, "c-linear", "Chapter 1: Linear Functions", 1),
      demoLesson("dm-2", "Quadratic Functions", 1, "u-alg", "Algebra", 1, "c-quad", "Chapter 2: Quadratic Functions", 2),
      demoLesson("dm-3", "Polynomials", 1, "u-alg", "Algebra", 1, "c-poly", "Chapter 3: Polynomials", 3),
    ],
  },
];

function demoEntry(
  partial: Omit<DayBlock, "groupId" | "manual" | "scopeLessonIds" | "isSuspended" | "lockReason"> & {
    scopeLessonIds?: string[];
  },
): DayBlock {
  return {
    groupId: partial.blockId,
    manual: false,
    scopeLessonIds: partial.scopeLessonIds ?? [],
    isSuspended: false,
    lockReason: null,
    ...partial,
  };
}

export const DEMO_AGENDA: DayAgenda = {
  dateISO: DEMO_AGENDA_DATE,
  plans: DEMO_AGENDA_PLANS,
  entries: [
    demoEntry({
      blockId: "demo-b1", label: "L2", title: "The Human Body",
      category: "lesson", subcategory: "lecture", lessonId: "d8-2", scopeLessonIds: ["d8-2"],
      startTime: "07:00:00", endTime: "08:00:00",
      lessonPlanId: "__demo_sci8", subjectId: "__demo_sci8",
      subjectTitle: "SCIENCE", subjectCode: "SCI8", subtitle: "Grade 8 - Tesla", color: "#5A92D2",
    }),
    demoEntry({
      blockId: "demo-b2", label: "SW2", title: "Lesson 1 & 2",
      category: "written_work", subcategory: "seatwork", lessonId: null,
      startTime: "08:00:00", endTime: "09:00:00",
      lessonPlanId: "__demo_sci9_curie", subjectId: "__demo_sci9_curie",
      subjectTitle: "SCIENCE", subjectCode: "SCI9", subtitle: "Grade 9 - Curie", color: "#7A93B1",
    }),
    demoEntry({
      blockId: "demo-b3", label: "Q1", title: "Lesson 1 & 2",
      category: "written_work", subcategory: "quiz", lessonId: null,
      startTime: "10:00:00", endTime: "11:00:00",
      lessonPlanId: "__demo_sci9_bohr", subjectId: "__demo_sci9_bohr",
      subjectTitle: "SCIENCE", subjectCode: "SCI9", subtitle: "Grade 9 - Bohr", color: "#5A92D2",
    }),
    demoEntry({
      blockId: "demo-b4", label: "SW3", title: "Lesson 5",
      category: "written_work", subcategory: "seatwork", lessonId: null, scopeLessonIds: ["dm-1"],
      startTime: "12:00:00", endTime: "13:00:00",
      lessonPlanId: "__demo_math10", subjectId: "__demo_math10",
      subjectTitle: "MATHEMATICS", subjectCode: "MAT10", subtitle: "Grade 10 - Newton", color: "#EA6EA4",
    }),
    demoEntry({
      blockId: "demo-b5", label: "L3", title: "Polynomials",
      category: "lesson", subcategory: "lecture", lessonId: "dm-3", scopeLessonIds: ["dm-3"],
      startTime: "13:00:00", endTime: "14:00:00",
      lessonPlanId: "__demo_math10", subjectId: "__demo_math10",
      subjectTitle: "MATHEMATICS", subjectCode: "MAT10", subtitle: "Grade 10 - Newton", color: "#EA6EA4",
    }),
    demoEntry({
      blockId: "demo-b6", label: "L1", title: "Introduction",
      category: "lesson", subcategory: "lecture", lessonId: null,
      startTime: "15:00:00", endTime: "16:00:00",
      lessonPlanId: "__demo_eng7", subjectId: "__demo_eng7",
      subjectTitle: "ENGLISH", subjectCode: "ENG7", subtitle: "Grade 7 - Darwin", color: "#E0B341",
    }),
  ],
};
