import type {
  ActivityRow,
  BuildBlocksParams,
  BlockSource,
  ExamSubcategory,
  ISODateString,
  LessonRow,
  PerformanceTaskSubcategory,
  RuntimeBlock,
  RuntimeBufferBlock,
  RuntimeExamBlock,
  RuntimeLessonBlock,
  RuntimePerformanceTaskBlock,
  RuntimeSlot,
  RuntimeWrittenWorkBlock,
  SessionSubcategory,
  SlotKey,
  TempId,
  TermBlockQueues,
  TermSchedulePlan,
  TermWindow,
  WrittenWorkSubcategory,
} from './00_types';

const DEFAULT_BLOCK_DURATION_MINUTES = 60;

const EXAM_SUBCATEGORIES_BY_INDEX: ExamSubcategory[] = [
  'prelim',
  'midterm',
  'final',
];

const CONTENT_EXCESS_PRIORITY: ExamSubcategory[] = ['prelim', 'midterm', 'final'];

const WRITTEN_WORK_SUBCATEGORIES: Exclude<WrittenWorkSubcategory, 'quiz'>[] = [
  'assignment',
  'seatwork',
];

const PERFORMANCE_TASK_SUBCATEGORIES: PerformanceTaskSubcategory[] = [
  'activity',
  'lab_report',
  'reporting',
  'project',
];

type TermIdentity = {
  term: TermWindow;
  exam_subcategory: ExamSubcategory;
};

export type TermBlockCounts = {
  term_key: string;
  term_no: number;
  exam_subcategory: ExamSubcategory;
  total_slots: number;
  exam_count: number;
  term_slots: number;
  term_ww: number;
  term_pt: number;
  term_lessons: number;
  term_ww_interval: number;
  term_pt_interval: number;
  excess_slots: number;
  exam_date: ISODateString;
  exam_slot_key: SlotKey;
  exam_slot_is_special: boolean;
  term_slot_keys: SlotKey[];
  content_slot_keys: SlotKey[];
  quiz_count: number;
  remaining_ww_count: number;
};

export type BlockComputation = {
  total_slots: number;
  exam_count: number;
  written_work_count: number;
  performance_task_count: number;
  lesson_count: number;
  terms: TermBlockCounts[];
};

type QuizScopeDraft = {
  quiz_no: number;
  lessons: LessonRow[];
  first_lesson_label: string;
  last_lesson_label: string;
};

export function buildBlocks(params: BuildBlocksParams): RuntimeBlock[] {
  const computation = computeBlockComputation(params);
  const terms = getTerms(params);
  const lessonsByTerm = distributeItemsByCounts(
    sortLessons(params.lessons),
    computation.terms.map((term) => term.term_lessons),
  );
  const rng = createSeededRandom(params.lesson_plan.lesson_plan_id);
  const blocks: RuntimeBlock[] = [];
  let order_no = 1;

  for (let termIndex = 0; termIndex < terms.length; termIndex += 1) {
    const term = terms[termIndex];
    const counts = computation.terms[termIndex];
    const termLessons = lessonsByTerm[termIndex] ?? [];
    const termBlocks: RuntimeBlock[] = [];

    const lessonBlocks = termLessons.map((lesson, lessonIndex) =>
      makeLessonBlock(params, term, lesson, lessonIndex + 1),
    );
    termBlocks.push(...lessonBlocks);

    const quizScopes = buildQuizScopes(termLessons, counts.quiz_count);
    termBlocks.push(
      ...quizScopes.map((scope) => makeQuizBlock(params, term, scope)),
    );

    const remainingWrittenWorkSubcategories = takeRandomized(
      WRITTEN_WORK_SUBCATEGORIES,
      counts.remaining_ww_count,
      rng,
    );
    termBlocks.push(
      ...remainingWrittenWorkSubcategories.map((subcategory, index) =>
        makeWrittenWorkBlock(params, term, subcategory, index + 1),
      ),
    );

    const performanceTaskSubcategories = takeRandomized(
      PERFORMANCE_TASK_SUBCATEGORIES,
      counts.term_pt,
      rng,
    );
    termBlocks.push(
      ...performanceTaskSubcategories.map((subcategory, index) =>
        makePerformanceTaskBlock(params, term, subcategory, index + 1),
      ),
    );

    const examBlock = makeExamBlock(params, term);
    examBlock.dependency_keys = termBlocks.map((block) => block.block_key);
    termBlocks.push(examBlock);

    if (termIndex === 0) {
      termBlocks.unshift(makeOrientationBlock(params, term));
    }

    for (const block of termBlocks) {
      block.metadata = {
        ...block.metadata,
        ...makeTermCountMetadata(counts),
      };
      block.order_no = order_no;
      order_no += 1;
      blocks.push(block);
    }
  }

  return blocks;
}

