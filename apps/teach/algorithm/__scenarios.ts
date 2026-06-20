// algorithm/__scenarios.ts
// Production-readiness scenario tests.
//   npm run test:scenarios

import type {
  AlgorithmInput,
  AlgorithmRules,
  LessonPlanRow,
  LessonRow,
  MeetingPattern,
  RuntimeBlock,
  RuntimeSlot,
} from './00_types';
import {
  applyRepopulateChoices,
  buildPlan,
  rebalance,
  rebalanceDay,
  repopulate,
} from './07_run';

// ─────────────────────────────────────────────────────
// Tiny assertion harness (identical to __invariants.ts)
// ─────────────────────────────────────────────────────
let failures = 0;

function ok(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    console.error(`  FAIL ${msg}`);
    failures += 1;
  }
}

function section(name: string): void {
  console.log(`\n# ${name}`);
}

const TS = '2026-01-01T00:00:00Z';

const cloneSlots = (slots: RuntimeSlot[]): RuntimeSlot[] =>
  slots.map((s) => ({ ...s, assigned_block_keys: [...s.assigned_block_keys] }));

const unplacedCount = (blocks: RuntimeBlock[]): number =>
  blocks.filter((b) => b.session_category !== 'exam' && !b.slot_key).length;

// ─────────────────────────────────────────────────────
// Shared fixture helpers
// ─────────────────────────────────────────────────────

function makeMWF(): MeetingPattern[] {
  return [
    { weekday: 'monday', start_time: '09:00', end_time: '10:00' },
    { weekday: 'wednesday', start_time: '09:00', end_time: '10:00' },
    { weekday: 'friday', start_time: '09:00', end_time: '10:00' },
  ];
}

function makeLessons(count: number): LessonRow[] {
  return Array.from({ length: count }, (_, i) => ({
    lesson_id: `les_${i + 1}`,
    public_id: `LES-${i + 1}`,
    chapter_id: 'ch_1',
    title: `Lesson ${i + 1}`,
    content: null,
    learning_objectives: null,
    estimated_minutes: 60,
    complexity_score: null,
    sequence_no: i + 1,
    status: 'draft' as const,
    created_at: TS,
    updated_at: TS,
  }));
}

// Single term: Jan5-Jan30, MWF (12 slots)
function makeSingleTermInput(
  lessonCount = 7,
  ww_count = 2,
  pt_count = 1,
  overrides: Partial<LessonPlanRow> = {},
): AlgorithmInput {
  const lesson_plan: LessonPlanRow = {
    lesson_plan_id: 'lp_single',
    public_id: 'LP-SINGLE',
    user_id: 'u_1',
    school_id: 's_1',
    subject_id: 'subj_1',
    section_id: 'sec_1',
    title: 'Single-Term Plan',
    academic_year: '2025-2026',
    start_date: '2026-01-05',
    end_date: '2026-01-30',
    effective_start_date: null,
    progress_anchor: null,
    status: 'draft' as const,
    notes: null,
    created_at: TS,
    updated_at: TS,
    ...overrides,
  };

  const rules: AlgorithmRules = {
    academic_term: 'semester',
    terms: [
      {
        term_key: 't1',
        term_no: 1,
        title: 'Semester',
        start_date: '2026-01-05',
        end_date: '2026-01-30',
        exam_subcategory: 'final',
      },
    ],
    term_rules: [
      {
        term_key: 't1',
        requirements: { written_work_count: ww_count, performance_task_count: pt_count },
        prevent_ww_pt_before_first_lesson: true,
        prevent_lessons_after_final_quiz: false,
      },
    ],
    respect_locked_slots: true,
    respect_locked_blocks: true,
    fill_empty_slots: false,
    preserve_existing_exams: true,
    preserve_existing_locked_blocks: true,
    allow_buffer_blocks: true,
    allow_split_blocks: false,
  };

  return {
    lesson_plan,
    chapters: [],
    lessons: makeLessons(lessonCount),
    activities: [],
    existing_slots: [],
    existing_blocks: [],
    school_calendar_events: [],
    delays: [],
    meeting_patterns: makeMWF(),
    rules,
  };
}

