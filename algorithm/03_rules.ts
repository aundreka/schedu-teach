import type {
  AlgorithmWarning,
  ISODateString,
  RuntimeBlock,
  RuntimeBufferBlock,
  RuntimeExamBlock,
  RuntimeLessonBlock,
  RuntimePerformanceTaskBlock,
  RuntimeSlot,
  RuntimeWrittenWorkBlock,
  SlotKey,
  TermBalance,
  TermBlockQueues,
  TermSchedulePlan,
  TermWindow,
  TimeString,
  WeekdayName,
} from './00_types';

export type SlotOccupancy = {
  slot: RuntimeSlot;
  lesson?: RuntimeLessonBlock;
  hasWrittenWork: boolean;
  blockKeys: string[];
};

export type PlacementState = {
  plan: TermSchedulePlan;
  termIndex: number;
  slotsByKey: Map<SlotKey, RuntimeSlot>;
  blocksByKey: Map<string, RuntimeBlock>;
  occupancyBySlotKey: Map<SlotKey, SlotOccupancy>;
  warnings: AlgorithmWarning[];
  orientation?: RuntimeBufferBlock;
  lessons: RuntimeLessonBlock[];
  quizzes: RuntimeWrittenWorkBlock[];
  writtenWorks: RuntimeWrittenWorkBlock[];
  performanceTasks: RuntimePerformanceTaskBlock[];
  exam?: RuntimeExamBlock;
  contentSlotIndex: number;
  lessonsPlaced: number;
  excessSlots: number;
  placedLessonKeys: Set<string>;
};

const SPECIAL_EXAM_START_TIME: TimeString = '00:00:00';
const SPECIAL_EXAM_END_TIME: TimeString = '23:59:00';

export function createPlacementState(
  plan: TermSchedulePlan,
  termIndex: number,
  slotsByKey: Map<SlotKey, RuntimeSlot>,
  blocksByKey: Map<string, RuntimeBlock>,
  occupancyBySlotKey: Map<SlotKey, SlotOccupancy>,
  warnings: AlgorithmWarning[],
  prePlacedKeys: Set<string> = new Set<string>(),
  // Blocks deliberately left unplaced this pass (e.g. a teacher-locked block
  // whose day got suspended — it awaits an explicit re-pin, we don't re-flow it).
  heldKeys: Set<string> = new Set<string>(),
): PlacementState {
  const blockFromKey = <T extends RuntimeBlock>(blockKey: string): T | null => {
    return (blocksByKey.get(blockKey) as T | undefined) ?? null;
  };
  // Anything already pinned into a slot (locked block, exam, etc.) or held out
  // for re-pinning is left out of the active queues so this pass skips it.
  const pending = (keys: string[]) =>
    keys.filter((key) => !prePlacedKeys.has(key) && !heldKeys.has(key));
  const prePlacedLessonKeys = plan.queues.lesson_block_keys.filter((key) =>
    prePlacedKeys.has(key),
  );

  return {
    plan,
    termIndex,
    slotsByKey,
    blocksByKey,
    occupancyBySlotKey,
    warnings,
    orientation: plan.queues.buffer_block_keys
      .map((key) => blockFromKey<RuntimeBufferBlock>(key))
      .find((block): block is RuntimeBufferBlock => {
        return Boolean(
          block &&
            block.session_subcategory === 'orientation' &&
            !heldKeys.has(block.block_key),
        );
      }),
    lessons: pending(plan.queues.lesson_block_keys)
      .map((key) => blockFromKey<RuntimeLessonBlock>(key))
      .filter((block): block is RuntimeLessonBlock => Boolean(block)),
    quizzes: pending(plan.queues.quiz_block_keys)
      .map((key) => blockFromKey<RuntimeWrittenWorkBlock>(key))
      .filter((block): block is RuntimeWrittenWorkBlock => Boolean(block)),
    writtenWorks: pending(plan.queues.written_work_block_keys)
      .map((key) => blockFromKey<RuntimeWrittenWorkBlock>(key))
      .filter((block): block is RuntimeWrittenWorkBlock => Boolean(block)),
    performanceTasks: pending(plan.queues.performance_task_block_keys)
      .map((key) => blockFromKey<RuntimePerformanceTaskBlock>(key))
      .filter((block): block is RuntimePerformanceTaskBlock => Boolean(block)),
    exam:
      plan.queues.exam_block_keys
        .map((key) => blockFromKey<RuntimeExamBlock>(key))
        .find((block): block is RuntimeExamBlock => Boolean(block)) ?? undefined,
    contentSlotIndex: 0,
    lessonsPlaced: prePlacedLessonKeys.length,
    excessSlots: plan.excess_slots,
    placedLessonKeys: new Set<string>(prePlacedLessonKeys),
  };
}