export function buildTermSchedulePlan(
  params: BuildBlocksParams,
  blocks: RuntimeBlock[] = [],
): TermSchedulePlan[] {
  const computation = computeBlockComputation(params);

  return computation.terms.map((counts) => ({
    term: params.rules.terms.find((term) => term.term_key === counts.term_key)!,
    term_key: counts.term_key,
    term_no: counts.term_no,
    exam_subcategory: counts.exam_subcategory,
    exam_date: counts.exam_date,
    exam_slot_key: counts.exam_slot_key,
    exam_slot_is_special: counts.exam_slot_is_special,
    term_slot_keys: counts.term_slot_keys,
    content_slot_keys: counts.content_slot_keys,
    term_slots: counts.term_slots,
    term_ww: counts.term_ww,
    term_pt: counts.term_pt,
    term_lessons: counts.term_lessons,
    term_ww_interval: counts.term_ww_interval,
    term_pt_interval: counts.term_pt_interval,
    excess_slots: counts.excess_slots,
    queues: buildTermQueues(blocks, counts.term_key),
  }));
}

export function computeBlockComputation(
  params: BuildBlocksParams,
): BlockComputation {
  const terms = getTerms(params);
  const exam_count = terms.length;
  const total_slots = params.slots.filter(
    (slot) =>
      slot.lesson_plan_id === params.lesson_plan.lesson_plan_id &&
      !slot.blackout,
  ).length;
  const lesson_count = params.lessons.length;
  const written_work_count =
    countRuleRequirements(params, 'written_work_count') ??
    params.activities.filter(isWrittenWorkActivity).length;
  const performance_task_count =
    countRuleRequirements(params, 'performance_task_count') ??
    params.activities.filter(isPerformanceTaskActivity).length;

  const termSlotPlans = computeTermSlotPlans(
    params.slots,
    params.lesson_plan.lesson_plan_id,
    terms,
  );
  const termWrittenWork = distributeCount(
    written_work_count,
    terms,
    CONTENT_EXCESS_PRIORITY,
  );
  const termPerformanceTasks = distributeCount(
    performance_task_count,
    terms,
    CONTENT_EXCESS_PRIORITY,
  );
  const termLessons = distributeCount(
    lesson_count,
    terms,
    CONTENT_EXCESS_PRIORITY,
  );

  return {
    total_slots,
    exam_count,
    written_work_count,
    performance_task_count,
    lesson_count,
    terms: terms.map((term, index) => {
      const quiz_count = Math.min(
        Math.floor(termLessons[index] / 2),
        termWrittenWork[index],
      );
      const remaining_ww_count = termWrittenWork[index] - quiz_count;
      const term_ww_interval = computeInterval(
        termLessons[index],
        remaining_ww_count,
      );
      const term_pt_interval = computeInterval(
        termLessons[index],
        termPerformanceTasks[index],
      );
      const excess_slots =
        termSlotPlans[index].term_slot_keys.length -
        1 -
        termLessons[index] -
        termWrittenWork[index] -
        termPerformanceTasks[index];

      return {
        term_key: term.term.term_key,
        term_no: term.term.term_no,
        exam_subcategory: term.exam_subcategory,
        total_slots,
        exam_count,
        term_slots: termSlotPlans[index].term_slot_keys.length,
        term_ww: termWrittenWork[index],
        term_pt: termPerformanceTasks[index],
        term_lessons: termLessons[index],
        term_ww_interval,
        term_pt_interval,
        excess_slots,
        exam_date: termSlotPlans[index].exam_date,
        exam_slot_key: termSlotPlans[index].exam_slot_key,
        exam_slot_is_special: termSlotPlans[index].exam_slot_is_special,
        term_slot_keys: termSlotPlans[index].term_slot_keys,
        content_slot_keys: termSlotPlans[index].term_slot_keys.filter(
          (slot_key) => slot_key !== termSlotPlans[index].exam_slot_key,
        ),
        quiz_count,
        remaining_ww_count,
      };
    }),
  };
}

