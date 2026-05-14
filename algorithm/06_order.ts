import type {
  AlgorithmWarning,
  OrderParams,
  OrderResult,
  RuntimeBlock,
  SessionCategory,
  SlotKey,
} from './00_types';

// ======================================================
// ORDER
// Final normalization pass: within each slot, sort the blocks into a sensible
// reading order and re-number order_no (1..n). Both place() output and the
// post-compress / post-repopulate state should be run through this so a merged
// slot reads "Lesson 4 · Quiz 2" rather than whatever insertion order produced.
// ======================================================

const WITHIN_SLOT_PRIORITY: Record<SessionCategory, number> = {
  lesson: 1,
  written_work: 2,
  performance_task: 3,
  buffer: 4,
  exam: 5,
};

export function orderBlocks(params: OrderParams): OrderResult {
  const slots = params.slots.map((slot) => ({
    ...slot,
    assigned_block_keys: [...slot.assigned_block_keys],
  }));
  const blocks = params.blocks.map((block) => ({ ...block }));
  const warnings: AlgorithmWarning[] = [];

  const blocksBySlotKey = new Map<SlotKey, RuntimeBlock[]>();
  for (const block of blocks) {
    if (!block.slot_key) {
      warnings.push({
        code: 'UNPLACED_BLOCK',
        severity: 'warning',
        message: `${block.title} (${block.block_key}) is not assigned to a slot.`,
        block_key: block.block_key,
      });
      continue;
    }
    const list = blocksBySlotKey.get(block.slot_key) ?? [];
    list.push(block);
    blocksBySlotKey.set(block.slot_key, list);
  }

  const slotsByKey = new Map(slots.map((slot) => [slot.slot_key, slot]));

  for (const [slotKey, slotBlocks] of blocksBySlotKey) {
    slotBlocks.sort(compareWithinSlot);
    slotBlocks.forEach((block, index) => {
      block.order_no = index + 1;
    });

    const slot = slotsByKey.get(slotKey);
    if (slot) {
      slot.assigned_block_keys = slotBlocks.map((block) => block.block_key);
    }
  }

  return { slots, blocks, warnings };
}

function withinSlotRank(block: RuntimeBlock): number {
  // Orientation leads its slot; everything else follows category priority.
  if (block.session_subcategory === 'orientation') return 0;
  return WITHIN_SLOT_PRIORITY[block.session_category];
}

function compareWithinSlot(a: RuntimeBlock, b: RuntimeBlock): number {
  const rankDiff = withinSlotRank(a) - withinSlotRank(b);
  if (rankDiff !== 0) return rankDiff;

  const startA = a.start_time ?? '';
  const startB = b.start_time ?? '';
  if (startA !== startB) return startA.localeCompare(startB);

  if (a.order_no !== b.order_no) return a.order_no - b.order_no;

  return a.block_key.localeCompare(b.block_key);
}