export function reserveExamSlot(state: PlacementState): void {
  if (!state.exam) return;

  // Already sitting in the exam slot (e.g. preserved on a re-run) — nothing to do.
  if (state.exam.slot_key === state.plan.exam_slot_key) return;

  const examSlot = state.slotsByKey.get(state.plan.exam_slot_key);

  if (!examSlot) {
    state.warnings.push({
      code: 'NO_AVAILABLE_SLOT',
      severity: 'error',
      message: `No exam slot exists for ${state.plan.term_key} on ${state.plan.exam_date}.`,
      term_key: state.plan.term_key,
      slot_key: state.plan.exam_slot_key,
      block_key: state.exam.block_key,
    });
    return;
  }

  assignBlockToSlot(state, state.exam, examSlot);
}

export function placeOrientation(state: PlacementState): void {
  if (
    state.termIndex !== 0 ||
    !state.orientation ||
    state.orientation.slot_key || // already placed (preserved on a re-run)
    state.excessSlots <= 0
  ) {
    return;
  }

  const firstSlot = nextContentSlot(state);
  if (!firstSlot) return;

  assignBlockToSlot(state, state.orientation, firstSlot);
  state.excessSlots -= 1;
}

export function placeLessonSequence(state: PlacementState): void {
  while (state.lessons.length > 0) {
    const lesson = state.lessons.shift();
    if (!lesson) return;

    let slot = nextContentSlot(state);

    // Out of fresh content slots — compress: ride the lesson along the most
    // recent already-used slot that still has room.
    if (!slot) {
      slot = findLessonMergeHost(state) ?? null;
      if (slot) {
        state.warnings.push({
          code: 'BLOCKS_MERGED',
          severity: 'info',
          message: `Combined ${lesson.title} into ${slot.slot_key} to absorb a lost session.`,
          term_key: state.plan.term_key,
          slot_key: slot.slot_key,
          block_key: lesson.block_key,
        });
      }
    }

    if (!slot) {
      state.warnings.push({
        code: 'INSUFFICIENT_SLOTS',
        severity: 'warning',
        message: `No available lesson slot remains for ${lesson.title}.`,
        term_key: state.plan.term_key,
        block_key: lesson.block_key,
        lesson_id: lesson.lesson_id,
      });
      continue;
    }

    assignBlockToSlot(state, lesson, slot);
    state.placedLessonKeys.add(lesson.block_key);
    state.lessonsPlaced += 1;

    placeDueQuizzes(state, slot);
    placeIntervalAssessments(state, slot);
  }
}

export function placeDueQuizzes(
  state: PlacementState,
  previousLessonSlot?: RuntimeSlot,
): void {
  const dueQuizzes = takeDueQuizzes(state.quizzes, state.placedLessonKeys);

  for (const quiz of dueQuizzes) {
    // Quizzes get their own slot when one is free, but may ride along a lesson
    // slot when the term is overcommitted — same as the other assessments.
    placeAssessment(state, quiz, true, previousLessonSlot);
  }
}

export function placeIntervalAssessments(
  state: PlacementState,
  previousLessonSlot?: RuntimeSlot,
): void {
  if (
    state.plan.term_ww_interval > 0 &&
    state.lessonsPlaced % state.plan.term_ww_interval === 0
  ) {
    const writtenWork = state.writtenWorks.shift();
    if (writtenWork) {
      placeAssessment(state, writtenWork, true, previousLessonSlot);
    }
  }

  if (
    state.plan.term_pt_interval > 0 &&
    state.lessonsPlaced % state.plan.term_pt_interval === 0
  ) {
    const performanceTask = state.performanceTasks.shift();
    if (performanceTask) {
      placeAssessment(state, performanceTask, true, previousLessonSlot);
    }
  }
}