// ======================================================
// Scenario 1 — Progress anchor: teacher joins mid-year
// ======================================================
section('progress anchor: teacher joins mid-year (exam_no=1, lesson_no=5, ww_no=1)');
{
  // Two-term plan.  Prelim (Jan5-Jan16) is already done; only Final (Jan19-Jan30) is live.
  const lesson_plan: LessonPlanRow = {
    lesson_plan_id: 'lp_anchor',
    public_id: 'LP-ANCHOR',
    user_id: 'u_1',
    school_id: 's_1',
    subject_id: 'subj_1',
    section_id: 'sec_1',
    title: 'Mid-Year Join Plan',
    academic_year: '2025-2026',
    start_date: '2026-01-05',
    end_date: '2026-01-30',
    effective_start_date: null,
    progress_anchor: {
      exam_no: 1,           // prelim already taken → term 1 is fully completed
      lesson_no: 5,         // first 5 of 8 lessons already taught
      written_work_no: 1,   // first WW already given
      performance_task_no: 0,
    },
    status: 'draft' as const,
    notes: null,
    created_at: TS,
    updated_at: TS,
  };

  const rules: AlgorithmRules = {
    academic_term: 'semester',
    terms: [
      {
        term_key: 't1',
        term_no: 1,
        title: 'Prelim',
        start_date: '2026-01-05',
        end_date: '2026-01-16',
        exam_subcategory: 'prelim',
      },
      {
        term_key: 't2',
        term_no: 2,
        title: 'Final',
        start_date: '2026-01-19',
        end_date: '2026-01-30',
        exam_subcategory: 'final',
      },
    ],
    term_rules: [
      {
        term_key: 't1',
        requirements: { written_work_count: 2, performance_task_count: 1 },
        prevent_ww_pt_before_first_lesson: true,
        prevent_lessons_after_final_quiz: false,
      },
      {
        term_key: 't2',
        requirements: { written_work_count: 2, performance_task_count: 1 },
        prevent_ww_pt_before_first_lesson: true,
        prevent_lessons_after_final_quiz: false,
      },
    ],
    respect_locked_slots: true,
    respect_locked_blocks: true,
    fill_empty_slots: false,
    preserve_existing_exams: true,
    preserve_existing_locked_blocks: true,
    allow_buffer_blocks: true,
    allow_split_blocks: false,
  };

  const anchorInput: AlgorithmInput = {
    lesson_plan,
    chapters: [],
    lessons: makeLessons(8), // 8 total; anchor skips first 5 → 3 remain
    activities: [],
    existing_slots: [],
    existing_blocks: [],
    school_calendar_events: [],
    delays: [],
    meeting_patterns: makeMWF(),
    rules,
  };

  const built = buildPlan(anchorInput);

  // Term 1 must be completely absent — no blocks generated for it
  const term1Blocks = built.blocks.filter((b) => b.metadata.term_key === 't1');
  ok(term1Blocks.length === 0, 'term 1 (prelim) has 0 blocks — anchor marks it completed');

  // Only 3 lesson blocks (lessons 6, 7, 8)
  const lessonBlocks = built.blocks.filter((b) => b.session_category === 'lesson');
  ok(lessonBlocks.length === 3, 'exactly 3 lesson blocks (first 5 skipped by anchor)');
  ok(
    lessonBlocks.every((b) =>
      ['Lesson 6', 'Lesson 7', 'Lesson 8'].includes(b.title),
    ),
    'placed lessons are only lessons 6, 7, 8',
  );

  // Only the final exam — prelim was already taken
  const examBlocks = built.blocks.filter((b) => b.session_category === 'exam');
  ok(examBlocks.length === 1, 'exactly 1 exam block (prelim skipped by anchor)');
  ok(
    examBlocks[0].session_subcategory === 'final',
    'the single exam is the final (not prelim)',
  );

  // Everything lands in term 2
  ok(unplacedCount(built.blocks) === 0, 'all remaining blocks placed');
  const term2Blocks = built.blocks.filter((b) => b.metadata.term_key === 't2');
  ok(term2Blocks.length > 0, 'term 2 has blocks');
  ok(
    term2Blocks.length === built.blocks.length,
    'every block belongs to term 2',
  );
}

