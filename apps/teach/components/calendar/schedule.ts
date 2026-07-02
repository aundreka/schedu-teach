// components/calendar/schedule.ts
//
// Bridges the scheduler (`algorithm/`) and the calendar UI.
//
//   • `loadPlanSchedule(planId)` reads the slots + blocks that
//     `buildPlan()` produced and persisted, groups split blocks back into a
//     single bar, and attaches display labels (see ./labels.ts).
//   • `buildPlan` is re-exported so the create flow / the upcoming admin
//     calendar share one "run the scheduler" import surface.

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
