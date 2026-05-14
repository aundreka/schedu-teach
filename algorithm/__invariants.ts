// Scheduler invariants — a runnable check, not a jest suite.
//   npm run test:scheduler
// (which runs this via ts-node — see scripts/run-scheduler-invariants.sh)
//
// Covers: initial build, the suspend→rebalance→unsuspend round-trip, idempotency,
// no-data-loss, and the displaced-locked-block flow with re-pinning.

import type {
  AlgorithmInput,
  AlgorithmRules,
  LessonPlanRow,
  LessonRow,
  MeetingPattern,
  RuntimeBlock,
  RuntimeSlot,
} from './00_types';
import { buildPlan, rebalance, rebalanceDay } from './07_run';

// ------------------------------------------------------
// tiny assert harness
// ------------------------------------------------------
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

// ------------------------------------------------------
// fixture
// ------------------------------------------------------
const TS = '2026-01-01T00:00:00Z';

function makeInput(): AlgorithmInput {
  const lesson_plan: LessonPlanRow = {
    lesson_plan_id: 'lp_1',
    public_id: 'LP-1',
    user_id: 'u_1',
    school_id: 's_1',
    subject_id: 'subj_1',
    section_id: 'sec_1',
    title: 'Invariants Plan',
    academic_year: '2025-2026',
    start_date: '2026-01-05', // Monday
    end_date: '2026-01-30', // Friday
    status: 'draft',
    notes: null,
    created_at: TS,
    updated_at: TS,
  };

  const meeting_patterns: MeetingPattern[] = [
    { weekday: 'monday', start_time: '09:00', end_time: '10:00' },
    { weekday: 'wednesday', start_time: '09:00', end_time: '10:00' },
    { weekday: 'friday', start_time: '09:00', end_time: '10:00' },
  ];

  const lessons: LessonRow[] = Array.from({ length: 7 }, (_, i) => ({
    lesson_id: `les_${i + 1}`,
    public_id: `LES-${i + 1}`,
    chapter_id: 'ch_1',
    title: `Lesson ${i + 1}`,
    content: null,
    learning_objectives: null,
    estimated_minutes: 60,
    complexity_score: null,
    sequence_no: i + 1,
    status: 'draft',
    created_at: TS,
    updated_at: TS,
  }));

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

  return {
    lesson_plan,
    chapters: [],
    lessons,
    activities: [],
    existing_slots: [],
    existing_blocks: [],
    school_calendar_events: [],
    delays: [],
    meeting_patterns,
    rules,
  };
}

const layoutOf = (blocks: RuntimeBlock[]): Record<string, string> =>
  Object.fromEntries(blocks.map((b) => [b.block_key, b.slot_key ?? '(unplaced)']));

const unplacedCount = (blocks: RuntimeBlock[]): number =>
  blocks.filter((b) => b.session_category !== 'exam' && !b.slot_key).length;

const cloneSlots = (slots: RuntimeSlot[]): RuntimeSlot[] =>
  slots.map((s) => ({ ...s, assigned_block_keys: [...s.assigned_block_keys] }));

const SUSPEND_DATE = '2026-01-16';

// ======================================================
// 1. initial build
// ======================================================
section('initial build');
const input = makeInput();
const built = buildPlan(input);
const baseLayout = layoutOf(built.blocks);
const totalBlocks = built.blocks.length;

ok(unplacedCount(built.blocks) === 0, 'no unplaced blocks');
ok(
  built.metrics.total_blocks === built.metrics.placed_blocks + built.metrics.unplaced_blocks,
  'metrics: total = placed + unplaced',
);
ok(
  built.metrics.total_slots === built.slots.length &&
    built.ordered_slots.length === built.slots.length,
  'ordered_slots covers every slot',
);
ok(built.metrics.exam_count === 1, 'metrics: exactly one exam');

// ======================================================
// 2. suspend a mid-term day → rebalance → compresses, no loss
// ======================================================
section('suspend a mid-term day');
const suspended = cloneSlots(built.slots);
const suspendTarget = suspended.find((s) => s.slot_date === SUSPEND_DATE);
if (!suspendTarget) throw new Error(`no slot on ${SUSPEND_DATE}`);
suspendTarget.blackout = { reason: 'suspended', title: 'Class suspended', source: 'manual' };

const afterSuspend = rebalanceDay({
  slots: suspended,
  blocks: built.blocks,
  lessons: input.lessons,
  activities: input.activities,
  schedule_plan: built.schedule_plan,
  rules: input.rules,
});

ok(afterSuspend.merges.length >= 1, 'at least one merge happened');
ok(unplacedCount(afterSuspend.blocks) === 0, 'no unplaced blocks after suspend');
ok(afterSuspend.displaced.length === 0, 'nothing locked was on the suspended day → no displaced');
ok(afterSuspend.blocks.length === totalBlocks, 'no blocks lost');
ok(
  afterSuspend.balances.every((b) => b.vacant_slot_keys.length === 0),
  'no vacant content slots while compressed',
);

// ======================================================
// 3. unsuspend → rebalance → restores the original layout
// ======================================================
section('unsuspend the day');
const unsuspended = cloneSlots(afterSuspend.slots);
const unsuspendTarget = unsuspended.find((s) => s.slot_date === SUSPEND_DATE);
if (!unsuspendTarget) throw new Error(`lost the slot on ${SUSPEND_DATE}`);
unsuspendTarget.blackout = null;

const afterUnsuspend = rebalanceDay({
  slots: unsuspended,
  blocks: afterSuspend.blocks,
  lessons: input.lessons,
  activities: input.activities,
  schedule_plan: afterSuspend.schedule_plan,
  rules: input.rules,
});