// ======================================================
// Scenario 2 — Placement rules: no WW/PT before first lesson
// ======================================================
section('placement rules: first WW and PT appear after first lesson in ordered_slots');
{
  const input = makeSingleTermInput(7, 2, 1);
  const built = buildPlan(input);

  let firstLessonSlotIndex = -1;
  let firstWWSlotIndex = -1;
  let firstPTSlotIndex = -1;

  for (let i = 0; i < built.ordered_slots.length; i++) {
    const { blocks } = built.ordered_slots[i];
    if (
      firstLessonSlotIndex < 0 &&
      blocks.some((b) => b.session_category === 'lesson')
    ) {
      firstLessonSlotIndex = i;
    }
    if (
      firstWWSlotIndex < 0 &&
      blocks.some((b) => b.session_category === 'written_work')
    ) {
      firstWWSlotIndex = i;
    }
    if (
      firstPTSlotIndex < 0 &&
      blocks.some((b) => b.session_category === 'performance_task')
    ) {
      firstPTSlotIndex = i;
    }
  }

  ok(firstLessonSlotIndex >= 0, 'at least one lesson is placed');
  ok(firstWWSlotIndex >= 0, 'at least one WW is placed');
  ok(firstPTSlotIndex >= 0, 'at least one PT is placed');
  ok(
    firstLessonSlotIndex <= firstWWSlotIndex,
    'first WW slot is at or after first lesson slot',
  );
  ok(
    firstLessonSlotIndex <= firstPTSlotIndex,
    'first PT slot is at or after first lesson slot',
  );

  // No slot before the first lesson slot has any WW or PT
  const slotsBeforeFirstLesson = built.ordered_slots.slice(0, firstLessonSlotIndex);
  ok(
    slotsBeforeFirstLesson.every(({ blocks }) =>
      blocks.every(
        (b) =>
          b.session_category !== 'written_work' &&
          b.session_category !== 'performance_task',
      ),
    ),
    'no WW or PT block appears in any slot before the first lesson slot',
  );
}

// ======================================================
// Scenario 3 — Total blackout: graceful failure, no crash
// ======================================================
section('total blackout: all content slots suspended → no crash, no data loss');
{
  const input = makeSingleTermInput(7, 2, 1);
  const built = buildPlan(input);

  // Find the exam slot so we can leave it alone
  const examBlock = built.blocks.find((b) => b.session_category === 'exam');
  const examSlotKey = examBlock?.slot_key;

  // Black out every content slot; keep the exam slot usable
  const allBlackedOut = cloneSlots(built.slots).map((s) =>
    s.slot_key === examSlotKey
      ? s
      : {
          ...s,
          blackout: {
            reason: 'suspended' as const,
            title: 'Total blackout',
            source: 'manual' as const,
          },
        },
  );

  let result: ReturnType<typeof rebalanceDay> | undefined;
  let threw = false;
  try {
    result = rebalanceDay({
      slots: allBlackedOut,
      blocks: built.blocks,
      lessons: input.lessons,
      activities: input.activities,
      schedule_plan: built.schedule_plan,
      rules: input.rules,
    });
  } catch {
    threw = true;
  }

  ok(!threw, 'total blackout does not throw');

  if (result) {
    ok(
      result.warnings.some((w) => w.code === 'UNPLACED_BLOCK'),
      'UNPLACED_BLOCK warning emitted for displaced content',
    );
    ok(
      result.blocks.length === built.blocks.length,
      'total blackout does not destroy any blocks',
    );

    const contentBlocks = result.blocks.filter(
      (b) => b.session_category !== 'exam',
    );
    ok(
      contentBlocks.every((b) => !b.slot_key),
      'all content blocks are unplaced (no content slots available)',
    );

    // Exam block is pinned — it keeps its slot even though nothing else is placed
    const examAfter = result.blocks.find(
      (b) => b.session_category === 'exam',
    );
    ok(
      Boolean(examAfter && examAfter.slot_key === examSlotKey),
      'exam block retains its slot key under total blackout',
    );
  }
}