function getTerms(params: BuildBlocksParams): TermIdentity[] {
  if (params.rules.terms.length === 0) {
    throw new Error('Cannot build blocks without at least one term.');
  }

  return params.rules.terms.map((term, index) => ({
    term,
    exam_subcategory:
      term.exam_subcategory ?? EXAM_SUBCATEGORIES_BY_INDEX[index] ?? 'final',
  }));
}

function distributeCount(
  total: number,
  terms: TermIdentity[],
  priority: ExamSubcategory[],
): number[] {
  const base = Math.floor(total / terms.length);
  let remaining = total - base * terms.length;
  const counts = terms.map(() => base);
  const priorityIndexes = priority
    .map((subcategory) =>
      terms.findIndex((term) => term.exam_subcategory === subcategory),
    )
    .filter((index) => index >= 0);

  for (const index of priorityIndexes) {
    if (remaining <= 0) break;
    counts[index] += 1;
    remaining -= 1;
  }

  for (let index = terms.length - 1; remaining > 0 && index >= 0; index -= 1) {
    if (priorityIndexes.includes(index)) continue;
    counts[index] += 1;
    remaining -= 1;
  }

  return counts;
}

type TermSlotPlan = {
  exam_date: ISODateString;
  exam_slot_key: SlotKey;
  exam_slot_is_special: boolean;
  term_slot_keys: SlotKey[];
};

function computeTermSlotPlans(
  slots: RuntimeSlot[],
  lessonPlanId: string,
  terms: TermIdentity[],
): TermSlotPlan[] {
  const sortedSlots = [...slots]
    .filter(
      (slot) =>
        slot.lesson_plan_id === lessonPlanId && !slot.is_locked && !slot.blackout,
    )
    .sort(compareSlots);
  const plans: TermSlotPlan[] = [];
  let cursor = 0;

  for (const term of terms) {
    const exam_date = term.term.end_date;
    const termSlots: RuntimeSlot[] = [];

    while (
      cursor < sortedSlots.length &&
      sortedSlots[cursor].slot_date <= exam_date
    ) {
      termSlots.push(sortedSlots[cursor]);
      cursor += 1;
    }

    const examSlot = [...termSlots]
      .reverse()
      .find((slot) => slot.slot_date === exam_date);
    const exam_slot_key =
      examSlot?.slot_key ?? makeSpecialExamSlotKey(exam_date, term.term.term_no);

    plans.push({
      exam_date,
      exam_slot_key,
      exam_slot_is_special: !examSlot,
      term_slot_keys: examSlot
        ? termSlots.map((slot) => slot.slot_key)
        : [...termSlots.map((slot) => slot.slot_key), exam_slot_key],
    });
  }

  return plans;
}

function computeInterval(lessonCount: number, blockCount: number): number {
  if (lessonCount <= 0 || blockCount <= 0) return 0;

  return Math.max(1, Math.floor(lessonCount / blockCount));
}

function distributeItemsByCounts<T>(items: T[], counts: number[]): T[][] {
  const groups: T[][] = [];
  let offset = 0;

  for (const count of counts) {
    groups.push(items.slice(offset, offset + count));
    offset += count;
  }

  return groups;
}

