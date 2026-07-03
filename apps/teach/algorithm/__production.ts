// algorithm/__production.ts
// Production-readiness tests: DB hydration, calendar events, effective_start_date.
//   npm run test:production
//
// The following flags are declared in AlgorithmRules / TermRuleRow but are not
// read anywhere in the algorithm implementation (01–07_*.ts). They are design
// placeholders for future features. Tests will be added when implemented:
//   - prevent_lessons_after_final_quiz (TermRuleRow)
//   - fill_empty_slots (AlgorithmRules)
//   - allow_split_blocks (AlgorithmRules)

import type {
  AlgorithmInput,
  AlgorithmRules,
  DelayRow,
  LessonPlanRow,
  LessonRow,
  MeetingPattern,
  RuntimeBlock,
  RuntimeSlot,
  SchoolCalendarEventRow,
  SlotRow,
} from './00_types';
import { buildPlan } from './07_run';

// ─────────────────────────────────────────────────────────────────────────────
// Tiny assertion harness
// ─────────────────────────────────────────────────────────────────────────────
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

const unplacedCount = (blocks: RuntimeBlock[]): number =>
  blocks.filter((b) => b.session_category !== 'exam' && !b.slot_key).length;

// ─────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function makePlan(
  planId: string,
  overrides: Partial<LessonPlanRow> = {},
): LessonPlanRow {
  return {
    lesson_plan_id: planId,
    public_id: `LP-${planId.toUpperCase()}`,
    user_id: 'u_1',
    school_id: 's_1',
    subject_id: 'subj_1',
    section_id: 'sec_1',
    title: 'Production Test Plan',
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
}

function makeRules(overrides: Partial<AlgorithmRules> = {}): AlgorithmRules {
  return {
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
    ...overrides,
  };
}

function makeBaseInput(planId = 'lp_prod'): AlgorithmInput {
  return {
    lesson_plan: makePlan(planId),
    chapters: [],
    lessons: makeLessons(7),
    activities: [],
    existing_slots: [],
    existing_blocks: [],
    school_calendar_events: [],
    delays: [],
    meeting_patterns: makeMWF(),
    rules: makeRules(),
  };
}

// Convert a RuntimeSlot into a SlotRow (simulates reading back from Supabase).
function toSlotRow(slot: RuntimeSlot, mockId: string): SlotRow {
  return {
    slot_id: mockId,
    lesson_plan_id: slot.lesson_plan_id,
    title: slot.title,
    slot_date: slot.slot_date,
    weekday: slot.weekday,
    start_time: slot.start_time,
    end_time: slot.end_time,
    meeting_type: slot.meeting_type,
    slot_number: slot.slot_number,
    series_key: slot.series_key,
    is_locked: slot.is_locked,
    created_at: TS,
    updated_at: TS,
  };
}

function makeEvent(
  partial: Partial<SchoolCalendarEventRow> & {
    start_date: string;
    end_date: string;
    blackout_reason: SchoolCalendarEventRow['blackout_reason'];
    event_type: SchoolCalendarEventRow['event_type'];
  },
): SchoolCalendarEventRow {
  return {
    event_id: 'evt_1',
    school_id: 's_1',
    section_id: null,
    subject_id: null,
    title: 'Calendar Event',
    description: null,
    is_whole_day: true,
    created_by: null,
    created_at: TS,
    updated_at: TS,
    ...partial,
  };
}

// ======================================================
// Group 1 — existing_slots hydration
// ======================================================
section('existing_slots hydration: slot_id and custom times survive re-build');
{
  // Build a fresh plan (no existing_slots).
  const fresh = buildPlan(makeBaseInput('lp_hydrate'));

  // Simulate a DB round-trip: assign mock slot_id + a shifted start_time.
  const dbRows: SlotRow[] = fresh.slots.map((s, i) =>
    toSlotRow(
      { ...s, start_time: '10:00', end_time: '11:00', duration_minutes: 60 },
      `db_slot_${i + 1}`,
    ),
  );

  const rebuilt = buildPlan({
    ...makeBaseInput('lp_hydrate'),
    existing_slots: dbRows,
  });

  ok(
    rebuilt.slots.every((s) => s.slot_id?.startsWith('db_slot_')),
    'slot_id values from DB rows are preserved in re-built slots',
  );
  ok(
    rebuilt.slots.every(
      (s) => s.start_time === '10:00:00' || s.start_time === '10:00',
    ),
    'start_time from DB row preserved (not overwritten by meeting pattern default)',
  );
  // assigned_block_keys are rebuilt fresh by the placement step, not copied from DB.
  // Verify consistency: every key in assigned_block_keys matches a block placed there.
  const blockKeysBySlotKey = new Map<string, Set<string>>();
  for (const b of rebuilt.blocks) {
    if (b.slot_key) {
      const set = blockKeysBySlotKey.get(b.slot_key) ?? new Set<string>();
      set.add(b.block_key);
      blockKeysBySlotKey.set(b.slot_key, set);
    }
  }
  const assignedConsistent = rebuilt.slots.every((s) => {
    const expected = blockKeysBySlotKey.get(s.slot_key) ?? new Set<string>();
    if (s.assigned_block_keys.length !== expected.size) return false;
    return s.assigned_block_keys.every((k) => expected.has(k));
  });
  ok(
    assignedConsistent,
    'assigned_block_keys rebuilt fresh — consistent with block slot_key assignments (not stale DB data)',
  );
  ok(
    unplacedCount(rebuilt.blocks) === 0,
    'all blocks placed after hydration round-trip',
  );
}

section('existing_slots hydration: locked orphan slot (no matching pattern)');
{
  // A teacher manually added a make-up class on a Tuesday (not in MWF).
  // It is stored in the DB as a locked slot. When re-running buildPlan with
  // MWF-only patterns, this slot has no generated counterpart.
  const orphan: SlotRow = {
    slot_id: 'db_orphan_tue',
    lesson_plan_id: 'lp_hydrate_locked',
    title: 'Make-up class',
    slot_date: '2026-01-06',   // Tuesday — no MWF pattern match
    weekday: 'tuesday',
    start_time: '14:00',
    end_time: '15:00',
    meeting_type: null,
    slot_number: 1,
    series_key: 'makeup-tue-14:00',
    is_locked: true,
    created_at: TS,
    updated_at: TS,
  };

  const withRespect = buildPlan({
    ...makeBaseInput('lp_hydrate_locked'),
    existing_slots: [orphan],
    rules: makeRules({ respect_locked_slots: true }),
  });
  ok(
    withRespect.slots.some((s) => s.slot_date === '2026-01-06'),
    'locked orphan slot PRESERVED when respect_locked_slots: true',
  );

  const withoutRespect = buildPlan({
    ...makeBaseInput('lp_hydrate_locked'),
    existing_slots: [orphan],
    rules: makeRules({ respect_locked_slots: false }),
  });
  ok(
    !withoutRespect.slots.some((s) => s.slot_date === '2026-01-06'),
    'locked orphan slot DROPPED when respect_locked_slots: false',
  );
}

section('existing_slots hydration: blackout flags are always recomputed from current events');
{
  const PLAN_ID = 'lp_hydrate_blackout';

  // First build — no events → Jan 12 slot has no blackout.
  const fresh = buildPlan(makeBaseInput(PLAN_ID));
  ok(
    fresh.slots.find((s) => s.slot_date === '2026-01-12')?.blackout === null,
    'Jan 12 slot has no blackout on initial build (no events)',
  );

  // Simulate DB round-trip: preserve existing slots.
  const dbRows = fresh.slots.map((s, i) => toSlotRow(s, `db_br_${i + 1}`));

  // Second build — same existing slots + NEW holiday event on Jan 12.
  const rebuilt = buildPlan({
    ...makeBaseInput(PLAN_ID),
    existing_slots: dbRows,
    school_calendar_events: [
      makeEvent({
        event_id: 'evt_jan12',
        start_date: '2026-01-12',
        end_date: '2026-01-12',
        event_type: 'holiday',
        blackout_reason: 'holiday',
      }),
    ],
  });

  const jan12 = rebuilt.slots.find((s) => s.slot_date === '2026-01-12');
  ok(
    jan12?.blackout?.reason === 'holiday',
    'Jan 12 slot gains holiday blackout when event added — flags always recomputed, never stale',
  );
  ok(
    jan12?.blackout?.source === 'school_calendar_event',
    'blackout.source correctly identifies the school calendar event',
  );
}

// ======================================================
// Group 2 — school_calendar_events
// ======================================================
section('calendar events: single-day holiday blackouts exactly one slot');
{
  const built = buildPlan({
    ...makeBaseInput(),
    school_calendar_events: [
      makeEvent({
        event_id: 'evt_holiday_single',
        start_date: '2026-01-12',
        end_date: '2026-01-12',
        event_type: 'holiday',
        blackout_reason: 'holiday',
      }),
    ],
  });

  const jan12 = built.slots.find((s) => s.slot_date === '2026-01-12');
  ok(
    jan12?.blackout?.reason === 'holiday',
    'Jan 12 slot is blacked out as a holiday',
  );
  ok(
    built.slots.filter((s) => s.slot_date !== '2026-01-12' && s.blackout !== null).length === 0,
    'no other slot has a blackout from this single-day event',
  );
  ok(
    unplacedCount(built.blocks) === 0,
    'all blocks placed despite holiday (algorithm uses remaining usable slots)',
  );
}

section('calendar events: multi-day event blackouts every class day in the range');
{
  // Holiday Jan 12–14 spans Mon, Tue, Wed. In MWF, Jan 13 (Tue) has no slot.
  const built = buildPlan({
    ...makeBaseInput(),
    school_calendar_events: [
      makeEvent({
        event_id: 'evt_multiday',
        start_date: '2026-01-12',
        end_date: '2026-01-14',
        event_type: 'holiday',
        blackout_reason: 'holiday',
      }),
    ],
  });

  ok(
    built.slots.find((s) => s.slot_date === '2026-01-12')?.blackout?.reason === 'holiday',
    'Jan 12 (Mon) blacked out by multi-day holiday',
  );
  ok(
    built.slots.find((s) => s.slot_date === '2026-01-14')?.blackout?.reason === 'holiday',
    'Jan 14 (Wed) blacked out by multi-day holiday',
  );
  ok(
    !built.slots.some((s) => s.slot_date === '2026-01-13'),
    'Jan 13 (Tue) has no slot — multi-day event only affects actual class slots',
  );
}

section('calendar events: section/subject scoping');
{
  // Helper: build plan with a holiday on Jan 12 scoped to the given section_id
  const buildWithSection = (section_id: string | null) =>
    buildPlan({
      ...makeBaseInput(),
      school_calendar_events: [
        makeEvent({
          event_id: `evt_sec_${section_id ?? 'null'}`,
          section_id,
          start_date: '2026-01-12',
          end_date: '2026-01-12',
          event_type: 'holiday',
          blackout_reason: 'holiday',
        }),
      ],
    });

  // Event scoped to the matching section → blackout applied
  ok(
    buildWithSection('sec_1').slots.find((s) => s.slot_date === '2026-01-12')
      ?.blackout?.reason === 'holiday',
    'event scoped to matching section (sec_1) IS applied',
  );

  // Event scoped to a different section → blackout NOT applied
  ok(
    buildWithSection('sec_OTHER').slots.find((s) => s.slot_date === '2026-01-12')
      ?.blackout === null,
    'event scoped to non-matching section (sec_OTHER) is NOT applied',
  );

  // School-wide event (section_id: null) → applies to all
  ok(
    buildWithSection(null).slots.find((s) => s.slot_date === '2026-01-12')
      ?.blackout?.reason === 'holiday',
    'school-wide event (section_id: null) IS applied to all lesson plans',
  );
}

section('calendar events: priority — delay (3) > exam_week (2) > generic event (1)');
{
  // Jan 12: holiday + delay on the same day → delay wins
  // Jan 14: exam_week + generic school_event on the same day → exam_week wins
  const delay: DelayRow = {
    delay_id: 'del_jan12',
    user_id: 'u_1',
    school_id: 's_1',
    subject_id: null,
    section_id: null,
    absent_on: '2026-01-12',
    blackout_reason: 'sick',
    reason: 'Teacher illness',
    created_at: TS,
  };

  const built = buildPlan({
    ...makeBaseInput(),
    school_calendar_events: [
      makeEvent({
        event_id: 'evt_holiday_jan12',
        start_date: '2026-01-12',
        end_date: '2026-01-12',
        event_type: 'holiday',
        blackout_reason: 'holiday',
      }),
      makeEvent({
        event_id: 'evt_examweek_jan14',
        start_date: '2026-01-14',
        end_date: '2026-01-14',
        event_type: 'exam_week',
        blackout_reason: 'exam_week',
      }),
      makeEvent({
        event_id: 'evt_generic_jan14',
        start_date: '2026-01-14',
        end_date: '2026-01-14',
        event_type: 'school_event',
        blackout_reason: 'event',
      }),
    ],
    delays: [delay],
  });

  const jan12 = built.slots.find((s) => s.slot_date === '2026-01-12');
  ok(
    jan12?.blackout?.source === 'delay',
    'delay (priority 3) beats holiday event (priority 1) on Jan 12',
  );

  const jan14 = built.slots.find((s) => s.slot_date === '2026-01-14');
  ok(
    jan14?.blackout?.reason === 'exam_week',
    'exam_week event (priority 2) beats generic school_event (priority 1) on Jan 14',
  );
}

// ======================================================
// Group 3 — effective_start_date
// ======================================================

// Jan5–Jan30 MWF plan with 5 lessons + 2WW + 1PT; effective_start_date cuts
// off Jan 5, 7, 9 leaving exactly 9 slots (Jan 12–30) with 8 content slots.
function makeEffStartInput(planId: string, effectiveStart: string | null): AlgorithmInput {
  return {
    lesson_plan: makePlan(planId, { effective_start_date: effectiveStart }),
    chapters: [],
    lessons: makeLessons(5),  // 5 lessons + 2 quizzes + 1 PT = 8 content blocks
    activities: [],
    existing_slots: [],
    existing_blocks: [],
    school_calendar_events: [],
    delays: [],
    meeting_patterns: makeMWF(),
    rules: makeRules(),
  };
}

section('effective_start_date: slots before the cutoff are not generated');
{
  // Baseline (no effective_start_date) → 12 MWF slots (Jan 5–30).
  const baseline = buildPlan(makeBaseInput('lp_eff_base'));

  // With effective_start_date: Jan 12 → only 9 slots (Jan 12–30).
  const built = buildPlan(makeEffStartInput('lp_eff_cut', '2026-01-12'));

  ok(
    built.slots.every((s) => s.slot_date >= '2026-01-12'),
    'no slot has a date before effective_start_date (Jan 5, 7, 9 absent)',
  );
  ok(
    built.slots.map((s) => s.slot_date).sort()[0] === '2026-01-12',
    'first slot date is exactly the effective_start_date (Jan 12)',
  );
  ok(
    built.slots.length === 9,
    '9 slots generated (Jan 12–30, MWF) vs 12 for a full plan',
  );
  ok(
    built.slots.length < baseline.slots.length,
    'effective_start_date correctly reduces total slot count',
  );
  ok(
    unplacedCount(built.blocks) === 0,
    'all blocks placed despite reduced slot count',
  );
}

section('effective_start_date: calendar events before the cutoff are clamped out');
{
  // Holiday on Jan 7 (before effective_start Jan 12) — should have no effect.
  const built = buildPlan({
    ...makeEffStartInput('lp_eff_events', '2026-01-12'),
    school_calendar_events: [
      makeEvent({
        event_id: 'evt_before_eff',
        start_date: '2026-01-07',
        end_date: '2026-01-07',
        event_type: 'holiday',
        blackout_reason: 'holiday',
      }),
    ],
  });

  ok(
    !built.slots.some((s) => s.slot_date === '2026-01-07'),
    'Jan 7 slot not generated (before effective_start) — event has no slot to blackout',
  );
  ok(
    built.slots.every((s) => s.blackout === null),
    'no slot has a blackout — pre-effective_start event is completely clamped out',
  );
}

section('effective_start_date edge cases: null and past dates behave identically to no-op');
{
  const baseline = buildPlan(makeEffStartInput('lp_eff_base2', null));

  // effective_start_date === start_date → same output as null
  const equalStart = buildPlan(makeEffStartInput('lp_eff_equal', '2026-01-05'));
  ok(
    equalStart.slots.length === baseline.slots.length,
    'effective_start_date === start_date → same slot count as no effective_start',
  );

  // effective_start_date < start_date → getEffectivePlanStart returns start_date (clamped)
  const earlyStart = buildPlan(makeEffStartInput('lp_eff_early', '2025-12-01'));
  ok(
    earlyStart.slots.length === baseline.slots.length,
    'effective_start_date < start_date → same slot count (clamped to start_date)',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(
  failures === 0
    ? '\nALL PRODUCTION TESTS PASSED ✅'
    : `\n${failures} PRODUCTION TEST(S) FAILED ❌`,
);
if (failures > 0) process.exitCode = 1;
