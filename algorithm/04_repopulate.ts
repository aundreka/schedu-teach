import type {
  AlgorithmWarning,
  ApplyRepopulateChoicesParams,
  ApplyRepopulateChoicesResult,
  BufferSubcategory,
  PerformanceTaskSubcategory,
  RepopulateChoice,
  RepopulateOption,
  RepopulateParams,
  RepopulateResult,
  RuntimeBlock,
  RuntimeBufferBlock,
  RuntimeSlot,
  SlotKey,
  TempId,
  TermBalance,
  TermSchedulePlan,
  VacancyPlacement,
  VacancyReport,
  VacancySuggestion,
  WrittenWorkSubcategory,
} from './00_types';
import { computeTermBalance, deriveTermSchedulePlan } from './03_rules';

// ======================================================
// REPOPULATE
// Run when a term has slack (excess_slots > 0) — usually trailing slots before
// the exam, slots after the last quiz, or a mid-term hole left by a removed
// holiday. This module does NOT mutate the plan: it reports where the empty
// slots are and what could go in each, with a recommended default. The teacher
// picks, then applyRepopulateChoices() inserts the blocks.
// ======================================================

const DEFAULT_REPOPULATE_BLOCK_DURATION_MINUTES = 60;

const WRITTEN_WORK_OPTIONS: WrittenWorkSubcategory[] = ['assignment', 'seatwork'];
const PERFORMANCE_TASK_OPTIONS: PerformanceTaskSubcategory[] = [
  'activity',
  'project',
];
const BUFFER_OPTIONS: BufferSubcategory[] = ['review', 'preparation'];

export function repopulate(params: RepopulateParams): RepopulateResult {
  const schedulePlan =
    params.schedule_plan ??
    deriveTermSchedulePlan(params.rules.terms, params.slots, params.blocks);
  const reports: VacancyReport[] = [];
  const warnings: AlgorithmWarning[] = [];

  for (const plan of schedulePlan) {
    const balance = computeTermBalance(plan, params.slots, params.blocks);
    if (balance.excess_slots <= 0) continue;

    reports.push(buildVacancyReport(plan, balance, params));
    warnings.push({
      code: 'VACANCY_AVAILABLE',
      severity: 'info',
      message: `${plan.term.title} has ${balance.excess_slots} open session(s) available.`,
      term_key: plan.term_key,
    });
  }

  return { reports, warnings };
}

export function applyRepopulateChoices(
  params: ApplyRepopulateChoicesParams,
): ApplyRepopulateChoicesResult {
  const slots = params.slots.map((slot) => ({
    ...slot,
    assigned_block_keys: [...slot.assigned_block_keys],
  }));
  const blocks = params.blocks.map((block) => ({
    ...block,
    metadata: { ...block.metadata },
  }));
  const slotsByKey = new Map(slots.map((slot) => [slot.slot_key, slot]));
  const inserted_block_keys: string[] = [];
  const warnings: AlgorithmWarning[] = [];
  const ordinals = new Map<string, number>();

  for (const choice of params.choices) {
    const slot = slotsByKey.get(choice.slot_key);
    if (!slot) {
      warnings.push({
        code: 'NO_AVAILABLE_SLOT',
        severity: 'warning',
        message: `Cannot apply repopulation: slot ${choice.slot_key} no longer exists.`,
        slot_key: choice.slot_key,
      });
      continue;
    }

    const plan = params.schedule_plan.find((candidate) =>
      candidate.content_slot_keys.includes(choice.slot_key),
    );
    const termKey = plan?.term_key ?? 'unscheduled';
    const ordinalKey = `${termKey}:${choice.kind}:${choice.subcategory}`;
    const ordinal = (ordinals.get(ordinalKey) ?? 0) + 1;
    ordinals.set(ordinalKey, ordinal);

    const block = makeRepopulateBlock(slot, termKey, plan, choice, ordinal);
    blocks.push(block);
    if (!slot.assigned_block_keys.includes(block.block_key)) {
      slot.assigned_block_keys.push(block.block_key);
    }
    inserted_block_keys.push(block.block_key);
  }

  if (inserted_block_keys.length > 0) {
    warnings.push({
      code: 'REPOPULATION_APPLIED',
      severity: 'info',
      message: `Inserted ${inserted_block_keys.length} block(s) into open slots.`,
    });
  }

  return { slots, blocks, inserted_block_keys, warnings };
}

// ------------------------------------------------------
// Vacancy report
// ------------------------------------------------------

