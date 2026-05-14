// algorithm/placeBlocks.ts
//
// Slots the term-ordered block stream from buildBlocks onto the calendar, ONE
// TERM AT A TIME. Each exam is pinned to the meeting on (or nearest to) its
// exam date; that term's content fills the meetings before it, one block per
// slot (overflow piles onto the last content slot). Within any single slot the
// blocks are ordered exam → lesson → written work (incl. quizzes) →
// performance task → buffer, which becomes their saved `order_no`.

import type { LegacyBlock, LegacySlot } from "./buildBlocks";

type Placement = {
  blockId: string;
};

type PlacedLegacySlot = LegacySlot & {
  placements: Placement[];
};

type PlaceBlocksParams = {
  slots: LegacySlot[];
  blocks: LegacyBlock[];
};

type PlaceBlocksResult = {
  slots: PlacedLegacySlot[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Order blocks take when they share a day. Quizzes are `written_work`, so they
// rank alongside the rest of the written work.
const CATEGORY_RANK: Record<string, number> = {
  exam: 0,
  lesson: 1,
  written_work: 2,
  performance_task: 3,
  buffer: 4,
};
function categoryRank(type: string | undefined): number {
  return CATEGORY_RANK[type ?? ""] ?? 5;
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

function isExamBlock(block: LegacyBlock): boolean {
  return block.type === "exam";
}

function isReviewBlock(block: LegacyBlock): boolean {
  return block.type === "buffer" && block.subcategory === "review";
}

// Map item `j` of `count` items onto an index in 0..span-1, evenly spread
// (item 0 → 0, last item → span-1). When there are more items than slots they
// repeat, so the overflow piles onto the last slots.
function spreadIndex(j: number, count: number, span: number): number {
  if (span <= 1 || count <= 1) return 0;
  return Math.min(span - 1, Math.max(0, Math.round((j * (span - 1)) / (count - 1))));
}

function examPreferredDate(block: LegacyBlock): string | null {
  const value = block.metadata?.preferredDate;
  return typeof value === "string" && ISO_DATE.test(value) ? value : null;
}

function nearestSlotIndex(slots: PlacedLegacySlot[], date: string): number {
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

type TermGroup = {
  content: LegacyBlock[];
  exam: LegacyBlock | null;
};

export function placeBlocks(params: PlaceBlocksParams): PlaceBlocksResult {
  const slots: PlacedLegacySlot[] = sortSlots(params.slots).map((slot) => ({
    ...slot,
    placements: [] as Placement[],
  }));
  if (slots.length === 0) {
    return { slots };
  }

  // Split the already term-ordered stream into terms: a run of content blocks
  // ending at an exam is one term (a trailing run with no exam is the tail of
  // the last term).
  const terms: TermGroup[] = [];
  let current: TermGroup = { content: [], exam: null };
  for (const block of params.blocks) {
    if (isExamBlock(block)) {
      current.exam = block;
      terms.push(current);
      current = { content: [], exam: null };
    } else {
      current.content.push(block);
    }
  }
  if (current.content.length > 0 || terms.length === 0) terms.push(current);

  // Resolve a strictly increasing slot index for each exam.
  const examTerms = terms.filter((term) => term.exam);
  const examSlotIndex: number[] = [];
  let lowerBound = 0;
  examTerms.forEach((term, i) => {
    const remaining = examTerms.length - i;
    const upper = slots.length - remaining;
    const date = term.exam ? examPreferredDate(term.exam) : null;
    let idx = date ? nearestSlotIndex(slots, date) : Math.min(lowerBound, slots.length - 1);
    idx = Math.max(idx, lowerBound);
    idx = Math.min(idx, Math.max(lowerBound, upper));
    examSlotIndex.push(idx);
    lowerBound = idx + 1;
  });

  // Walk the terms, dropping content into the term's slots and the exam onto
  // its pinned slot.
  let examOrdinal = 0;
  let prevExamIdx = -1;
  terms.forEach((term, ti) => {
    const isLast = ti === terms.length - 1;
    const examIdx = term.exam ? examSlotIndex[examOrdinal] : undefined;
    if (term.exam) examOrdinal += 1;

    const startIdx = prevExamIdx + 1;
    const endExclusive = isLast ? slots.length : examIdx ?? slots.length;
    const contentSlots: number[] = [];
    for (let s = startIdx; s < endExclusive; s += 1) {
      if (examIdx !== undefined && s === examIdx) continue;
      contentSlots.push(s);
    }
    if (contentSlots.length === 0) {
      // Terms crammed back to back — fall back to the exam's own slot (or this
      // term's start) so nothing is lost.
      contentSlots.push(examIdx ?? Math.min(Math.max(0, startIdx), slots.length - 1));
    }

    // The review (buffer) block, if there is one, takes the very last content
    // slot so it lands the meeting right before the exam; everything else is
    // spread across the slots before it.
    const reviewBlock = term.content.find(isReviewBlock) ?? null;
    const flowing = reviewBlock ? term.content.filter((block) => block !== reviewBlock) : term.content;
    const flowSlots = reviewBlock && contentSlots.length > 1 ? contentSlots.slice(0, -1) : contentSlots;

    flowing.forEach((block, j) => {
      const target = flowSlots[spreadIndex(j, flowing.length, flowSlots.length)];
      slots[target].placements.push({ blockId: block.id });
    });
    if (reviewBlock) {
      slots[contentSlots[contentSlots.length - 1]].placements.push({ blockId: reviewBlock.id });
    }
    if (term.exam && examIdx !== undefined) {
      slots[examIdx].placements.push({ blockId: term.exam.id });
    }

    prevExamIdx = examIdx ?? contentSlots[contentSlots.length - 1] ?? prevExamIdx;
  });

  // Re-order each slot so the day reads exam → lesson → written work →
  // performance task → buffer; ties keep their emit order.
  const typeById = new Map<string, string>();
  const emitOrderById = new Map<string, number>();
  params.blocks.forEach((block, index) => {
    typeById.set(block.id, block.type);
    emitOrderById.set(block.id, index);
  });
  for (const slot of slots) {
    slot.placements.sort((a, b) => {
      const ra = categoryRank(typeById.get(a.blockId));
      const rb = categoryRank(typeById.get(b.blockId));
      if (ra !== rb) return ra - rb;
      return (emitOrderById.get(a.blockId) ?? 0) - (emitOrderById.get(b.blockId) ?? 0);
    });
  }

  return { slots };
}