function sortLessons(lessons: LessonRow[]): LessonRow[] {
  return [...lessons].sort((a, b) => {
    if (a.sequence_no !== b.sequence_no) {
      return a.sequence_no - b.sequence_no;
    }

    return a.title.localeCompare(b.title);
  });
}

function buildQuizScopes(
  lessons: LessonRow[],
  quizCount: number,
): QuizScopeDraft[] {
  if (quizCount <= 0) return [];

  const scopes: QuizScopeDraft[] = [];
  let startIndex = 0;

  for (let quizIndex = 0; quizIndex < quizCount; quizIndex += 1) {
    const remainingLessons = lessons.length - startIndex;
    const remainingQuizzes = quizCount - quizIndex;
    const scopeSize =
      remainingQuizzes === 1 ? remainingLessons : Math.min(2, remainingLessons);
    const scopedLessons = lessons.slice(startIndex, startIndex + scopeSize);

    if (scopedLessons.length === 0) break;

    const firstLesson = scopedLessons[0];
    const lastLesson = scopedLessons[scopedLessons.length - 1];

    scopes.push({
      quiz_no: quizIndex + 1,
      lessons: scopedLessons,
      first_lesson_label: lessonLabel(firstLesson),
      last_lesson_label: lessonLabel(lastLesson),
    });

    startIndex += scopeSize;
  }

  return scopes;
}

function makeLessonBlock(
  params: BuildBlocksParams,
  term: TermIdentity,
  lesson: LessonRow,
  lesson_no: number,
): RuntimeLessonBlock {
  return {
    ...makeBlockBase(
      params,
      term,
      `lesson:${lesson.lesson_id}`,
      lesson.title,
      'lesson',
      lesson.estimated_minutes ?? DEFAULT_BLOCK_DURATION_MINUTES,
    ),
    lesson_id: lesson.lesson_id,
    session_category: 'lesson',
    session_subcategory: 'lecture',
    preferred_session_type: 'lecture',
    ww_subtype: null,
    pt_subtype: null,
    metadata: {
      ...makeTermMetadata(term),
      source: 'lesson',
      source_lesson_id: lesson.lesson_id,
      lesson_no,
      generated_by_algorithm: true,
    },
  };
}

function makeQuizBlock(
  params: BuildBlocksParams,
  term: TermIdentity,
  scope: QuizScopeDraft,
): RuntimeWrittenWorkBlock {
  const block = makeWrittenWorkBlock(
    params,
    term,
    'quiz',
    scope.quiz_no,
    `${titleCase(term.exam_subcategory)} Quiz ${scope.quiz_no}: ${scope.first_lesson_label}-${scope.last_lesson_label}`,
  );

  block.dependency_keys = scope.lessons.map((lesson) =>
    buildBlockKey(term.term.term_key, `lesson:${lesson.lesson_id}`),
  );
  block.metadata = {
    ...block.metadata,
    scope_lesson_ids: scope.lessons.map((lesson) => lesson.lesson_id),
    scope_summary: `${scope.first_lesson_label}-${scope.last_lesson_label}`,
    quiz_no: scope.quiz_no,
    quiz_scope_start_label: scope.first_lesson_label,
    quiz_scope_end_label: scope.last_lesson_label,
  };

  return block;
}

function makeWrittenWorkBlock(
  params: BuildBlocksParams,
  term: TermIdentity,
  subcategory: WrittenWorkSubcategory,
  ordinal: number,
  title = `${titleCase(subcategory)} ${ordinal}`,
): RuntimeWrittenWorkBlock {
  const activity = findActivity(params.activities, 'written_work', subcategory);

  return {
    ...makeBlockBase(
      params,
      term,
      `written_work:${subcategory}:${ordinal}`,
      activity?.title ?? title,
      activity ? 'activity' : 'generated',
      DEFAULT_BLOCK_DURATION_MINUTES,
    ),
    session_category: 'written_work',
    session_subcategory: subcategory,
    preferred_session_type: 'any',
    ww_subtype: subcategory,
    pt_subtype: null,
    metadata: {
      ...makeTermMetadata(term),
      source: activity ? 'activity' : 'generated',
      ...(activity ? { source_activity_id: activity.activity_id } : {}),
      ...(activity ? { scope_lesson_ids: activity.scope_lesson_ids } : {}),
      ...(activity?.scope_summary
        ? { scope_summary: activity.scope_summary }
        : {}),
      generated_by_algorithm: !activity,
    },
  };
}

