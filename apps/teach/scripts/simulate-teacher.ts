/**
 * Teacher simulation — 8 lesson plans, June 2026, everyday use.
 * Covers: multi-plan parallel scheduling, blackouts, slot suspensions,
 * displaced-locked-block flow, requirement changes, repopulate after unsuspend,
 * near-end-of-term pressure, and double-blocked slots under compression.
 */

import type {
  AlgorithmInput,
  AlgorithmRules,
  LessonPlanRow,
  LessonRow,
  MeetingPattern,
  RuntimeBlock,
  RuntimeSlot,
  TermWindow,
  TermRules,
  VacancyReport,
} from '../algorithm/00_types';
import { buildPlan, rebalanceDay, repopulate, applyRepopulateChoices } from '../algorithm/07_run';

// -------------------------------------------------------
// mini assert harness
// -------------------------------------------------------
let pass = 0, fail = 0;
function ok(cond: boolean, msg: string, detail?: string) {
  if (cond) { console.log(`  ✓  ${msg}`); pass++; }
  else { console.error(`  ✗  ${msg}${detail ? `\n       └─ ${detail}` : ''}`); fail++; }
}
function section(name: string) { console.log(`\n═══ ${name} ═══`); }
function log(msg: string) { console.log(`  »  ${msg}`); }

