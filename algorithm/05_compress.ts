import type {
  AlgorithmWarning,
  CompressParams,
  DisplacedBlock,
  ISODateString,
  RebalanceDayParams,
  RebalanceDayResult,
  RebalanceResult,
  RuntimeBlock,
  RuntimeSlot,
  SlotKey,
  SlotMerge,
  TermBalance,
} from './00_types';
import { computeTermBalance, deriveTermSchedulePlan, SLOT_CAPACITY } from './03_rules';
import { placeBlocks } from './04_place';
import { repopulate } from './04_repopulate';

// ======================================================
// REBALANCE
// The single deterministic re-flow. Run it after ANY change to slot state —
// suspend, unsuspend, lock, unlock, edited meeting pattern. It handles both
// directions: fewer usable slots than blocks ⇒ blocks double up (compression);
// more slots than blocks ⇒ blocks spread back out (decompression). Because it's
// a pure function of (slots, blocks, rules), "suspend → rebalance" and
// "unsuspend → rebalance" are automatically inverse — no undo log needed.
//
// THE INVARIANT THIS RELIES ON: every teacher-initiated edit (drag a block,
// change its slot, split it) must set is_locked on that block (and on the slot
// if they pinned the slot). Pinned blocks keep their placement; everything else
// is the algorithm's to re-flow. Without that invariant, a rebalance can clobber
// a manual change.
//
// rebalance() is idempotent: running it again on an already-balanced plan is a
// no-op.
// ======================================================

// A block keeps its slot through a rebalance only if it is pinned: teacher-
// locked, the exam (always tied to the exam slot), or a buffer such as
// Orientation that has no natural "ride along" host. Everything else is fair
// game to be moved/merged.
function isPinnedBlock(block: RuntimeBlock): boolean {
  return (
    block.is_locked ||
    block.session_category === 'exam' ||
    block.session_category === 'buffer'
  );
}

export function rebalance(params: CompressParams): RebalanceResult {
  const slots = params.slots.map((slot) => ({
    ...slot,
    assigned_block_keys: [...slot.assigned_block_keys],
  }));
  const blocks = params.blocks.map((block) => ({
    ...block,
    metadata: { ...block.metadata },
  }));

  // 1. Release every non-pinned block so the placement pass can re-flow it.
  for (const block of blocks) {
    if (isPinnedBlock(block)) continue;
    block.slot_id = null;
    block.slot_key = null;
    block.start_time = undefined;
    block.end_time = undefined;
    block.order_no = 0;
  }

  // 2. Recompute the per-term schedule from the *current* usable slots.
  //    deriveTermSchedulePlan drops blackout/locked slots automatically; if the
  //    caller passed a (possibly stale) plan we keep it but refresh the numbers.
  const schedulePlan = params.schedule_plan
    ? params.schedule_plan.map((plan) => ({
        ...plan,
        queues: { ...plan.queues },
        content_slot_keys: [...plan.content_slot_keys],
        term_slot_keys: [...plan.term_slot_keys],
      }))
    : deriveTermSchedulePlan(params.rules.terms, slots, blocks);

  // 3. Push the live slack/pressure into the plan so the placement state machine
  //    knows it has to double blocks up (excess_slots < 0 ⇒ compress as it goes).
  for (const plan of schedulePlan) {
    plan.excess_slots = computeTermBalance(plan, slots, blocks).excess_slots;
  }

  // 4. Re-flow. Pinned blocks stay; the rest is packed into what's left.
  const placed = placeBlocks({
    slots,
    blocks,
    schedule_plan: schedulePlan,
    rules: params.rules,
    respect_existing_placements: true,
  });

  // 5. Report what happened.
  const balances: TermBalance[] = placed.schedule_plan.map((plan) =>
    computeTermBalance(plan, placed.slots, placed.blocks),
  );
  const merges = collectMerges(placed.slots, placed.blocks);
  const warnings: AlgorithmWarning[] = [...placed.warnings];

  // Compression "fails" only if a content block ended up with no slot at all —
  // doubling blocks up keeps slot_pressure > 0 yet is a perfectly fine outcome.
  const unplacedByTerm = new Map<string, RuntimeBlock[]>();
  for (const block of placed.blocks) {
    if (block.session_category === 'exam' || block.slot_key) continue;
    const termKey = typeof block.metadata.term_key === 'string'
      ? block.metadata.term_key
      : 'unscheduled';
    const list = unplacedByTerm.get(termKey) ?? [];
    list.push(block);
    unplacedByTerm.set(termKey, list);
    warnings.push({
      code: 'UNPLACED_BLOCK',
      severity: 'warning',
      message: `${block.title} could not be placed after compression.`,
      block_key: block.block_key,
      term_key: termKey,
    });
  }

  for (const balance of balances) {
    const unplaced = unplacedByTerm.get(balance.term_key)?.length ?? 0;
    if (unplaced > 0) {
      warnings.push({
        code: 'COMPRESSION_FAILED',
        severity: 'error',
        message: `${balance.term_key} is overcommitted: ${unplaced} block(s) could not be placed even after merging.`,
        term_key: balance.term_key,
      });
    } else {
      warnings.push({
        code: 'COMPRESSION_APPLIED',
        severity: 'info',
        message: `${balance.term_key} rebalanced into ${balance.usable_content_slots} content slot(s).`,
        term_key: balance.term_key,
      });
    }
  }
  for (const merge of merges) {
    warnings.push({
      code: 'BLOCKS_MERGED',
      severity: 'info',
      message: `${merge.slot_key}: ${merge.block_keys.join(' + ')}.`,
      slot_key: merge.slot_key,
    });
  }

  return {
    slots: placed.slots,
    blocks: placed.blocks,
    schedule_plan: placed.schedule_plan,
    balances,
    merges,
    displaced_block_keys: placed.unpinned_block_keys,
    warnings,
  };
}