function makePerformanceTaskBlock(
  params: BuildBlocksParams,
  term: TermIdentity,
  subcategory: PerformanceTaskSubcategory,
  ordinal: number,
): RuntimePerformanceTaskBlock {
  const activity = findActivity(
    params.activities,
    'performance_task',
    subcategory,
  );

  return {
    ...makeBlockBase(
      params,
      term,
      `performance_task:${subcategory}:${ordinal}`,
      activity?.title ?? `${titleCase(subcategory)} ${ordinal}`,
      activity ? 'activity' : 'generated',
      DEFAULT_BLOCK_DURATION_MINUTES,
    ),
    session_category: 'performance_task',
    session_subcategory: subcategory,
    preferred_session_type: 'any',
    ww_subtype: null,
    pt_subtype: subcategory,
    metadata: {
      ...makeTermMetadata(term),
      source: activity ? 'activity' : 'generated',
      ...(activity ? { source_activity_id: activity.activity_id } : {}),
      ...(activity ? { scope_lesson_ids: activity.scope_lesson_ids } : {}),
      ...(activity?.scope_summary
        ? { scope_summary: activity.scope_summary }
        : {}),
      generated_by_algorithm: !activity,
    },
  };
}

function makeExamBlock(
  params: BuildBlocksParams,
  term: TermIdentity,
): RuntimeExamBlock {
  return {
    ...makeBlockBase(
      params,
      term,
      `exam:${term.exam_subcategory}`,
      `${titleCase(term.exam_subcategory)} Exam`,
      'exam',
      DEFAULT_BLOCK_DURATION_MINUTES,
    ),
    session_category: 'exam',
    session_subcategory: term.exam_subcategory,
    preferred_session_type: 'any',
    ww_subtype: null,
    pt_subtype: null,
    metadata: {
      ...makeTermMetadata(term),
      source: 'exam',
      generated_by_algorithm: true,
    },
  };
}

function makeOrientationBlock(
  params: BuildBlocksParams,
  term: TermIdentity,
): RuntimeBufferBlock {
  return {
    ...makeBlockBase(
      params,
      term,
      'buffer:orientation',
      'Orientation',
      'buffer',
      DEFAULT_BLOCK_DURATION_MINUTES,
    ),
    session_category: 'buffer',
    session_subcategory: 'orientation',
    preferred_session_type: 'any',
    ww_subtype: null,
    pt_subtype: null,
    metadata: {
      ...makeTermMetadata(term),
      source: 'buffer',
      generated_by_algorithm: true,
    },
  };
}

function makeBlockBase(
  params: BuildBlocksParams,
  term: TermIdentity,
  localKey: string,
  title: string,
  source: BlockSource,
  duration_minutes: number,
) {
  const block_key = buildBlockKey(term.term.term_key, localKey);

  return {
    temp_id: makeTempId(block_key),
    lesson_plan_id: params.lesson_plan.lesson_plan_id,
    slot_id: null,
    slot_key: null,
    root_block_id: null,
    lesson_id: null,
    algorithm_block_key: block_key,
    block_key,
    title,
    description: null,
    meeting_type: null,
    duration_minutes,
    required: true,
    splittable: false,
    dependency_keys: [],
    order_no: 0,
    is_locked: false,
    source,
    metadata: makeTermMetadata(term),
  };
}

function makeTermMetadata(term: TermIdentity) {
  return {
    term_key: term.term.term_key,
    term_no: term.term.term_no,
    exam_subcategory: term.exam_subcategory,
  };
}

