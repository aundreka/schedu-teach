// ======================================================
// TOP-LEVEL ORCHESTRATOR
// ======================================================
//
// Two entry points:
//   buildPlan(input)   — first build: meeting patterns → slots, curriculum →
//                        blocks, place, normalize order.
//   rebalanceDay(...)   — re-exported; call after any change to a day's
//                        availability (suspend / unsuspend / lock / unlock).
//
// Everything is a pure function of its inputs — re-running buildPlan on the same
// input, or rebalanceDay after toggling a flag, is deterministic and idempotent.
// The invariant the edit path relies on: every teacher-initiated block move/add
// must set is_locked on that block.

import type {
  AlgorithmInput,
  AlgorithmMetrics,
  AlgorithmWarning,
  OrderedSlot,
  RuntimeBlock,
  RuntimeSlot,
  TermSchedulePlan,
} from './00_types';
import { createSlots } from './01_slots';
import { buildBlocks } from './02_blocks';
import { placeBlocks } from './04_place';
import { orderBlocks } from './06_order';

export { computeTermBalance } from './03_rules';
export { repopulate, applyRepopulateChoices } from './04_repopulate';
export { rebalance, rebalanceDay } from './05_compress';
export { orderBlocks };

export interface BuildPlanResult {
  slots: RuntimeSlot[];
  blocks: RuntimeBlock[];
  schedule_plan: TermSchedulePlan[];
  ordered_slots: OrderedSlot[];
  warnings: AlgorithmWarning[];
  metrics: AlgorithmMetrics;
}

export function buildPlan(input: AlgorithmInput): BuildPlanResult {
  const slots = createSlots({
    lesson_plan: input.lesson_plan,
    meeting_patterns: input.meeting_patterns,
    school_calendar_events: input.school_calendar_events,
    delays: input.delays,
    existing_slots: input.existing_slots,
    rules: input.rules,
  });
  const blocks = buildBlocks({
    lesson_plan: input.lesson_plan,
    slots,
    lessons: input.lessons,
    activities: input.activities,
    existing_blocks: input.existing_blocks,
    rules: input.rules,
  });
  const placed = placeBlocks({ slots, blocks, rules: input.rules });
  const ordered = orderBlocks({
    slots: placed.slots,
    blocks: placed.blocks,
    rules: input.rules,
  });

  return {
    slots: ordered.slots,
    blocks: ordered.blocks,
    schedule_plan: placed.schedule_plan,
    ordered_slots: toOrderedSlots(ordered.slots, ordered.blocks),
    warnings: [...placed.warnings, ...ordered.warnings],
    metrics: computeMetrics(ordered.slots, ordered.blocks),
  };
}

export function toOrderedSlots(
  slots: RuntimeSlot[],
  blocks: RuntimeBlock[],
): OrderedSlot[] {
  const bySlotKey = new Map<string, RuntimeBlock[]>();
  for (const block of blocks) {
    if (!block.slot_key) continue;
    const list = bySlotKey.get(block.slot_key) ?? [];
    list.push(block);
    bySlotKey.set(block.slot_key, list);
  }

  return slots
    .slice()
    .sort(
      (a, b) =>
        a.slot_date.localeCompare(b.slot_date) ||
        a.start_time.localeCompare(b.start_time) ||
        a.slot_number - b.slot_number,
    )
    .map((slot) => ({
      slot,
      blocks: (bySlotKey.get(slot.slot_key) ?? [])
        .slice()
        .sort((x, y) => x.order_no - y.order_no),
    }));
}

export function computeMetrics(
  slots: RuntimeSlot[],
  blocks: RuntimeBlock[],
): AlgorithmMetrics {
  const placedBlocks = blocks.filter((block) => Boolean(block.slot_key));
  const countCategory = (category: RuntimeBlock['session_category']) =>
    blocks.filter((block) => block.session_category === category).length;

  return {
    total_slots: slots.length,
    usable_slots: slots.filter((slot) => !slot.blackout && !slot.is_locked).length,
    blackout_slots: slots.filter((slot) => Boolean(slot.blackout)).length,
    total_blocks: blocks.length,
    placed_blocks: placedBlocks.length,
    unplaced_blocks: blocks.length - placedBlocks.length,
    lesson_count: countCategory('lesson'),
    written_work_count: countCategory('written_work'),
    performance_task_count: countCategory('performance_task'),
    exam_count: countCategory('exam'),
    buffer_count: countCategory('buffer'),
  };
}