function buildVacancyReport(
  plan: TermSchedulePlan,
  balance: TermBalance,
  params: RepopulateParams,
): VacancyReport {
  const slotsByKey = new Map(params.slots.map((slot) => [slot.slot_key, slot]));
  const termBlocks = params.blocks.filter(
    (block) => block.metadata.term_key === plan.term_key,
  );
  const occupiedContentKeys = new Set<SlotKey>(
    termBlocks
      .filter((block) => block.session_category !== 'exam' && Boolean(block.slot_key))
      .map((block) => block.slot_key as SlotKey),
  );
  const lastOccupiedIndex = lastIndexInPlan(
    plan,
    (key) => occupiedContentKeys.has(key),
  );
  const lastQuizIndex = lastIndexInPlan(plan, (key) =>
    termBlocks.some(
      (block) =>
        block.slot_key === key &&
        block.session_category === 'written_work' &&
        block.session_subcategory === 'quiz',
    ),
  );

  const before_exam: SlotKey[] = [];
  const after_last_quiz: SlotKey[] = [];
  const mid_term_gaps: SlotKey[] = [];

  const suggestions: VacancySuggestion[] = balance.vacant_slot_keys.map(
    (slotKey) => {
      const slot = slotsByKey.get(slotKey);
      const index = plan.content_slot_keys.indexOf(slotKey);
      const isTail = lastOccupiedIndex < 0 || index >= lastOccupiedIndex;
      const isAfterLastQuiz = lastQuizIndex >= 0 && index >= lastQuizIndex;

      let placement: VacancyPlacement;
      if (isTail) {
        placement = 'before_exam';
        before_exam.push(slotKey);
      } else if (isAfterLastQuiz) {
        placement = 'after_last_quiz';
        mid_term_gaps.push(slotKey);
      } else {
        placement = 'mid_term_gap';
        mid_term_gaps.push(slotKey);
      }
      if (isAfterLastQuiz) after_last_quiz.push(slotKey);

      const options = buildOptions(params);
      return {
        slot_key: slotKey,
        slot_id: slot?.slot_id,
        slot_date: slot?.slot_date ?? plan.exam_date,
        placement,
        options,
        recommended_index: recommendOption(options, placement, params),
      };
    },
  );

  return {
    term_key: plan.term_key,
    excess_slots: balance.excess_slots,
    vacant_slot_keys: balance.vacant_slot_keys,
    before_exam,
    after_last_quiz,
    mid_term_gaps,
    suggestions,
  };
}

function lastIndexInPlan(
  plan: TermSchedulePlan,
  predicate: (slotKey: SlotKey) => boolean,
): number {
  let last = -1;
  plan.content_slot_keys.forEach((key, index) => {
    if (predicate(key)) last = index;
  });
  return last;
}

function buildOptions(params: RepopulateParams): RepopulateOption[] {
  const options: RepopulateOption[] = [];

  if (params.rules.allow_buffer_blocks) {
    for (const subcategory of BUFFER_OPTIONS) {
      options.push({ kind: 'buffer', subcategory, label: titleCase(subcategory) });
    }
  }
  for (const subcategory of WRITTEN_WORK_OPTIONS) {
    options.push({
      kind: 'written_work',
      subcategory,
      label: titleCase(subcategory),
    });
  }
  for (const subcategory of PERFORMANCE_TASK_OPTIONS) {
    options.push({
      kind: 'performance_task',
      subcategory,
      label: titleCase(subcategory),
    });
  }

  return options;
}

function recommendOption(
  options: RepopulateOption[],
  placement: VacancyPlacement,
  params: RepopulateParams,
): number {
  const indexOf = (predicate: (option: RepopulateOption) => boolean): number => {
    const index = options.findIndex(predicate);
    return index >= 0 ? index : 0;
  };

  if (
    (placement === 'before_exam' || placement === 'term_tail') &&
    params.rules.allow_buffer_blocks
  ) {
    return indexOf(
      (option) => option.kind === 'buffer' && option.subcategory === 'review',
    );
  }
  if (placement === 'after_last_quiz') {
    return indexOf(
      (option) =>
        option.kind === 'performance_task' && option.subcategory === 'activity',
    );
  }
  return indexOf((option) => option.kind === 'written_work');
}

// ------------------------------------------------------
// Block factory for applied choices
// ------------------------------------------------------

function makeRepopulateBlock(
  slot: RuntimeSlot,
  termKey: string,
  plan: TermSchedulePlan | undefined,
  choice: RepopulateChoice,
  ordinal: number,
): RuntimeBlock {
  const localKey = `repop:${choice.kind}:${choice.subcategory}:${ordinal}`;
  const block_key = `${sanitizeKey(termKey)}__${sanitizeKey(localKey)}`;
  const temp_id = `tmp_${sanitizeKey(block_key)}` as TempId;
  const title = choice.title ?? `${titleCase(choice.subcategory)} ${ordinal}`;

  const base = {
    block_id: undefined,
    temp_id,
    lesson_plan_id: slot.lesson_plan_id,
    slot_id: slot.slot_id ?? null,
    slot_key: slot.slot_key,
    root_block_id: null,
    lesson_id: null,
    algorithm_block_key: block_key,
    block_key,
    title,
    description: null,
    meeting_type: null,
    start_time: slot.start_time,
    end_time: slot.end_time,
    duration_minutes: DEFAULT_REPOPULATE_BLOCK_DURATION_MINUTES,
    required: false,
    splittable: false,
    preferred_session_type: 'any' as const,
    dependency_keys: [] as string[],
    order_no: slot.assigned_block_keys.length + 1,
    is_locked: false,
    source: 'generated' as const,
    metadata: {
      ...(plan
        ? {
            term_key: plan.term_key,
            term_no: plan.term_no,
            exam_subcategory: plan.exam_subcategory,
          }
        : {}),
      source: 'generated' as const,
      generated_by_algorithm: true,
    },
  };

  if (choice.kind === 'written_work') {
    const subcategory = choice.subcategory as WrittenWorkSubcategory;
    return {
      ...base,
      session_category: 'written_work',
      session_subcategory: subcategory,
      ww_subtype: subcategory,
      pt_subtype: null,
    };
  }
  if (choice.kind === 'performance_task') {
    const subcategory = choice.subcategory as PerformanceTaskSubcategory;
    return {
      ...base,
      session_category: 'performance_task',
      session_subcategory: subcategory,
      ww_subtype: null,
      pt_subtype: subcategory,
    };
  }
  const subcategory = choice.subcategory as RuntimeBufferBlock['session_subcategory'];
  return {
    ...base,
    session_category: 'buffer',
    session_subcategory: subcategory,
    ww_subtype: null,
    pt_subtype: null,
  };
}

function sanitizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function titleCase(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