export function placeRemainingAssessments(state: PlacementState): void {
  placeDueQuizzes(state);

  while (state.writtenWorks.length > 0) {
    const writtenWork = state.writtenWorks.shift();
    if (writtenWork) {
      placeAssessment(state, writtenWork, true);
    }
  }

  while (state.performanceTasks.length > 0) {
    const performanceTask = state.performanceTasks.shift();
    if (performanceTask) {
      placeAssessment(state, performanceTask, true);
    }
  }
}

function placeAssessment(
  state: PlacementState,
  block: RuntimeWrittenWorkBlock | RuntimePerformanceTaskBlock,
  canCompress: boolean,
  previousLessonSlot?: RuntimeSlot,
): void {
  if (state.excessSlots < 0 && canCompress) {
    const compressed =
      isPerformanceTaskBlock(block)
        ? compressPT(state, block, previousLessonSlot)
        : compressNonQuizWW(state, block, previousLessonSlot);

    if (compressed) return;
  }

  const slot = nextContentSlot(state);

  if (slot) {
    assignBlockToSlot(state, block, slot);
    return;
  }

  if (canCompress) {
    const compressed =
      isPerformanceTaskBlock(block)
        ? compressPT(state, block, previousLessonSlot)
        : compressNonQuizWW(state, block, previousLessonSlot);

    if (compressed) return;
  }

  state.warnings.push({
    code: 'NO_AVAILABLE_SLOT',
    severity: 'warning',
    message: `No available slot remains for ${block.title}.`,
    term_key: state.plan.term_key,
    block_key: block.block_key,
  });
}

export function compressNonQuizWW(
  state: PlacementState,
  block: RuntimeWrittenWorkBlock,
  previousLessonSlot?: RuntimeSlot,
): boolean {
  const slot =
    (previousLessonSlot && slotHasRoom(state, previousLessonSlot)
      ? previousLessonSlot
      : undefined) ??
    findLatestSlotWithRoom(state, (occupancy) => Boolean(occupancy.lesson));

  if (!slot) return false;

  assignBlockToSlot(state, block, slot);
  state.excessSlots += 1;
  return true;
}

export function compressPT(
  state: PlacementState,
  block: RuntimePerformanceTaskBlock,
  previousLessonSlot?: RuntimeSlot,
): boolean {
  const slot =
    findLatestSlotWithRoom(
      state,
      (occupancy) => Boolean(occupancy.lesson) && !occupancy.hasWrittenWork,
    ) ??
    findLatestSlotWithRoom(state, (occupancy) => Boolean(occupancy.lesson)) ??
    (previousLessonSlot && slotHasRoom(state, previousLessonSlot)
      ? previousLessonSlot
      : undefined);

  if (!slot) return false;

  assignBlockToSlot(state, block, slot);
  state.excessSlots += 1;
  return true;
}

function nextContentSlot(state: PlacementState): RuntimeSlot | null {
  while (state.contentSlotIndex < state.plan.content_slot_keys.length) {
    const slotKey = state.plan.content_slot_keys[state.contentSlotIndex];
    state.contentSlotIndex += 1;

    const slot = state.slotsByKey.get(slotKey);
    if (!slot || !isUsableSlot(slot)) continue;

    // Skip slots already taken by a preserved/pinned block.
    const occupancy = state.occupancyBySlotKey.get(slotKey);
    if (occupancy && occupancy.blockKeys.length > 0) continue;

    return slot;
  }

  return null;
}

function assignBlockToSlot(
  state: PlacementState,
  block: RuntimeBlock,
  slot: RuntimeSlot,
): void {
  const assignedOrder = slot.assigned_block_keys.length + 1;

  block.slot_id = slot.slot_id ?? null;
  block.slot_key = slot.slot_key;
  block.start_time = slot.start_time;
  block.end_time = slot.end_time;
  block.order_no = assignedOrder;

  if (!slot.assigned_block_keys.includes(block.block_key)) {
    slot.assigned_block_keys.push(block.block_key);
  }

  const occupancy = state.occupancyBySlotKey.get(slot.slot_key) ?? {
    slot,
    hasWrittenWork: false,
    blockKeys: [],
  };

  if (isLessonBlock(block)) {
    occupancy.lesson = block;
  }

  if (isNonQuizWrittenWorkBlock(block)) {
    occupancy.hasWrittenWork = true;
  }

  if (!occupancy.blockKeys.includes(block.block_key)) {
    occupancy.blockKeys.push(block.block_key);
  }

  state.occupancyBySlotKey.set(slot.slot_key, occupancy);
}

