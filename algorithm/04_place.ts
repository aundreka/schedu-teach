import type {
  AlgorithmWarning,
  PlaceBlocksParams,
  RuntimeBlock,
  RuntimeSlot,
  SlotKey,
  TermSchedulePlan,
} from './00_types';
import {
  createPlacementState,
  deriveTermSchedulePlan,
  ensureSpecialExamSlots,
  placeLessonSequence,
  placeOrientation,
  placeRemainingAssessments,
  rebuildOccupancyFromPlacements,
  reserveExamSlot,
  type SlotOccupancy,
} from './03_rules';

export type PlaceBlocksResult = {
  slots: RuntimeSlot[];
  blocks: RuntimeBlock[];
  schedule_plan: TermSchedulePlan[];
  warnings: AlgorithmWarning[];

  // Blocks that were locked onto a slot that has since become unusable (e.g. the
  // day was suspended): released and re-flowed here, lock dropped. Empty unless
  // respect_existing_placements was set.
  unpinned_block_keys: string[];
};

export function placeBlocks(params: PlaceBlocksParams): PlaceBlocksResult {
  const slots = params.slots.map((slot) => ({
    ...slot,
    assigned_block_keys: [...slot.assigned_block_keys],
  }));
  const blocks = params.blocks.map((block) => ({
    ...block,
    metadata: { ...block.metadata },
  }));
  const warnings: AlgorithmWarning[] = [];
  const schedule_plan =
    params.schedule_plan ?? deriveTermSchedulePlan(params.rules.terms, slots, blocks);

  ensureSpecialExamSlots(schedule_plan, slots, blocks, warnings);

  const slotsByKey = new Map(slots.map((slot) => [slot.slot_key, slot]));
  const blocksByKey = new Map(blocks.map((block) => [block.block_key, block]));
  const occupancyBySlotKey = new Map<SlotKey, SlotOccupancy>();
  const prePlacedKeys = new Set<string>();
  const unpinnedKeys = new Set<string>();

  if (params.respect_existing_placements) {
    rebuildOccupancyFromPlacements(
      slots,
      blocks,
      slotsByKey,
      occupancyBySlotKey,
      prePlacedKeys,
      warnings,
      unpinnedKeys,
    );
  }

  for (let termIndex = 0; termIndex < schedule_plan.length; termIndex += 1) {
    const state = createPlacementState(
      schedule_plan[termIndex],
      termIndex,
      slotsByKey,
      blocksByKey,
      occupancyBySlotKey,
      warnings,
      prePlacedKeys,
      unpinnedKeys, // held out of placement; surfaced for re-pinning
    );

    reserveExamSlot(state);
    placeOrientation(state);
    placeLessonSequence(state);
    placeRemainingAssessments(state);
  }

  return {
    slots,
    blocks,
    schedule_plan,
    warnings,
    unpinned_block_keys: Array.from(unpinnedKeys),
  };
}