function makeTermCountMetadata(counts: TermBlockCounts) {
  return {
    term_slots: counts.term_slots,
    term_ww: counts.term_ww,
    term_pt: counts.term_pt,
    term_lessons: counts.term_lessons,
    term_ww_interval: counts.term_ww_interval,
    term_pt_interval: counts.term_pt_interval,
    excess_slots: counts.excess_slots,
    exam_date: counts.exam_date,
    exam_slot_key: counts.exam_slot_key,
    exam_slot_is_special: counts.exam_slot_is_special,
  };
}

function buildTermQueues(
  blocks: RuntimeBlock[],
  term_key: string,
): TermBlockQueues {
  const termBlocks = blocks.filter((block) => block.metadata.term_key === term_key);

  return {
    lesson_block_keys: termBlocks
      .filter((block) => block.session_category === 'lesson')
      .map((block) => block.block_key),
    quiz_block_keys: termBlocks
      .filter(
        (block) =>
          block.session_category === 'written_work' &&
          block.session_subcategory === 'quiz',
      )
      .map((block) => block.block_key),
    written_work_block_keys: termBlocks
      .filter(
        (block) =>
          block.session_category === 'written_work' &&
          block.session_subcategory !== 'quiz',
      )
      .map((block) => block.block_key),
    performance_task_block_keys: termBlocks
      .filter((block) => block.session_category === 'performance_task')
      .map((block) => block.block_key),
    exam_block_keys: termBlocks
      .filter((block) => block.session_category === 'exam')
      .map((block) => block.block_key),
    buffer_block_keys: termBlocks
      .filter((block) => block.session_category === 'buffer')
      .map((block) => block.block_key),
  };
}

function buildBlockKey(term_key: string, localKey: string): string {
  return `${sanitizeKey(term_key)}__${sanitizeKey(localKey)}`;
}

function makeTempId(block_key: string): TempId {
  return `tmp_${sanitizeKey(block_key)}`;
}

function sanitizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function lessonLabel(lesson: LessonRow): string {
  return `L${lesson.sequence_no}`;
}

function titleCase(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

function makeSpecialExamSlotKey(
  exam_date: ISODateString,
  term_no: number,
): SlotKey {
  return `${exam_date}#${9000 + term_no}`;
}

function takeRandomized<T>(values: readonly T[], count: number, rng: () => number): T[] {
  const result: T[] = [];

  for (let index = 0; index < count; index += 1) {
    result.push(values[Math.floor(rng() * values.length)]);
  }

  return result;
}

function createSeededRandom(seedValue: string): () => number {
  let seed = 2166136261;

  for (let index = 0; index < seedValue.length; index += 1) {
    seed ^= seedValue.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }

  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function countRuleRequirements(
  params: BuildBlocksParams,
  key: 'written_work_count' | 'performance_task_count',
): number | null {
  const values = params.rules.term_rules
    .map((rule) => rule.requirements[key])
    .filter((value): value is number => typeof value === 'number');

  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0);
}

function isWrittenWorkActivity(
  activity: ActivityRow,
): activity is Extract<ActivityRow, { category: 'written_work' }> {
  return activity.category === 'written_work' && activity.activity_type !== 'exam';
}

function isPerformanceTaskActivity(
  activity: ActivityRow,
): activity is Extract<ActivityRow, { category: 'performance_task' }> {
  return activity.category === 'performance_task';
}

function findActivity(
  activities: ActivityRow[],
  category: 'written_work',
  subcategory: WrittenWorkSubcategory,
): Extract<ActivityRow, { category: 'written_work' }> | undefined;
function findActivity(
  activities: ActivityRow[],
  category: 'performance_task',
  subcategory: PerformanceTaskSubcategory,
): Extract<ActivityRow, { category: 'performance_task' }> | undefined;
function findActivity(
  activities: ActivityRow[],
  category: 'written_work' | 'performance_task',
  subcategory: SessionSubcategory,
): ActivityRow | undefined {
  return activities.find((activity) => {
    if (activity.category !== category) return false;

    if (activity.category === 'performance_task' && activity.activity_type === 'other') {
      return subcategory === 'activity';
    }

    return activity.activity_type === subcategory;
  });
}
