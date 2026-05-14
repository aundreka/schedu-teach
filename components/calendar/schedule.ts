// components/calendar/schedule.ts
//
// Bridges the scheduler (`algorithm/`) and the calendar UI.
//
//   • `loadPlanSchedule(planId)` reads the slots + blocks that
//     `buildPlan()` produced and persisted, groups split blocks back into a
//     single bar, and attaches display labels (see ./labels.ts).
//   • `buildPlan` is re-exported so the create flow / the upcoming admin
//     calendar share one "run the scheduler" import surface.
//   • `DEMO_SCHEDULE` is a self-contained sample used when the signed-in
//     teacher has no plans yet (and is also offered in the plan picker).

import type {
  AlgorithmInput,
  JsonObject,
  SessionCategory,
  SessionSubcategory,
} from "../../algorithm/00_types";
import { buildPlan, type BuildPlanResult } from "../../algorithm/07_run";
import { supabase } from "../../lib/supabase";
import { labelBlocks, type LabeledBlock, type RawBlockGroup } from "./labels";

export { buildPlan };
export type { AlgorithmInput, BuildPlanResult };

export type ScheduleBlock = {
  id: string;
  category: SessionCategory;
  subcategory: SessionSubcategory | null;
  termNo: number;
  /** Short label, e.g. "L3:", "SW1:", "Q2:", "PRJ1:", "Prelim:" */
  prefix: string;
  /** Cleaned display title, e.g. "Digestive System" */
  title: string;
  /** Sorted, de-duped ISO dates the block occupies. */
  dates: string[];
  /** Lowest `order_no` among the rows in this group — stacks same-day bars. */
  orderNo: number;
  isSuspended: boolean;
  lockReason: string | null;
};

export type ScheduleData = {
  planId: string | null;
  title: string;
  subjectCode: string;
  subjectYear: string | null;
  sectionName: string;
  startDate: string;
  endDate: string;
  blocks: ScheduleBlock[];
};

export type PlanSummary = {
  lessonPlanId: string;
  title: string;
  subjectCode: string;
  subjectYear: string | null;
  sectionName: string;
  startDate: string;
  endDate: string;
};

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return (value as T) ?? null;
}

const PLAN_SELECT =
  "lesson_plan_id, title, start_date, end_date, subject:subjects(code, year), section:sections(name)";

function rowToPlanSummary(row: any): PlanSummary | null {
  const subject = unwrap<any>(row?.subject);
  const section = unwrap<any>(row?.section);
  const id = String(row?.lesson_plan_id ?? "");
  const startDate = String(row?.start_date ?? "");
  const endDate = String(row?.end_date ?? "");
  if (!id || !startDate || !endDate) return null;
  return {
    lessonPlanId: id,
    title: String(row?.title ?? "Lesson Plan"),
    subjectCode: String(subject?.code ?? ""),
    subjectYear: subject?.year != null ? String(subject.year) : null,
    sectionName: String(section?.name ?? ""),
    startDate,
    endDate,
  };
}

export async function listLessonPlans(userId: string): Promise<PlanSummary[]> {
  const { data, error } = await supabase
    .from("lesson_plans")
    .select(PLAN_SELECT)
    .eq("user_id", userId)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .map(rowToPlanSummary)
    .filter((p: PlanSummary | null): p is PlanSummary => Boolean(p));
}

type GroupAccumulator = {
  raw: RawBlockGroup;
  minOrder: number;
};

export async function loadPlanSchedule(lessonPlanId: string): Promise<ScheduleData> {
  const [planRes, slotRes, blockRes] = await Promise.all([
    supabase.from("lesson_plans").select(PLAN_SELECT).eq("lesson_plan_id", lessonPlanId).single(),
    supabase.from("slots").select("slot_id, slot_date").eq("lesson_plan_id", lessonPlanId),
    supabase
      .from("blocks")
      .select(
        "block_id, slot_id, root_block_id, session_category, session_subcategory, title, order_no, metadata",
      )
      .eq("lesson_plan_id", lessonPlanId),
  ]);
  if (planRes.error) throw planRes.error;
  if (slotRes.error) throw slotRes.error;
  if (blockRes.error) throw blockRes.error;

  const planRow = planRes.data as any;
  const subject = unwrap<any>(planRow?.subject);
  const section = unwrap<any>(planRow?.section);

  const dateBySlotId = new Map<string, string>();
  for (const slot of slotRes.data ?? []) {
    if (slot?.slot_id && slot?.slot_date) {
      dateBySlotId.set(String(slot.slot_id), String(slot.slot_date));
    }
  }

  const groups = new Map<string, GroupAccumulator>();
  for (const block of blockRes.data ?? []) {
    const slotId = block?.slot_id ? String(block.slot_id) : null;
    if (!slotId) continue; // unplaced block — nothing to draw
    const date = dateBySlotId.get(slotId);
    if (!date) continue;

    const groupId = block?.root_block_id ? String(block.root_block_id) : String(block?.block_id ?? slotId);
    const order = typeof block?.order_no === "number" ? block.order_no : 1;
    const existing = groups.get(groupId);

    if (existing) {
      if (!existing.raw.dates.includes(date)) existing.raw.dates.push(date);
      // Keep the lowest-order_no row as the representative (closest to the root).
      if (order < existing.minOrder) {
        existing.minOrder = order;
        existing.raw.rawTitle = String(block?.title ?? existing.raw.rawTitle);
        existing.raw.category = (block?.session_category as SessionCategory) ?? existing.raw.category;
        existing.raw.subcategory = (block?.session_subcategory as SessionSubcategory) ?? existing.raw.subcategory;
        existing.raw.metadata = (block?.metadata as JsonObject) ?? existing.raw.metadata;
      }
    } else {
      groups.set(groupId, {
        minOrder: order,
        raw: {
          id: groupId,
          category: (block?.session_category as SessionCategory) ?? "lesson",
          subcategory: (block?.session_subcategory as SessionSubcategory) ?? null,
          rawTitle: String(block?.title ?? "Block"),
          metadata: (block?.metadata as JsonObject) ?? null,
          dates: [date],
        },
      });
    }
  }

  const labeled = labelBlocks(Array.from(groups.values(), (g) => g.raw));

  return {
    planId: lessonPlanId,
    title: String(planRow?.title ?? "Lesson Plan"),
    subjectCode: String(subject?.code ?? ""),
    subjectYear: subject?.year != null ? String(subject.year) : null,
    sectionName: String(section?.name ?? ""),
    startDate: String(planRow?.start_date ?? ""),
    endDate: String(planRow?.end_date ?? ""),
    blocks: labeled
      .map((b) => toScheduleBlock(b, groups.get(b.id)?.minOrder ?? 1))
      .sort(byFirstDate),
  };
}