ok(afterUnsuspend.merges.length === 0, 'no merges left after unsuspend');
ok(unplacedCount(afterUnsuspend.blocks) === 0, 'no unplaced blocks after unsuspend');
ok(afterUnsuspend.blocks.length === totalBlocks, 'no blocks lost');
{
  const restoredLayout = layoutOf(afterUnsuspend.blocks);
  const identical = Object.keys(baseLayout).every((k) => baseLayout[k] === restoredLayout[k]);
  ok(identical, 'layout is byte-identical to the original build');
  if (!identical) {
    for (const k of Object.keys(baseLayout)) {
      if (baseLayout[k] !== restoredLayout[k]) {
        console.error(`    diff ${k}: was ${baseLayout[k]} now ${restoredLayout[k]}`);
      }
    }
  }
}

// ======================================================
// 4. rebalance is idempotent
// ======================================================
section('idempotency');
const again = rebalance({
  slots: afterUnsuspend.slots,
  blocks: afterUnsuspend.blocks,
  schedule_plan: afterUnsuspend.schedule_plan,
  rules: input.rules,
});
{
  const a = layoutOf(afterUnsuspend.blocks);
  const b = layoutOf(again.blocks);
  ok(Object.keys(a).every((k) => a[k] === b[k]), 'second rebalance is a no-op');
}

// ======================================================
// 5. a teacher-pinned block on a suspended day → displaced, then re-pin
// ======================================================
section('displaced locked block + re-pin');
const fresh = buildPlan(makeInput());
const pinnedBlock = fresh.blocks.find((b) => b.session_category === 'performance_task');
if (!pinnedBlock) throw new Error('no performance_task block to pin');
const pinDate = '2026-01-12';
const pinSlot = fresh.slots.find((s) => s.slot_date === pinDate);
if (!pinSlot) throw new Error(`no slot on ${pinDate}`);

// simulate the teacher dragging the PT onto Jan 12 and locking it
pinnedBlock.slot_key = pinSlot.slot_key;
pinnedBlock.slot_id = pinSlot.slot_id ?? null;
pinnedBlock.start_time = pinSlot.start_time;
pinnedBlock.end_time = pinSlot.end_time;
pinnedBlock.is_locked = true;

// now suspend Jan 12
const s5 = cloneSlots(fresh.slots);
const t5 = s5.find((s) => s.slot_date === pinDate);
if (!t5) throw new Error('lost the pin slot');
t5.blackout = { reason: 'suspended', title: 'Class suspended', source: 'manual' };

const r5 = rebalanceDay({
  slots: s5,
  blocks: fresh.blocks,
  lessons: input.lessons,
  activities: input.activities,
  schedule_plan: fresh.schedule_plan,
  rules: input.rules,
});

const ptAfter = r5.blocks.find((b) => b.block_key === pinnedBlock.block_key)!;
const displacedEntry = r5.displaced.find((d) => d.block_key === pinnedBlock.block_key);

ok(Boolean(displacedEntry), 'the pinned PT is reported in `displaced`');
ok(ptAfter.slot_key === null || ptAfter.slot_key === undefined, 'displaced PT is left unplaced (not auto-moved)');
ok(ptAfter.is_locked === true, 'displaced PT stays locked (awaiting re-pin)');
ok(
  r5.warnings.some((w) => w.code === 'LOCKED_BLOCK_CONFLICT' && w.block_key === pinnedBlock.block_key),
  'LOCKED_BLOCK_CONFLICT warning emitted',
);
ok(
  Boolean(displacedEntry && displacedEntry.suggested_slot_keys.length > 0),
  'displaced PT has at least one suggested re-pin slot',
);
ok(
  Boolean(displacedEntry && displacedEntry.previous_slot_key === pinSlot.slot_key),
  'displaced PT remembers the day it was pinned to',
);
ok(r5.blocks.length === totalBlocks, 'no blocks lost while displaced');

// re-pin to the first suggested slot, then rebalance again
if (displacedEntry && displacedEntry.suggested_slot_keys.length > 0) {
  const targetKey = displacedEntry.suggested_slot_keys[0];
  const targetSlot = r5.slots.find((s) => s.slot_key === targetKey)!;
  const blocksForRepin = r5.blocks.map((b) =>
    b.block_key === pinnedBlock.block_key
      ? {
          ...b,
          slot_key: targetSlot.slot_key,
          slot_id: targetSlot.slot_id ?? null,
          start_time: targetSlot.start_time,
          end_time: targetSlot.end_time,
          is_locked: true,
        }
      : b,
  );
  const r6 = rebalanceDay({
    slots: cloneSlots(r5.slots),
    blocks: blocksForRepin,
    lessons: input.lessons,
    activities: input.activities,
    schedule_plan: r5.schedule_plan,
    rules: input.rules,
  });
  const ptRepinned = r6.blocks.find((b) => b.block_key === pinnedBlock.block_key)!;
  ok(ptRepinned.slot_key === targetKey, 're-pinned PT lands on the chosen slot');
  ok(r6.displaced.length === 0, 'nothing displaced after re-pin');
  ok(
    r6.blocks.filter((b) => b.slot_key === targetKey).length <= 2,
    'the chosen slot respects capacity',
  );
  ok(r6.merges.length >= 1, 'one slot doubled up to absorb the still-suspended day');
  ok(unplacedCount(r6.blocks) === 0, 'no unplaced blocks after re-pin');
  ok(r6.blocks.length === totalBlocks, 'no blocks lost after re-pin');
}

// ------------------------------------------------------
console.log(failures === 0 ? '\nALL INVARIANTS HELD ✅' : `\n${failures} INVARIANT(S) FAILED ❌`);
if (failures > 0) process.exitCode = 1;