// ======================================================
// Scenario 4 — Multi-term distribution: 3 terms, typhoon suspensions
// ======================================================
section(
  'multi-term: 3 terms (prelim/midterm/final), 1 typhoon suspension per term',
);
{
  // 3 × 6 MWF slots (Jan5-Jan16 / Jan19-Jan30 / Feb2-Feb13)
  // 9 lessons (3 per term), 3 WW (1 per term), 3 PT (1 per term)
  const lesson_plan: LessonPlanRow = {
    lesson_plan_id: 'lp_multi',
    public_id: 'LP-MULTI',
    user_id: 'u_1',
    school_id: 's_1',
    subject_id: 'subj_1',
    section_id: 'sec_1',
    title: 'Multi-Term Plan',
    academic_year: '2025-2026',
    start_date: '2026-01-05',
    end_date: '2026-02-13',
    effective_start_date: null,
    progress_anchor: null,
    status: 'draft' as const,
    notes: null,
    created_at: TS,
    updated_at: TS,
  };

  const rules: AlgorithmRules = {
    academic_term: 'trimester',
    terms: [
      {
        term_key: 't1',
        term_no: 1,
        title: 'Prelim',
        start_date: '2026-01-05',
        end_date: '2026-01-16',
        exam_subcategory: 'prelim',
      },
      {
        term_key: 't2',
        term_no: 2,
        title: 'Midterm',
        start_date: '2026-01-19',
        end_date: '2026-01-30',
        exam_subcategory: 'midterm',
      },
      {
        term_key: 't3',
        term_no: 3,
        title: 'Final',
        start_date: '2026-02-02',
        end_date: '2026-02-13',
        exam_subcategory: 'final',
      },
    ],
    term_rules: [
      {
        term_key: 't1',
        requirements: { written_work_count: 1, performance_task_count: 1 },
        prevent_ww_pt_before_first_lesson: true,
        prevent_lessons_after_final_quiz: false,
      },
      {
        term_key: 't2',
        requirements: { written_work_count: 1, performance_task_count: 1 },
        prevent_ww_pt_before_first_lesson: true,
        prevent_lessons_after_final_quiz: false,
      },
      {
        term_key: 't3',
        requirements: { written_work_count: 1, performance_task_count: 1 },
        prevent_ww_pt_before_first_lesson: true,
        prevent_lessons_after_final_quiz: false,
      },
    ],
    respect_locked_slots: true,
    respect_locked_blocks: true,
    fill_empty_slots: false,
    preserve_existing_exams: true,
    preserve_existing_locked_blocks: true,
    allow_buffer_blocks: true,
    allow_split_blocks: false,
  };

  const mtInput: AlgorithmInput = {
    lesson_plan,
    chapters: [],
    lessons: makeLessons(9),
    activities: [],
    existing_slots: [],
    existing_blocks: [],
    school_calendar_events: [],
    delays: [],
    meeting_patterns: makeMWF(),
    rules,
  };

  const built = buildPlan(mtInput);

  ok(unplacedCount(built.blocks) === 0, '3-term plan: all blocks placed on initial build');
  for (const tk of ['t1', 't2', 't3']) {
    ok(
      built.blocks.some((b) => b.metadata.term_key === tk && b.slot_key),
      `initial build: term ${tk} has at least one placed block`,
    );
  }

  // Simulate a typhoon that cancels one class in each term
  // Jan 7 = prelim Wed, Jan 21 = midterm Wed, Feb 4 = final Wed
  const typhoonDates = ['2026-01-07', '2026-01-21', '2026-02-04'];
  const suspended = cloneSlots(built.slots);
  for (const date of typhoonDates) {
    const slot = suspended.find((s) => s.slot_date === date);
    if (slot) {
      slot.blackout = { reason: 'suspended', title: 'Typhoon', source: 'manual' };
    }
  }

  const afterTyphoon = rebalanceDay({
    slots: suspended,
    blocks: built.blocks,
    lessons: mtInput.lessons,
    activities: mtInput.activities,
    schedule_plan: built.schedule_plan,
    rules: mtInput.rules,
  });

  ok(
    unplacedCount(afterTyphoon.blocks) === 0,
    '3-term: all blocks still placed after 3 typhoon suspensions',
  );
  ok(
    afterTyphoon.blocks.length === built.blocks.length,
    '3-term: no blocks lost after typhoon',
  );
  ok(
    !afterTyphoon.warnings.some((w) => w.code === 'COMPRESSION_FAILED'),
    '3-term: no COMPRESSION_FAILED (blocks fit via merging)',
  );
  for (const tk of ['t1', 't2', 't3']) {
    ok(
      afterTyphoon.blocks.some((b) => b.metadata.term_key === tk && b.slot_key),
      `after typhoon: term ${tk} still has placed blocks`,
    );
  }
}