function collectMerges(
  slots: RuntimeSlot[],
  blocks: RuntimeBlock[],
): SlotMerge[] {
  const blocksBySlotKey = new Map<SlotKey, RuntimeBlock[]>();
  for (const block of blocks) {
    if (!block.slot_key) continue;
    const list = blocksBySlotKey.get(block.slot_key) ?? [];
    list.push(block);
    blocksBySlotKey.set(block.slot_key, list);
  }

  const merges: SlotMerge[] = [];
  for (const slot of slots) {
    const slotBlocks = blocksBySlotKey.get(slot.slot_key) ?? [];
    if (slotBlocks.length < 2) continue;

    merges.push({
      slot_key: slot.slot_key,
      slot_id: slot.slot_id,
      block_keys: slotBlocks
        .slice()
        .sort((a, b) => a.order_no - b.order_no)
        .map((block) => block.block_key),
      reason: 'compressed',
    });
  }

  return merges;
}

/** @deprecated Renamed to `rebalance` — it handles compression *and* decompression. */
export const compress = rebalance;

// ======================================================
// REBALANCE-DAY — one call for "a day's availability changed"
// ======================================================
//
// Use this from the calendar whenever a day is suspended, unsuspended, locked,
// or unlocked: the caller toggles the slot's blackout/locked flags (or re-runs
// createSlots), then calls rebalanceDay(). It re-flows everything (so doubled-up
// blocks spread back out into a freed slot, and overcommitted terms compress),
// then reports:
//   - `vacancies`  — residual slack the curriculum doesn't need; the teacher can
//                    optionally fill these via applyRepopulateChoices().
//   - `displaced`  — teacher-pinned blocks whose day got suspended. These are
//                    NOT auto-moved; each stays locked-but-unplaced with a ranked
//                    `suggested_slot_keys` re-pin menu. The teacher picks a slot,
//                    sets it on the block, and calls rebalanceDay() again.
// Nothing is inserted or moved automatically.
export function rebalanceDay(params: RebalanceDayParams): RebalanceDayResult {
  const rebalanced = rebalance({
    slots: params.slots,
    blocks: params.blocks,
    schedule_plan: params.schedule_plan,
    rules: params.rules,
  });

  const { reports, warnings } = repopulate({
    slots: rebalanced.slots,
    blocks: rebalanced.blocks,
    lessons: params.lessons,
    activities: params.activities,
    schedule_plan: rebalanced.schedule_plan,
    rules: params.rules,
  });

  return {
    slots: rebalanced.slots,
    blocks: rebalanced.blocks,
    schedule_plan: rebalanced.schedule_plan,
    balances: rebalanced.balances,
    merges: rebalanced.merges,
    vacancies: reports,
    displaced: buildDisplacedBlocks(rebalanced),
    warnings: [...rebalanced.warnings, ...warnings],
  };
}