export function ensureSpecialExamSlots(
  schedulePlan: TermSchedulePlan[],
  slots: RuntimeSlot[],
  blocks: RuntimeBlock[],
  warnings: AlgorithmWarning[],
): void {
  const slotKeys = new Set(slots.map((slot) => slot.slot_key));
  const lessonPlanId =
    slots[0]?.lesson_plan_id ?? blocks[0]?.lesson_plan_id ?? 'missing_lesson_plan';

  for (const plan of schedulePlan) {
    if (!plan.exam_slot_is_special || slotKeys.has(plan.exam_slot_key)) {
      continue;
    }

    slots.push(makeSpecialExamSlot(plan, lessonPlanId));
    slotKeys.add(plan.exam_slot_key);
    warnings.push({
      code: 'SPECIAL_EXAM_SLOT_CREATED',
      severity: 'info',
      message: `Created a special exam slot for ${plan.term_key} on ${plan.exam_date}.`,
      term_key: plan.term_key,
      slot_key: plan.exam_slot_key,
    });
  }
}

export function deriveTermSchedulePlan(
  terms: TermWindow[],
  slots: RuntimeSlot[],
  blocks: RuntimeBlock[],
): TermSchedulePlan[] {
  const sortedUsableSlots = [...slots]
    .filter((slot) => isUsableSlot(slot))
    .sort(compareSlots);
  const plans: TermSchedulePlan[] = [];
  let cursor = 0;

  for (const term of terms) {
    const termBlocks = blocks.filter(
      (block) => block.metadata.term_key === term.term_key,
    );
    const sample = termBlocks[0];
    const exam_date = readISODate(sample?.metadata.exam_date) ?? term.end_date;
    const explicitExamSlotKey = readSlotKey(sample?.metadata.exam_slot_key);
    const termSlots: RuntimeSlot[] = [];

    while (
      cursor < sortedUsableSlots.length &&
      sortedUsableSlots[cursor].slot_date <= exam_date
    ) {
      termSlots.push(sortedUsableSlots[cursor]);
      cursor += 1;
    }

    const examSlot =
      explicitExamSlotKey
        ? sortedUsableSlots.find((slot) => slot.slot_key === explicitExamSlotKey)
        : [...termSlots].reverse().find((slot) => slot.slot_date === exam_date);
    const exam_slot_key =
      explicitExamSlotKey ??
      examSlot?.slot_key ??
      makeSpecialExamSlotKey(exam_date, term.term_no);
    const term_slot_keys = examSlot
      ? termSlots.map((slot) => slot.slot_key)
      : [...termSlots.map((slot) => slot.slot_key), exam_slot_key];

    plans.push({
      term,
      term_key: term.term_key,
      term_no: term.term_no,
      exam_subcategory: readExamSubcategory(sample) ?? 'final',
      exam_date,
      exam_slot_key,
      exam_slot_is_special: !examSlot,
      term_slot_keys,
      content_slot_keys: term_slot_keys.filter((key) => key !== exam_slot_key),
      term_slots: readNumber(sample?.metadata.term_slots, term_slot_keys.length),
      term_ww: readNumber(sample?.metadata.term_ww, 0),
      term_pt: readNumber(sample?.metadata.term_pt, 0),
      term_lessons: readNumber(sample?.metadata.term_lessons, 0),
      term_ww_interval: readNumber(sample?.metadata.term_ww_interval, 0),
      term_pt_interval: readNumber(sample?.metadata.term_pt_interval, 0),
      excess_slots: readNumber(sample?.metadata.excess_slots, 0),
      queues: buildTermQueues(termBlocks),
    });
  }

  return plans;
}