// ======================================================
// Scenario 5 — Repopulate round-trip
// ======================================================
section('repopulate round-trip: vacancies found → choices applied → original layout intact');
{
  // Sparse plan: 4 lessons, 2 WW, 1 PT in a 12-slot term → 5+ vacant content slots
  const input = makeSingleTermInput(4, 2, 1);
  const built = buildPlan(input);

  // ── 5a: rebalance on the base plan is already a no-op ──────────────────────
  // (The sparse plan places every required block; there is nothing to compress.)
  const rebalancedBase = rebalance({
    slots: built.slots,
    blocks: built.blocks,
    rules: input.rules,
  });
  {
    const before = new Map(built.blocks.map((b) => [b.block_key, b.slot_key ?? '']));
    const after = new Map(
      rebalancedBase.blocks.map((b) => [b.block_key, b.slot_key ?? '']),
    );
    const sameLayout = [...before.keys()].every((k) => before.get(k) === after.get(k));
    ok(sameLayout, 'rebalance on base sparse plan: layout unchanged (no-op)');
  }

  // ── 5b: repopulate finds vacancies ─────────────────────────────────────────
  const { reports, warnings: repopWarnings } = repopulate({
    slots: built.slots,
    blocks: built.blocks,
    lessons: input.lessons,
    activities: input.activities,
    schedule_plan: built.schedule_plan,
    rules: input.rules,
  });

  ok(reports.length > 0, 'repopulate: at least one vacancy report returned');
  ok(
    repopWarnings.some((w) => w.code === 'VACANCY_AVAILABLE'),
    'repopulate: VACANCY_AVAILABLE warning emitted',
  );

  const report = reports[0];
  ok(
    report.excess_slots > 0 && report.suggestions.length > 0,
    `repopulate: ${report.excess_slots} excess slot(s), ${report.suggestions.length} suggestion(s)`,
  );

  // ── 5c: apply all suggested choices ────────────────────────────────────────
  const choices = report.suggestions.map((s) => {
    const opt = s.options[s.recommended_index];
    return { slot_key: s.slot_key, kind: opt.kind, subcategory: opt.subcategory };
  });

  const applied = applyRepopulateChoices({
    slots: built.slots,
    blocks: built.blocks,
    choices,
    schedule_plan: built.schedule_plan,
    rules: input.rules,
  });

  ok(
    applied.inserted_block_keys.length === choices.length,
    `applyRepopulateChoices: inserted ${applied.inserted_block_keys.length}/${choices.length} block(s)`,
  );

  // Each inserted block lands in its requested slot
  for (const choice of choices) {
    const landed = applied.blocks.some(
      (b) =>
        applied.inserted_block_keys.includes(b.block_key) &&
        b.slot_key === choice.slot_key,
    );
    ok(landed, `new block placed in requested slot ${choice.slot_key}`);
  }

  // ── 5d: applyRepopulateChoices does not disturb existing placements ─────────
  // Original blocks keep their slots; only the target slots gain a new block.
  for (const original of built.blocks) {
    const afterApply = applied.blocks.find(
      (b) => b.block_key === original.block_key,
    );
    ok(
      afterApply?.slot_key === original.slot_key,
      `original block ${original.block_key} stays in slot ${original.slot_key ?? '(exam-unplaced)'}`,
    );
  }
}