// Builds the re-pin menu for each block that rebalance() held out (a teacher-
// locked block whose day got suspended). Candidate slots, best first: empty
// content slots in the same term, then slots with room to share — each tier
// ordered by closeness to the day the block was originally pinned to. The exam
// slot and full slots are excluded; the teacher may still pick any other slot.
function buildDisplacedBlocks(result: RebalanceResult): DisplacedBlock[] {
  if (result.displaced_block_keys.length === 0) return [];

  const blocksByKey = new Map(result.blocks.map((block) => [block.block_key, block]));
  const slotsByKey = new Map(result.slots.map((slot) => [slot.slot_key, slot]));
  const planByTerm = new Map(result.schedule_plan.map((plan) => [plan.term_key, plan]));

  const blockCountBySlot = new Map<SlotKey, number>();
  for (const block of result.blocks) {
    if (!block.slot_key) continue;
    blockCountBySlot.set(
      block.slot_key,
      (blockCountBySlot.get(block.slot_key) ?? 0) + 1,
    );
  }

  const previousSlotByBlock = new Map<string, SlotKey>();
  for (const warning of result.warnings) {
    if (
      warning.code === 'LOCKED_BLOCK_CONFLICT' &&
      warning.block_key &&
      warning.slot_key
    ) {
      previousSlotByBlock.set(warning.block_key, warning.slot_key);
    }
  }

  const out: DisplacedBlock[] = [];
  for (const blockKey of result.displaced_block_keys) {
    const block = blocksByKey.get(blockKey);
    if (!block) continue;

    const termKey =
      typeof block.metadata.term_key === 'string' ? block.metadata.term_key : '';
    const plan = planByTerm.get(termKey);
    const previousSlotKey = previousSlotByBlock.get(blockKey);
    const previousSlotDate = previousSlotKey
      ? (slotDateOf(previousSlotKey) as ISODateString)
      : undefined;

    const candidates: { key: SlotKey; tier: number; distance: number }[] = [];
    for (const key of plan?.content_slot_keys ?? []) {
      const slot = slotsByKey.get(key);
      if (!slot || slot.blackout || slot.is_locked) continue;

      const count = blockCountBySlot.get(key) ?? 0;
      if (count >= SLOT_CAPACITY) continue;

      candidates.push({
        key,
        tier: count === 0 ? 0 : 1,
        distance: previousSlotDate
          ? Math.abs(daysBetween(previousSlotDate, slotDateOf(key)))
          : 0,
      });
    }
    candidates.sort(
      (a, b) =>
        a.tier - b.tier || a.distance - b.distance || a.key.localeCompare(b.key),
    );

    out.push({
      block_key: block.block_key,
      title: block.title,
      session_category: block.session_category,
      session_subcategory: block.session_subcategory,
      term_key: termKey,
      previous_slot_key: previousSlotKey,
      previous_slot_date: previousSlotDate,
      suggested_slot_keys: candidates.map((candidate) => candidate.key),
    });
  }

  return out;
}

function slotDateOf(slotKey: SlotKey): string {
  return slotKey.split('#')[0];
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}