function buildTermQueues(termBlocks: RuntimeBlock[]): TermBlockQueues {
  const sortedBlocks = [...termBlocks].sort(compareBlocks);

  return {
    lesson_block_keys: sortedBlocks
      .filter((block) => block.session_category === 'lesson')
      .map((block) => block.block_key),
    quiz_block_keys: sortedBlocks
      .filter(isQuizBlock)
      .map((block) => block.block_key),
    written_work_block_keys: sortedBlocks
      .filter(isNonQuizWrittenWorkBlock)
      .map((block) => block.block_key),
    performance_task_block_keys: sortedBlocks
      .filter(isPerformanceTaskBlock)
      .map((block) => block.block_key),
    exam_block_keys: sortedBlocks
      .filter(isExamBlock)
      .map((block) => block.block_key),
    buffer_block_keys: sortedBlocks
      .filter((block) => block.session_category === 'buffer')
      .map((block) => block.block_key),
  };
}

function takeDueQuizzes(
  quizzes: RuntimeWrittenWorkBlock[],
  placedLessonKeys: Set<string>,
): RuntimeWrittenWorkBlock[] {
  const due: RuntimeWrittenWorkBlock[] = [];

  for (let index = quizzes.length - 1; index >= 0; index -= 1) {
    const quiz = quizzes[index];
    const dependencies = quiz.dependency_keys;

    if (
      dependencies.length > 0 &&
      dependencies.every((key) => placedLessonKeys.has(key))
    ) {
      due.unshift(quiz);
      quizzes.splice(index, 1);
    }
  }

  return due;
}

// Scans already-used slots newest-first for the latest one that matches the
// predicate AND still has room under SLOT_CAPACITY. Used by the assessment
// compressors so a written work doesn't get dropped just because the very last
// lesson slot happened to be full — it falls back to an earlier slot with space.
function findLatestSlotWithRoom(
  state: PlacementState,
  predicate: (occupancy: SlotOccupancy) => boolean,
): RuntimeSlot | undefined {
  const entries = Array.from(state.occupancyBySlotKey.values()).reverse();

  for (const occupancy of entries) {
    if (!predicate(occupancy)) continue;
    if (!slotHasRoom(state, occupancy.slot)) continue;
    return occupancy.slot;
  }

  return undefined;
}

function makeSpecialExamSlot(
  plan: TermSchedulePlan,
  lessonPlanId: string,
): RuntimeSlot {
  return {
    slot_id: undefined,
    temp_id: `tmp_special_exam_${sanitizeKey(plan.term_key)}`,
    lesson_plan_id: lessonPlanId,
    slot_key: plan.exam_slot_key,
    title: `${plan.term.title} Exam`,
    slot_date: plan.exam_date,
    weekday: getWeekdayName(plan.exam_date),
    start_time: SPECIAL_EXAM_START_TIME,
    end_time: SPECIAL_EXAM_END_TIME,
    duration_minutes: 1439,
    meeting_type: null,
    slot_number: Number(plan.exam_slot_key.split('#')[1] ?? 9000),
    series_key: `special_exam__${sanitizeKey(plan.term_key)}`,
    is_locked: false,
    blackout: null,
    assigned_block_keys: [],
  };
}

function makeSpecialExamSlotKey(
  exam_date: ISODateString,
  term_no: number,
): SlotKey {
  return `${exam_date}#${9000 + term_no}`;
}

function isUsableSlot(slot: RuntimeSlot): boolean {
  return !slot.blackout && !slot.is_locked;
}

function compareSlots(a: RuntimeSlot, b: RuntimeSlot): number {
  if (a.slot_date !== b.slot_date) {
    return a.slot_date.localeCompare(b.slot_date);
  }

  if (a.start_time !== b.start_time) {
    return a.start_time.localeCompare(b.start_time);
  }

  return a.slot_number - b.slot_number;
}

// Approximates curriculum order so deriveTermSchedulePlan's queues stay stable
// even after placement has overwritten order_no with within-slot positions.
// lesson_no / quiz_no are stamped into metadata by buildBlocks and survive a
// DB round-trip; everything else falls back to order_no then block_key.
function curriculumRank(block: RuntimeBlock): number {
  const lessonNo = block.metadata.lesson_no;
  if (typeof lessonNo === 'number') return lessonNo;

  const quizNo = block.metadata.quiz_no;
  if (typeof quizNo === 'number') return 1_000 + quizNo;

  return 100_000 + block.order_no;
}