function toScheduleBlock(block: LabeledBlock, orderNo = 1): ScheduleBlock {
  const raw = (block.metadata?.lock_reason as unknown) ?? null;
  const lockReason = typeof raw === "string" && raw.trim() ? String(raw).trim() : null;
  return {
    id: block.id,
    category: block.category,
    subcategory: block.subcategory,
    termNo: block.termNo,
    prefix: block.prefix,
    title: block.title,
    dates: block.dates,
    orderNo,
    isSuspended: Boolean(lockReason),
    lockReason,
  };
}

function byFirstDate(a: ScheduleBlock, b: ScheduleBlock): number {
  return (a.dates[0] ?? "").localeCompare(b.dates[0] ?? "") || a.orderNo - b.orderNo;
}

// ---------------------------------------------------------------------------
// Sample plan — mirrors the calendar mock so the screen has something to render
// before the teacher creates a real plan. The blocks are described in the same
// shape the scheduler emits, then run through the real labelling pass.
// ---------------------------------------------------------------------------

export const DEMO_PLAN_ID = "__demo";

const DEMO_RAW: RawBlockGroup[] = [
  { id: "demo-l1", category: "lesson", subcategory: "lecture", rawTitle: "Introduction to Science", metadata: { term_no: 1, lesson_no: 1 }, dates: ["2026-10-12"] },
  { id: "demo-l2", category: "lesson", subcategory: "lecture", rawTitle: "The Human Body", metadata: { term_no: 1, lesson_no: 2 }, dates: ["2026-10-13"] },
  { id: "demo-l3", category: "lesson", subcategory: "lecture", rawTitle: "Digestive System", metadata: { term_no: 1, lesson_no: 3 }, dates: ["2026-10-15", "2026-10-16"] },
  { id: "demo-l4", category: "lesson", subcategory: "lecture", rawTitle: "Skeletal System", metadata: { term_no: 1, lesson_no: 4 }, dates: ["2026-10-19"] },
  { id: "demo-l5", category: "lesson", subcategory: "lecture", rawTitle: "Muscular System", metadata: { term_no: 1, lesson_no: 5 }, dates: ["2026-10-22", "2026-10-23"] },
  { id: "demo-sw1", category: "written_work", subcategory: "seatwork", rawTitle: "Lesson 1 & 2", metadata: { term_no: 1 }, dates: ["2026-10-13"] },
  { id: "demo-q1", category: "written_work", subcategory: "quiz", rawTitle: "Lesson 1 & 2", metadata: { term_no: 1, quiz_no: 1 }, dates: ["2026-10-14"] },
  { id: "demo-sw2", category: "written_work", subcategory: "seatwork", rawTitle: "Lesson 3 & 4", metadata: { term_no: 1 }, dates: ["2026-10-21"] },
  {
    id: "demo-pt1",
    category: "performance_task",
    subcategory: "project",
    rawTitle: "Body system diagram",
    metadata: { term_no: 1 },
    dates: ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-26", "2026-10-27", "2026-10-28"],
  },
  { id: "demo-rev1", category: "buffer", subcategory: "review", rawTitle: "Lesson 1-5", metadata: { term_no: 1 }, dates: ["2026-10-29"] },
  { id: "demo-sw3", category: "written_work", subcategory: "seatwork", rawTitle: "Lesson 5", metadata: { term_no: 1 }, dates: ["2026-10-26"] },
  { id: "demo-q2", category: "written_work", subcategory: "quiz", rawTitle: "Lesson 1-5", metadata: { term_no: 1, quiz_no: 2 }, dates: ["2026-10-30"] },
];

export const DEMO_SCHEDULE: ScheduleData = {
  planId: DEMO_PLAN_ID,
  title: "Science · Tesla (sample)",
  subjectCode: "SCIENCE",
  subjectYear: "8",
  sectionName: "Tesla",
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  blocks: labelBlocks(DEMO_RAW).map((b) => toScheduleBlock(b)).sort(byFirstDate),
};

export const DEMO_PLAN_SUMMARY: PlanSummary = {
  lessonPlanId: DEMO_PLAN_ID,
  title: "Sample schedule",
  subjectCode: "SCIENCE",
  subjectYear: "8",
  sectionName: "Tesla",
  startDate: DEMO_SCHEDULE.startDate,
  endDate: DEMO_SCHEDULE.endDate,
};