// -------------------------------------------------------
// shared helpers
// -------------------------------------------------------
const TS = '2026-06-01T00:00:00Z';
let lessonSeq = 0;
function makeLessons(n: number): LessonRow[] {
  return Array.from({ length: n }, (_, i) => ({
    lesson_id: `les_${++lessonSeq}`,
    public_id: `LES-${lessonSeq}`,
    chapter_id: 'ch_any',
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

let planSeq = 0;
function makePlan(
  subjectTitle: string,
  patterns: MeetingPattern[],
  lessons: LessonRow[],
  wwCount: number,
  ptCount: number,
  termType: 'semester' | 'quarter',
  twoTerms = false,
): AlgorithmInput {
  const id = `lp_${++planSeq}`;
  const lesson_plan: LessonPlanRow = {
    lesson_plan_id: id,
    public_id: `LP-${planSeq}`,
    user_id: 'teacher_1',
    school_id: 'school_1',
    subject_id: `subj_${planSeq}`,
    section_id: 'sec_1',
    title: subjectTitle,
    academic_year: '2025-2026',
    start_date: '2026-06-01',
    end_date: '2026-06-30',
    effective_start_date: null,
    progress_anchor: null,
    status: 'draft' as const,
    notes: null,
    created_at: TS,
    updated_at: TS,
  };

  const terms: TermWindow[] = twoTerms
    ? [
        { term_key: `${id}_t1`, term_no: 1, title: 'Q1', start_date: '2026-06-01', end_date: '2026-06-15', exam_subcategory: 'prelim' },
        { term_key: `${id}_t2`, term_no: 2, title: 'Q2', start_date: '2026-06-16', end_date: '2026-06-30', exam_subcategory: 'midterm' },
      ]
    : [{ term_key: `${id}_t1`, term_no: 1, title: 'S1', start_date: '2026-06-01', end_date: '2026-06-30', exam_subcategory: 'final' }];

  const term_rules: TermRules[] = twoTerms
    ? [
        { term_key: `${id}_t1`, requirements: { written_work_count: Math.ceil(wwCount / 2), performance_task_count: Math.ceil(ptCount / 2) }, prevent_ww_pt_before_first_lesson: true, prevent_lessons_after_final_quiz: false },
        { term_key: `${id}_t2`, requirements: { written_work_count: Math.floor(wwCount / 2), performance_task_count: Math.floor(ptCount / 2) }, prevent_ww_pt_before_first_lesson: true, prevent_lessons_after_final_quiz: false },
      ]
    : [
        { term_key: `${id}_t1`, requirements: { written_work_count: wwCount, performance_task_count: ptCount }, prevent_ww_pt_before_first_lesson: true, prevent_lessons_after_final_quiz: false },
      ];

  const rules: AlgorithmRules = {
    academic_term: termType,
    terms,
    term_rules,
    respect_locked_slots: true,
    respect_locked_blocks: true,
    fill_empty_slots: false,
    preserve_existing_exams: true,
    preserve_existing_locked_blocks: true,
    allow_buffer_blocks: true,
    allow_split_blocks: false,
  };

  return { lesson_plan, chapters: [], lessons, activities: [], existing_slots: [], existing_blocks: [], school_calendar_events: [], delays: [], meeting_patterns: patterns, rules };
}

const clone = (slots: RuntimeSlot[]): RuntimeSlot[] =>
  slots.map(s => ({ ...s, assigned_block_keys: [...s.assigned_block_keys] }));

const unplaced = (blocks: RuntimeBlock[]) =>
  blocks.filter(b => b.session_category !== 'exam' && !b.slot_key).length;

const slotsOn = (slots: RuntimeSlot[], date: string) =>
  slots.filter(s => s.slot_date === date);

const countByCategory = (blocks: RuntimeBlock[], cat: string) =>
  blocks.filter(b => b.session_category === cat).length;

// -------------------------------------------------------
// BUILD ALL 8 PLANS
// -------------------------------------------------------
section('Building 8 lesson plans — June 2026');

// Plan 1: English — MWF, 8:00-9:00  (13 slots, semester)
const eng = buildPlan(makePlan('English', [
  { weekday: 'monday', start_time: '08:00', end_time: '09:00' },
  { weekday: 'wednesday', start_time: '08:00', end_time: '09:00' },
  { weekday: 'friday', start_time: '08:00', end_time: '09:00' },
], makeLessons(8), 3, 1, 'semester'));

// Plan 2: Math — TTh, 10:00-11:30  (9 slots, semester)
const math = buildPlan(makePlan('Mathematics', [
  { weekday: 'tuesday', start_time: '10:00', end_time: '11:30' },
  { weekday: 'thursday', start_time: '10:00', end_time: '11:30' },
], makeLessons(5), 2, 1, 'semester'));

// Plan 3: Science — MWF, 1:00-2:00  (13 slots, semester)
const sci = buildPlan(makePlan('Science', [
  { weekday: 'monday', start_time: '13:00', end_time: '14:00' },
  { weekday: 'wednesday', start_time: '13:00', end_time: '14:00' },
  { weekday: 'friday', start_time: '13:00', end_time: '14:00' },
], makeLessons(8), 3, 1, 'semester'));

// Plan 4: History — TTh, 2:00-3:00  (9 slots, 2 quarter terms)
const hist = buildPlan(makePlan('History', [
  { weekday: 'tuesday', start_time: '14:00', end_time: '15:00' },
  { weekday: 'thursday', start_time: '14:00', end_time: '15:00' },
], makeLessons(4), 2, 1, 'quarter', true));

// Plan 5: PE — MW, 8:00-9:00  (9 slots, semester)
const pe = buildPlan(makePlan('Physical Education', [
  { weekday: 'monday', start_time: '09:00', end_time: '10:00' },
  { weekday: 'wednesday', start_time: '09:00', end_time: '10:00' },
], makeLessons(4), 1, 1, 'semester'));

// Plan 6: CS — TTh, 8:00-10:00  (9 slots 2hr each, semester)
const cs = buildPlan(makePlan('Computer Science', [
  { weekday: 'tuesday', start_time: '08:00', end_time: '10:00' },
  { weekday: 'thursday', start_time: '08:00', end_time: '10:00' },
], makeLessons(5), 2, 1, 'semester'));

// Plan 7: Filipino — MTWF, 11:00-12:00  (18 slots, semester)
const fil = buildPlan(makePlan('Filipino', [
  { weekday: 'monday', start_time: '11:00', end_time: '12:00' },
  { weekday: 'tuesday', start_time: '11:00', end_time: '12:00' },
  { weekday: 'wednesday', start_time: '11:00', end_time: '12:00' },
  { weekday: 'friday', start_time: '11:00', end_time: '12:00' },
], makeLessons(12), 4, 2, 'semester'));

// Plan 8: Research — Saturday, 9:00-12:00  (4 slots, semester)
const res = buildPlan(makePlan('Research', [
  { weekday: 'saturday', start_time: '09:00', end_time: '12:00' },
], makeLessons(2), 0, 0, 'semester'));

const plans = [
  { name: 'English', result: eng },
  { name: 'Mathematics', result: math },
  { name: 'Science', result: sci },
  { name: 'History', result: hist },
  { name: 'PE', result: pe },
  { name: 'Computer Science', result: cs },
  { name: 'Filipino', result: fil },
  { name: 'Research', result: res },
];

for (const { name, result } of plans) {
  const u = unplaced(result.blocks);
  log(`${name}: ${result.slots.length} slots, ${result.blocks.length} blocks, ${u} unplaced`);
  ok(u === 0, `${name}: all content blocks placed`);
}

// -------------------------------------------------------
// SCENARIO A: June 5 (Friday) — national holiday
// Affects: English (MWF), Science (MWF), Filipino (MTWF)
// -------------------------------------------------------
section('Scenario A — June 5 national holiday (3 plans affected)');

function suspendDate(slots: RuntimeSlot[], date: string, reason = 'suspended'): RuntimeSlot[] {
  return clone(slots).map(s =>
    s.slot_date === date
      ? { ...s, blackout: { reason: reason as any, title: 'School holiday', source: 'manual' as const } }
      : s
  );
}

const engA_input = Math.floor(eng.blocks.length);
const engA = rebalanceDay({ slots: suspendDate(eng.slots, '2026-06-05'), blocks: eng.blocks, lessons: [], activities: [], rules: eng.schedule_plan?.length ? { academic_term: 'semester', terms: eng.schedule_plan.map(t => t.term), term_rules: [] as any, respect_locked_slots: true, respect_locked_blocks: true, fill_empty_slots: false, preserve_existing_exams: true, preserve_existing_locked_blocks: true, allow_buffer_blocks: true, allow_split_blocks: false } : {} as any, schedule_plan: eng.schedule_plan });

// rebuild with proper rules passed through
const engInput = {
  lesson_plan: { lesson_plan_id: 'lp_1', public_id: 'LP-1', user_id: 'teacher_1', school_id: 'school_1', subject_id: 'subj_1', section_id: 'sec_1', title: 'English', academic_year: '2025-2026', start_date: '2026-06-01', end_date: '2026-06-30', effective_start_date: null, progress_anchor: null, status: 'draft' as const, notes: null, created_at: TS, updated_at: TS },
  rules: eng.schedule_plan[0] ? { academic_term: 'semester' as const, terms: [{ term_key: eng.schedule_plan[0].term_key, term_no: 1, title: 'S1', start_date: '2026-06-01', end_date: '2026-06-30', exam_subcategory: 'final' as const }], term_rules: [{ term_key: eng.schedule_plan[0].term_key, requirements: { written_work_count: 3, performance_task_count: 1 }, prevent_ww_pt_before_first_lesson: true, prevent_lessons_after_final_quiz: false }], respect_locked_slots: true, respect_locked_blocks: true, fill_empty_slots: false, preserve_existing_exams: true, preserve_existing_locked_blocks: true, allow_buffer_blocks: true, allow_split_blocks: false } : {} as any,
  lessons: [] as LessonRow[],
  activities: [] as any[],
};

function rebalWithRules(slots: RuntimeSlot[], blocks: RuntimeBlock[], schedule_plan: any[], rules: AlgorithmRules) {
  return rebalanceDay({ slots, blocks, lessons: [], activities: [], schedule_plan, rules });
}

// Re-run all three plans with proper inputs from the start
// Use a simpler approach: re-build with the holiday baked into school_calendar_events
// Actually the cleanest approach for the simulation is what the invariant test does:
// clone slots, set blackout, call rebalanceDay with the same rules the plan was built with.

// We need the rules used to build. Let's capture them via a wrapper.
type PlanState = { slots: RuntimeSlot[]; blocks: RuntimeBlock[]; schedule_plan: any[]; rules: AlgorithmRules; lessons: LessonRow[]; activities: any[] };

function buildState(subjectTitle: string, patterns: MeetingPattern[], lessons: LessonRow[], wwCount: number, ptCount: number, termType: 'semester'|'quarter', twoTerms = false): PlanState {
  const input = makePlan(subjectTitle, patterns, lessons, wwCount, ptCount, termType, twoTerms);
  const result = buildPlan(input);
  return { slots: result.slots, blocks: result.blocks, schedule_plan: result.schedule_plan, rules: input.rules, lessons: input.lessons, activities: input.activities };
}

// Reset plan counter for reproducibility
planSeq = 0;
lessonSeq = 0;

const S: Record<string, PlanState> = {
  eng: buildState('English', [
    { weekday: 'monday', start_time: '08:00', end_time: '09:00' },
    { weekday: 'wednesday', start_time: '08:00', end_time: '09:00' },
    { weekday: 'friday', start_time: '08:00', end_time: '09:00' },
  ], makeLessons(8), 3, 1, 'semester'),

  math: buildState('Mathematics', [
    { weekday: 'tuesday', start_time: '10:00', end_time: '11:30' },
    { weekday: 'thursday', start_time: '10:00', end_time: '11:30' },
  ], makeLessons(5), 2, 1, 'semester'),

  sci: buildState('Science', [
    { weekday: 'monday', start_time: '13:00', end_time: '14:00' },
    { weekday: 'wednesday', start_time: '13:00', end_time: '14:00' },
    { weekday: 'friday', start_time: '13:00', end_time: '14:00' },
  ], makeLessons(8), 3, 1, 'semester'),

  hist: buildState('History', [
    { weekday: 'tuesday', start_time: '14:00', end_time: '15:00' },
    { weekday: 'thursday', start_time: '14:00', end_time: '15:00' },
  ], makeLessons(4), 2, 1, 'quarter', true),

  pe: buildState('PE', [
    { weekday: 'monday', start_time: '09:00', end_time: '10:00' },
    { weekday: 'wednesday', start_time: '09:00', end_time: '10:00' },
  ], makeLessons(4), 1, 1, 'semester'),

  cs: buildState('CS', [
    { weekday: 'tuesday', start_time: '08:00', end_time: '10:00' },
    { weekday: 'thursday', start_time: '08:00', end_time: '10:00' },
  ], makeLessons(5), 2, 1, 'semester'),

  fil: buildState('Filipino', [
    { weekday: 'monday', start_time: '11:00', end_time: '12:00' },
    { weekday: 'tuesday', start_time: '11:00', end_time: '12:00' },
    { weekday: 'wednesday', start_time: '11:00', end_time: '12:00' },
    { weekday: 'friday', start_time: '11:00', end_time: '12:00' },
  ], makeLessons(12), 4, 2, 'semester'),

  res: buildState('Research', [
    { weekday: 'saturday', start_time: '09:00', end_time: '12:00' },
  ], makeLessons(2), 0, 0, 'semester'),
};

section('Initial build — 8 plans');
for (const [key, state] of Object.entries(S)) {
  const u = unplaced(state.blocks);
  log(`${key}: ${state.slots.length} slots, ${state.blocks.length} blocks (L:${countByCategory(state.blocks,'lesson')} WW:${countByCategory(state.blocks,'written_work')} PT:${countByCategory(state.blocks,'performance_task')} E:${countByCategory(state.blocks,'exam')})`);
  ok(u === 0, `${key}: no unplaced content blocks`);
}

// -------------------------------------------------------
// SCENARIO A — June 5 (Fri) national holiday
// Affects: eng, sci, fil (all have Friday slots)
// -------------------------------------------------------
section('Scenario A — June 5 national holiday (eng + sci + fil)');

for (const key of ['eng', 'sci', 'fil'] as const) {
  const s = S[key];
  const hasFri5 = s.slots.some(sl => sl.slot_date === '2026-06-05');
  ok(hasFri5, `${key}: has a slot on Jun 5`);

  const r = rebalWithRules(suspendDate(s.slots, '2026-06-05', 'holiday'), s.blocks, s.schedule_plan, s.rules);
  ok(unplaced(r.blocks) === 0, `${key}: no unplaced after Jun 5 blackout`);
  ok(r.blocks.length === s.blocks.length, `${key}: no block count change`);
  ok(r.displaced.length === 0, `${key}: no displaced (no locked blocks on Jun 5)`);
  log(`${key}: ${r.merges.length} merge(s) — schedule compressed`);
  // Save updated state
  S[key] = { ...s, slots: r.slots, blocks: r.blocks, schedule_plan: r.schedule_plan };
}

// -------------------------------------------------------
// SCENARIO B — June 11 (Thu) typhoon → Math, History, CS
// -------------------------------------------------------
section('Scenario B — June 11 typhoon (math + hist + cs)');

for (const key of ['math', 'hist', 'cs'] as const) {
  const s = S[key];
  const hasThu11 = s.slots.some(sl => sl.slot_date === '2026-06-11');
  ok(hasThu11, `${key}: has a slot on Jun 11`);

  const r = rebalWithRules(suspendDate(s.slots, '2026-06-11', 'suspended'), s.blocks, s.schedule_plan, s.rules);
  ok(unplaced(r.blocks) === 0, `${key}: no unplaced after Jun 11 typhoon`);
  ok(r.blocks.length === s.blocks.length, `${key}: no block count change`);
  S[key] = { ...s, slots: r.slots, blocks: r.blocks, schedule_plan: r.schedule_plan };
}

// -------------------------------------------------------
// SCENARIO C — Sports Fest June 18-19 (Thu+Fri, 2-day)
// Math, Hist, CS lose Jun 18. Eng, Sci, Fil lose Jun 19.
// -------------------------------------------------------
section('Scenario C — Sports Fest Jun 18-19 (5 plans, 2-day suspension)');

function suspendMultiple(slots: RuntimeSlot[], dates: string[]): RuntimeSlot[] {
  return clone(slots).map(s =>
    dates.includes(s.slot_date)
      ? { ...s, blackout: { reason: 'event' as const, title: 'Sports Fest', source: 'manual' as const } }
      : s
  );
}

for (const key of ['math', 'hist', 'cs'] as const) {
  const s = S[key];
  const r = rebalWithRules(suspendMultiple(s.slots, ['2026-06-18']), s.blocks, s.schedule_plan, s.rules);
  ok(unplaced(r.blocks) === 0, `${key}: no unplaced after Sports Fest Thu`);
  ok(r.blocks.length === s.blocks.length, `${key}: block count intact`);
  const pressure = r.balances.map(b => b.slot_pressure);
  log(`${key}: slot pressures after 2 suspensions: [${pressure.join(', ')}]`);
  S[key] = { ...s, slots: r.slots, blocks: r.blocks, schedule_plan: r.schedule_plan };
}

for (const key of ['eng', 'sci', 'fil'] as const) {
  const s = S[key];
  const r = rebalWithRules(suspendMultiple(s.slots, ['2026-06-19']), s.blocks, s.schedule_plan, s.rules);
  ok(unplaced(r.blocks) === 0, `${key}: no unplaced after Sports Fest Fri`);
  ok(r.blocks.length === s.blocks.length, `${key}: block count intact`);
  S[key] = { ...s, slots: r.slots, blocks: r.blocks, schedule_plan: r.schedule_plan };
}

// -------------------------------------------------------
// SCENARIO D — Teacher pins PT to Jun 10 (Wed) on English,
// then Jun 17 (next Wed) gets a one-off suspension.
// Verifies displaced locked block flow.
// -------------------------------------------------------
section('Scenario D — Displaced locked block (English PT pinned to Jun 10, Jun 17 suspended)');

{
  const s = S.eng;
  const ptBlock = s.blocks.find(b => b.session_category === 'performance_task');
  if (!ptBlock) throw new Error('no PT block in English');

  // Find Jun 10 slot
  const slot10 = s.slots.find(sl => sl.slot_date === '2026-06-10');
  if (!slot10) throw new Error('no slot Jun 10 in English');

  // Pin/lock the PT to Jun 10
  const blocksWithPin = s.blocks.map(b =>
    b.block_key === ptBlock.block_key
      ? { ...b, slot_key: slot10.slot_key, slot_id: slot10.slot_id ?? null, start_time: slot10.start_time, end_time: slot10.end_time, is_locked: true }
      : b
  );

  // Now suspend Jun 10
  const slotsWithSuspend = suspendDate(s.slots, '2026-06-10', 'suspended');
  const r = rebalWithRules(slotsWithSuspend, blocksWithPin, s.schedule_plan, s.rules);

  const displaced = r.displaced.find(d => d.block_key === ptBlock.block_key);
  ok(Boolean(displaced), 'Eng: locked PT reported as displaced when Jun 10 suspended');
  ok(!r.blocks.find(b => b.block_key === ptBlock.block_key)?.slot_key, 'Eng: displaced PT left unplaced (awaiting teacher re-pin)');
  ok(Boolean(displaced?.suggested_slot_keys.length), 'Eng: displaced PT has suggested re-pin slots');
  ok(r.blocks.length === s.blocks.length, 'Eng: no block loss during displacement');
  log(`Eng: PT displaced, ${displaced?.suggested_slot_keys.length} re-pin suggestions available`);

  // Teacher re-pins to first suggestion
  if (displaced && displaced.suggested_slot_keys.length > 0) {
    const repinKey = displaced.suggested_slot_keys[0];
    const repinSlot = r.slots.find(sl => sl.slot_key === repinKey)!;
    const blocksRepin = r.blocks.map(b =>
      b.block_key === ptBlock.block_key
        ? { ...b, slot_key: repinSlot.slot_key, slot_id: repinSlot.slot_id ?? null, start_time: repinSlot.start_time, end_time: repinSlot.end_time, is_locked: true }
        : b
    );
    const r2 = rebalWithRules(clone(r.slots), blocksRepin, r.schedule_plan, s.rules);
    ok(r2.displaced.length === 0, 'Eng: nothing displaced after re-pin');
    ok(unplaced(r2.blocks) === 0, 'Eng: no unplaced blocks after re-pin');
    ok(r2.blocks.find(b => b.block_key === ptBlock.block_key)?.slot_key === repinKey, 'Eng: PT lives on chosen slot');
    log(`Eng: PT successfully re-pinned to ${repinKey}`);
    S.eng = { ...s, slots: r2.slots, blocks: r2.blocks, schedule_plan: r2.schedule_plan };
  } else {
    S.eng = { ...s, slots: r.slots, blocks: r.blocks, schedule_plan: r.schedule_plan };
  }
}

// -------------------------------------------------------
// SCENARIO E — Unsuspend June 11 for Math → repopulate
// (Sports Fest is done; the typhoon slot is now free again)
// -------------------------------------------------------
section('Scenario E — Unsuspend Jun 11 for Math, check repopulate proposals');

{
  const s = S.math;
  const unsuspendedSlots = clone(s.slots).map(sl =>
    sl.slot_date === '2026-06-11' ? { ...sl, blackout: null } : sl
  );
  const r = rebalWithRules(unsuspendedSlots, s.blocks, s.schedule_plan, s.rules);
  ok(unplaced(r.blocks) === 0, 'Math: no unplaced after unsuspend Jun 11');
  ok(r.blocks.length === s.blocks.length, 'Math: no block count change');
  const totalVacancies = r.vacancies.reduce((n, v) => n + v.excess_slots, 0);
  log(`Math: ${totalVacancies} excess slot(s) available for repopulate after unsuspend`);
  ok(totalVacancies >= 0, 'Math: vacancy count is non-negative');

  if (totalVacancies > 0) {
    const repResult = repopulate({ slots: r.slots, blocks: r.blocks, lessons: s.lessons, activities: s.activities, schedule_plan: r.schedule_plan, rules: s.rules });
    log(`Math: repopulate generated ${repResult.reports.reduce((n, rp) => n + rp.suggestions.length, 0)} suggestion(s)`);
    ok(repResult.reports.length > 0, 'Math: repopulate produced reports');

    // Simulate teacher accepting first suggestion in each slot
    const choices = repResult.reports.flatMap(rp =>
      rp.suggestions.map(sug => {
        const pick = sug.options[sug.recommended_index] ?? sug.options[0];
        return pick ? { slot_key: sug.slot_key, kind: pick.kind, subcategory: pick.subcategory } : null;
      }).filter(Boolean)
    ) as any[];

    if (choices.length > 0) {
      const applied = applyRepopulateChoices({ slots: r.slots, blocks: r.blocks, choices, schedule_plan: r.schedule_plan, rules: s.rules });
      ok(applied.inserted_block_keys.length === choices.length, `Math: all ${choices.length} repopulate choices applied`);
      ok(unplaced(applied.blocks) === 0, 'Math: no unplaced after repopulate apply');
      log(`Math: inserted ${applied.inserted_block_keys.length} new block(s) via repopulate`);
      S.math = { ...s, slots: applied.slots, blocks: applied.blocks, schedule_plan: r.schedule_plan };
    } else {
      S.math = { ...s, slots: r.slots, blocks: r.blocks, schedule_plan: r.schedule_plan };
    }
  } else {
    S.math = { ...s, slots: r.slots, blocks: r.blocks, schedule_plan: r.schedule_plan };
  }
}

// -------------------------------------------------------
// SCENARIO F — Near end-of-term: suspend last Saturday (Jun 28) for Research
// Research only has 4 Saturday slots. With 1 blocked by this + possible exam,
// tests near-no-room compression.
// -------------------------------------------------------
section('Scenario F — Last Saturday (Jun 28) suspended for Research (near end-of-term)');

{
  const s = S.res;
  log(`Research: ${s.slots.length} slots, ${s.blocks.length} blocks`);
  const slotDates = s.slots.map(sl => sl.slot_date).join(', ');
  log(`Research slots: ${slotDates}`);

  const r = rebalWithRules(suspendDate(s.slots, '2026-06-28', 'suspended'), s.blocks, s.schedule_plan, s.rules);
  const nonExamBlocks = s.blocks.filter(b => b.session_category !== 'exam').length;
  const usableSlots = r.slots.filter(sl => !sl.blackout).length;
  log(`Research: ${usableSlots} usable slots, ${nonExamBlocks} content blocks to fit`);

  if (nonExamBlocks > usableSlots) {
    log(`Research: ⚠ over-committed — ${nonExamBlocks - usableSlots} block(s) can't fit`);
    ok(r.warnings.some(w => w.code === 'NO_AVAILABLE_SLOT' || w.code === 'UNPLACED_BLOCK' || w.code === 'INSUFFICIENT_SLOTS'),
      'Research: warning emitted when over-committed');
  } else {
    ok(unplaced(r.blocks) === 0, 'Research: fits even with last Saturday suspended');
    ok(r.blocks.length === s.blocks.length, 'Research: no block loss');
  }
  S.res = { ...s, slots: r.slots, blocks: r.blocks, schedule_plan: r.schedule_plan };
}

// -------------------------------------------------------
// SCENARIO G — History two-term plan, multiple suspensions across term boundary
// Suspend Jun 15 (Mon — no class) and Jun 16 (Tue — term boundary)
// Checks term-boundary handling and double-slot compression
// -------------------------------------------------------
section('Scenario G — History 2-quarter plan, suspend Jun 16 (term boundary day)');

{
  const s = S.hist;
  const hasJun16 = s.slots.some(sl => sl.slot_date === '2026-06-16');
  log(`History: has Jun 16 slot = ${hasJun16}`);

  const r = rebalWithRules(suspendDate(s.slots, '2026-06-16', 'suspended'), s.blocks, s.schedule_plan, s.rules);
  const u = unplaced(r.blocks);
  log(`History: ${u} unplaced after Jun 16 suspension`);
  log(`History: balances = ${r.balances.map(b => `${b.term_key} pressure=${b.slot_pressure} excess=${b.excess_slots}`).join(' | ')}`);

  // Acceptable: either 0 unplaced (it compressed), or a warning was emitted
  const acceptable = u === 0 || r.warnings.some(w => ['NO_AVAILABLE_SLOT','INSUFFICIENT_SLOTS','UNPLACED_BLOCK'].includes(w.code));
  ok(acceptable, 'History: either 0 unplaced OR a warning was emitted (graceful degradation)');
  ok(r.blocks.length === s.blocks.length, 'History: no block count change');
  S.hist = { ...s, slots: r.slots, blocks: r.blocks, schedule_plan: r.schedule_plan };
}

// -------------------------------------------------------
// SCENARIO H — Filipino (dense 18-slot plan) — double suspension
// Suspend Jun 9 (Tue) + Jun 12 (Fri) = 2 slots gone, 16 left
// Tests multi-day compression on a plan close to full
// -------------------------------------------------------
section('Scenario H — Filipino dense plan, double suspension');

{
  const s = S.fil;
  const r = rebalWithRules(
    suspendMultiple(s.slots, ['2026-06-09', '2026-06-12']),
    s.blocks, s.schedule_plan, s.rules
  );
  ok(unplaced(r.blocks) === 0, 'Filipino: 0 unplaced after double suspension');
  ok(r.blocks.length === s.blocks.length, 'Filipino: no block loss');
  log(`Filipino: ${r.merges.length} merge(s) after double suspension`);
  log(`Filipino: warnings: [${r.warnings.map(w => w.code).join(', ')}]`);
  S.fil = { ...s, slots: r.slots, blocks: r.blocks, schedule_plan: r.schedule_plan };
}

// -------------------------------------------------------
// SCENARIO I — Idempotency: run rebalanceDay again on final state of each plan
// -------------------------------------------------------
section('Scenario I — Idempotency check on final state of all 8 plans');

for (const [key, state] of Object.entries(S)) {
  const r = rebalWithRules(clone(state.slots), state.blocks, state.schedule_plan, state.rules);
  const layoutBefore = new Map(state.blocks.map(b => [b.block_key, b.slot_key]));
  const layoutAfter = new Map(r.blocks.map(b => [b.block_key, b.slot_key]));
  const identical = [...layoutBefore.keys()].every(k => layoutBefore.get(k) === layoutAfter.get(k));
  ok(identical, `${key}: second rebalance is a no-op (idempotent)`);
}

// -------------------------------------------------------
// SCENARIO J — No data loss: total block count unchanged across all scenarios
// -------------------------------------------------------
section('Scenario J — Data integrity: block counts after all scenarios');

const expectedCounts: Record<string, number> = {};
// Re-build to get fresh baseline counts
planSeq = 0; lessonSeq = 0;
const fresh: Record<string, PlanState> = {
  eng: buildState('English', [
    { weekday: 'monday', start_time: '08:00', end_time: '09:00' },
    { weekday: 'wednesday', start_time: '08:00', end_time: '09:00' },
    { weekday: 'friday', start_time: '08:00', end_time: '09:00' },
  ], makeLessons(8), 3, 1, 'semester'),
  math: buildState('Mathematics', [
    { weekday: 'tuesday', start_time: '10:00', end_time: '11:30' },
    { weekday: 'thursday', start_time: '10:00', end_time: '11:30' },
  ], makeLessons(5), 2, 1, 'semester'),
  sci: buildState('Science', [
    { weekday: 'monday', start_time: '13:00', end_time: '14:00' },
    { weekday: 'wednesday', start_time: '13:00', end_time: '14:00' },
    { weekday: 'friday', start_time: '13:00', end_time: '14:00' },
  ], makeLessons(8), 3, 1, 'semester'),
  hist: buildState('History', [
    { weekday: 'tuesday', start_time: '14:00', end_time: '15:00' },
    { weekday: 'thursday', start_time: '14:00', end_time: '15:00' },
  ], makeLessons(4), 2, 1, 'quarter', true),
  pe: buildState('PE', [
    { weekday: 'monday', start_time: '09:00', end_time: '10:00' },
    { weekday: 'wednesday', start_time: '09:00', end_time: '10:00' },
  ], makeLessons(4), 1, 1, 'semester'),
  cs: buildState('CS', [
    { weekday: 'tuesday', start_time: '08:00', end_time: '10:00' },
    { weekday: 'thursday', start_time: '08:00', end_time: '10:00' },
  ], makeLessons(5), 2, 1, 'semester'),
  fil: buildState('Filipino', [
    { weekday: 'monday', start_time: '11:00', end_time: '12:00' },
    { weekday: 'tuesday', start_time: '11:00', end_time: '12:00' },
    { weekday: 'wednesday', start_time: '11:00', end_time: '12:00' },
    { weekday: 'friday', start_time: '11:00', end_time: '12:00' },
  ], makeLessons(12), 4, 2, 'semester'),
  res: buildState('Research', [
    { weekday: 'saturday', start_time: '09:00', end_time: '12:00' },
  ], makeLessons(2), 0, 0, 'semester'),
};

for (const [key, state] of Object.entries(fresh)) {
  expectedCounts[key] = state.blocks.length;
}

for (const [key, state] of Object.entries(S)) {
  // Math may have extra blocks from repopulate — that's expected
  const base = expectedCounts[key];
  const actual = state.blocks.length;
  const acceptable = actual >= base; // repopulate can only ADD, never remove
  ok(acceptable, `${key}: block count ≥ baseline (${base} → ${actual})`, actual < base ? `LOST ${base - actual} BLOCKS` : undefined);
}

// -------------------------------------------------------
// SUMMARY
// -------------------------------------------------------
section('Summary');
console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail === 0) console.log('  ALL SCENARIOS PASSED ✅');
else { console.error(`  ${fail} SCENARIO(S) FAILED ❌`); process.exitCode = 1; }