function compareBlocks(a: RuntimeBlock, b: RuntimeBlock): number {
  const rankDiff = curriculumRank(a) - curriculumRank(b);
  if (rankDiff !== 0) return rankDiff;

  return a.block_key.localeCompare(b.block_key);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function readISODate(value: unknown): ISODateString | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

function readSlotKey(value: unknown): SlotKey | null {
  return typeof value === 'string' && value.includes('#')
    ? (value as SlotKey)
    : null;
}

function readExamSubcategory(block: RuntimeBlock | undefined) {
  return block?.metadata.exam_subcategory === 'prelim' ||
    block?.metadata.exam_subcategory === 'midterm' ||
    block?.metadata.exam_subcategory === 'final'
    ? block.metadata.exam_subcategory
    : null;
}

function getWeekdayName(date: ISODateString): WeekdayName {
  const [year, month, day] = date.split('-').map(Number);
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekdays: WeekdayName[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];

  return weekdays[weekdayIndex];
}

function sanitizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function isLessonBlock(block: RuntimeBlock): block is RuntimeLessonBlock {
  return block.session_category === 'lesson';
}

function isQuizBlock(
  block: RuntimeBlock,
): block is RuntimeWrittenWorkBlock {
  return (
    block.session_category === 'written_work' &&
    block.session_subcategory === 'quiz'
  );
}

function isNonQuizWrittenWorkBlock(
  block: RuntimeBlock,
): block is RuntimeWrittenWorkBlock {
  return (
    block.session_category === 'written_work' &&
    block.session_subcategory !== 'quiz'
  );
}

function isPerformanceTaskBlock(
  block: RuntimeBlock,
): block is RuntimePerformanceTaskBlock {
  return block.session_category === 'performance_task';
}

function isExamBlock(block: RuntimeBlock): block is RuntimeExamBlock {
  return block.session_category === 'exam';
}

// ======================================================
// SLOT CAPACITY / MERGING
// ======================================================

// How many blocks a single slot may hold once we start doubling up. Two is a
// safe default (lesson + a short assessment). Bump this — or, better, switch to
// a time-budget model using slot.duration_minutes / block.duration_minutes —
// when block durations become trustworthy.
export const SLOT_CAPACITY = 2;

function slotBlockCount(state: PlacementState, slot: RuntimeSlot): number {
  return state.occupancyBySlotKey.get(slot.slot_key)?.blockKeys.length ?? 0;
}

function slotHasRoom(state: PlacementState, slot: RuntimeSlot): boolean {
  return isUsableSlot(slot) && slotBlockCount(state, slot) < SLOT_CAPACITY;
}

// Last-resort host for a lesson that ran out of fresh slots: ride along the
// most recent already-used content slot that still has room and isn't the exam.
// TODO: replace with a cost-aware compatibility matrix (lesson+quiz cheapest,
// lesson+lesson most expensive, anything+exam forbidden) once block weights land.
function findLessonMergeHost(state: PlacementState): RuntimeSlot | undefined {
  const entries = Array.from(state.occupancyBySlotKey.values()).reverse();

  for (const occupancy of entries) {
    if (!slotHasRoom(state, occupancy.slot)) continue;

    const hasExam = occupancy.blockKeys.some(
      (key) => state.blocksByKey.get(key)?.session_category === 'exam',
    );
    if (hasExam) continue;

    return occupancy.slot;
  }

  return undefined;
}

// ======================================================
// TERM BALANCE — single source of truth for slack/pressure
// ======================================================

export function isContentBlock(block: RuntimeBlock): boolean {
  return block.session_category !== 'exam';
}

export function computeTermBalance(
  plan: TermSchedulePlan,
  slots: RuntimeSlot[],
  blocks: RuntimeBlock[],
): TermBalance {
  const slotsByKey = new Map(slots.map((slot) => [slot.slot_key, slot]));
  const usableContentSlotKeys = plan.content_slot_keys.filter((key) => {
    const slot = slotsByKey.get(key);
    return Boolean(slot && isUsableSlot(slot));
  });
  const usableContentSlotKeySet = new Set<SlotKey>(usableContentSlotKeys);

  const termBlocks = blocks.filter(
    (block) => block.metadata.term_key === plan.term_key,
  );
  const contentBlocks = termBlocks.filter(isContentBlock);
  const examBlock = termBlocks.find(isExamBlock);

  const occupiedKeys = new Set<SlotKey>();
  for (const block of contentBlocks) {
    if (block.slot_key && usableContentSlotKeySet.has(block.slot_key)) {
      occupiedKeys.add(block.slot_key);
    }
  }

  const usable_content_slots = usableContentSlotKeys.length;
  const content_blocks = contentBlocks.length;

  return {
    term_key: plan.term_key,
    usable_content_slots,
    occupied_content_slots: occupiedKeys.size,
    vacant_slot_keys: usableContentSlotKeys.filter(
      (key) => !occupiedKeys.has(key),
    ),
    content_blocks,
    slot_pressure: content_blocks - usable_content_slots,
    excess_slots: usable_content_slots - content_blocks,
    exam_placed: Boolean(examBlock && examBlock.slot_key === plan.exam_slot_key),
  };
}

// ======================================================
// REBUILD OCCUPANCY FROM EXISTING PLACEMENTS
// Used by placeBlocks({ respect_existing_placements: true }) so a re-run keeps
// whatever is still validly placed and only re-flows the rest. Callers decide
// which blocks "stay" by leaving their slot_key set before calling placeBlocks
// (e.g. compress() releases everything except pinned/locked/exam/buffer first).
// ======================================================

export function rebuildOccupancyFromPlacements(
  slots: RuntimeSlot[],
  blocks: RuntimeBlock[],
  slotsByKey: Map<SlotKey, RuntimeSlot>,
  occupancyBySlotKey: Map<SlotKey, SlotOccupancy>,
  prePlacedKeys: Set<string>,
  warnings: AlgorithmWarning[] = [],
  unpinnedKeys: Set<string> = new Set<string>(),
): void {
  for (const slot of slots) {
    slot.assigned_block_keys = [];
  }

  for (const block of blocks) {
    const previousSlotKey = block.slot_key ?? null;
    const slot = previousSlotKey ? slotsByKey.get(previousSlotKey) : undefined;

    // No slot, or the slot is no longer usable (blackout/locked) — release it.
    if (!slot || !isUsableSlot(slot)) {
      block.slot_id = null;
      block.slot_key = null;
      block.start_time = undefined;
      block.end_time = undefined;
      block.order_no = 0;

      // A teacher-pinned block with no usable slot (typically: its day got
      // suspended) is the teacher's call, not ours. Keep it locked-but-unplaced
      // and hand it back to the caller (`unpinnedKeys`) so it can be surfaced
      // with re-pin suggestions instead of being silently re-flowed somewhere.
      if (block.is_locked) {
        unpinnedKeys.add(block.block_key);
        if (previousSlotKey) {
          warnings.push({
            code: 'LOCKED_BLOCK_CONFLICT',
            severity: 'warning',
            message: `${block.title} was pinned to a day that is now unavailable — pick a new day for it.`,
            block_key: block.block_key,
            slot_key: previousSlotKey,
          });
        }
      }
      continue;
    }

    block.slot_id = slot.slot_id ?? null;
    block.start_time = slot.start_time;
    block.end_time = slot.end_time;
    prePlacedKeys.add(block.block_key);

    if (!slot.assigned_block_keys.includes(block.block_key)) {
      slot.assigned_block_keys.push(block.block_key);
    }

    const occupancy = occupancyBySlotKey.get(slot.slot_key) ?? {
      slot,
      hasWrittenWork: false,
      blockKeys: [],
    };

    if (isLessonBlock(block)) {
      occupancy.lesson = block;
    }
    if (isNonQuizWrittenWorkBlock(block)) {
      occupancy.hasWrittenWork = true;
    }
    if (!occupancy.blockKeys.includes(block.block_key)) {
      occupancy.blockKeys.push(block.block_key);
    }

    occupancyBySlotKey.set(slot.slot_key, occupancy);
  }
}