// ======================================================
// Scenario 6 — Displaced blocks
// ======================================================
section('displaced blocks: locked block gets re-pin candidates after its slot is suspended');
{
  // Sparse plan: 4 lessons, 2 WW, 1 PT → 8 content blocks in 11 content slots.
  // After initial placement: 3 empty content slots, 8 occupied → mix of tier-0
  // (empty) and tier-1 (shared) candidates for the displaced block's re-pin menu.
  const input = makeSingleTermInput(4, 2, 1);
  const built = buildPlan(input);

  // Lock the first placed lesson block.
  const target = built.blocks.find(
    (b) => b.session_category === 'lesson' && b.slot_key,
  )!;

  const blocks = built.blocks.map((b) =>
    b.block_key === target.block_key
      ? { ...b, is_locked: true, metadata: { ...b.metadata } }
      : { ...b, metadata: { ...b.metadata } },
  );
  const slots = built.slots.map((s) =>
    s.slot_key === target.slot_key
      ? {
          ...s,
          blackout: { reason: 'suspended' as const, title: 'Class suspended', source: 'manual' as const },
          assigned_block_keys: [...s.assigned_block_keys],
        }
      : { ...s, assigned_block_keys: [...s.assigned_block_keys] },
  );

  const result = rebalanceDay({
    slots,
    blocks,
    lessons: input.lessons,
    activities: input.activities,
    schedule_plan: built.schedule_plan,
    rules: input.rules,
  });

  ok(result.displaced.length === 1, '6a: exactly one displaced block');
  ok(
    result.displaced[0].block_key === target.block_key,
    '6b: displaced block key matches the locked lesson',
  );
  ok(
    result.displaced[0].suggested_slot_keys.length > 0,
    '6c: displaced block has at least one re-pin candidate',
  );

  const examSlotKey = built.blocks.find((b) => b.session_category === 'exam')!.slot_key!;
  ok(
    !result.displaced[0].suggested_slot_keys.includes(examSlotKey),
    '6d: exam slot never appears in re-pin suggestions',
  );

  const blockCountBySlot = new Map<string, number>();
  for (const b of result.blocks) {
    if (b.slot_key) {
      blockCountBySlot.set(b.slot_key, (blockCountBySlot.get(b.slot_key) ?? 0) + 1);
    }
  }
  const SLOT_CAPACITY = 2;
  ok(
    result.displaced[0].suggested_slot_keys.every(
      (k) => (blockCountBySlot.get(k) ?? 0) < SLOT_CAPACITY,
    ),
    '6e: no suggested slot is at SLOT_CAPACITY (full slots excluded)',
  );

  // Empty slots (tier 0) must be sorted before shared slots (tier 1).
  const suggestions = result.displaced[0].suggested_slot_keys;
  let sawShared = false;
  let tierViolated = false;
  for (const k of suggestions) {
    const count = blockCountBySlot.get(k) ?? 0;
    if (count > 0) sawShared = true;
    if (count === 0 && sawShared) { tierViolated = true; break; }
  }
  ok(!tierViolated, '6f: empty slots (tier 0) sort before shared slots (tier 1)');
}

// ─────────────────────────────────────────────────────
console.log(
  failures === 0
    ? '\nALL SCENARIOS PASSED ✅'
    : `\n${failures} SCENARIO(S) FAILED ❌`,
);
if (failures > 0) process.exitCode = 1;
