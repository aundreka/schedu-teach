// algorithm/__properties.ts
// Property-based tests using fast-check.
// Run: npm run test:properties  (from apps/teach)
//   or directly (from apps/teach):
//   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","esModuleInterop":true,"isolatedModules":false}' npx ts-node --transpile-only --skip-project algorithm/__properties.ts
//
// These tests generate thousands of random valid AlgorithmInputs and assert
// structural invariants that must hold for ALL inputs — not just the happy-path
// fixtures in __invariants.ts. Fast-check automatically shrinks any
// counterexample to its minimal reproducing form.
//
// Invariants checked:
//   P1  build never throws (no crash on valid input)
//   P2  metrics consistency: total = placed + unplaced
//   P3  actual placed-block count matches metrics
//   P4  block-category counts sum to total_blocks
//   P5  exactly one exam block per term
//   P6  exam blocks are always placed (never left unscheduled)
//   P7  all block_key values are unique within a build
//   P8  lesson blocks appear in sequence_no order (placement order)
//   P9  suspension never loses blocks (data integrity on any slot)
//   P10 idempotency: second rebalance on settled state is a no-op
//   P11 suspend → unsuspend round-trip restores the original slot layout

import * as fc from 'fast-check';
import type {
  AlgorithmInput,
  AlgorithmRules,
  LessonPlanRow,
  LessonRow,
  MeetingPattern,
  RuntimeBlock,
  RuntimeSlot,
  TermRules,
  TermWindow,
} from './00_types';
import { buildPlan, rebalance, rebalanceDay } from './07_run';

// ──────────────────────────────────────────────────────────────
// Tiny assertion harness (no jest dependency)
// ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function section(title: string): void {
  console.log(`\n# ${title}`);
}

function check(
  name: string,
  arb: fc.Arbitrary<unknown>,
  predicate: (v: unknown) => boolean,
  runs = 300,
): void {
  try {
    fc.assert(fc.property(arb, predicate as (v: unknown) => boolean), {
      numRuns: runs,
      verbose: false,
    });
    console.log(`  ok   ${name}`);
    passed++;
  } catch (err: unknown) {
    console.error(`  FAIL ${name}`);
    if (err instanceof Error) {
      // Print full fc output including the counterexample
      err.message.split('\n').slice(0, 14).forEach((line) =>
        console.error(`       ${line}`),
      );
    }
    failed++;
  }
}

// ──────────────────────────────────────────────────────────────
// Date math helpers (no Date.now / Math.random)
// ──────────────────────────────────────────────────────────────
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function utcDow(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 6=Sat
}

function snapToMonday(iso: string): string {
  const dow = utcDow(iso);
  return dow === 1 ? iso : addDays(iso, (8 - dow) % 7);
}

// ──────────────────────────────────────────────────────────────
// Arbitraries
// ──────────────────────────────────────────────────────────────
const WEEKDAY_NAMES: MeetingPattern['weekday'][] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
];
const TS = '2026-01-01T00:00:00Z';
const BASE_DATE = '2026-01-05'; // Monday anchor

function arbMeetingPatterns(): fc.Arbitrary<MeetingPattern[]> {
  return fc
    .uniqueArray(fc.integer({ min: 0, max: 4 }), { minLength: 1, maxLength: 4 })
    .map((indices) =>
      indices.map((i) => ({
        weekday: WEEKDAY_NAMES[i],
        start_time: '09:00',
        end_time: '10:00',
      })),
    );
}

type RawInputSpec = {
  startOffset: number; // days after BASE_DATE
  weeks: number;       // plan length in weeks
  termCount: number;   // 1 or 2 terms
  lessonCount: number;
  ww: [number, number];  // WW counts per term (index 1 unused for single-term)
  pt: [number, number];  // PT counts per term
  patterns: MeetingPattern[];
};

function specToInput(s: RawInputSpec): AlgorithmInput {
  const startRaw = addDays(BASE_DATE, s.startOffset);
  const startDate = snapToMonday(startRaw);
  const endDate = addDays(startDate, s.weeks * 7 - 1);

  const terms: TermWindow[] =
    s.termCount === 1
      ? [
          {
            term_key: 't1',
            term_no: 1,
            title: 'Term 1',
            start_date: startDate,
            end_date: endDate,
            exam_subcategory: 'final',
          },
        ]
      : [
          {
            term_key: 't1',
            term_no: 1,
            title: 'Term 1',
            start_date: startDate,
            end_date: addDays(startDate, Math.floor(s.weeks / 2) * 7 - 1),
            exam_subcategory: 'midterm',
          },
          {
            term_key: 't2',
            term_no: 2,
            title: 'Term 2',
            start_date: addDays(startDate, Math.floor(s.weeks / 2) * 7),
            end_date: endDate,
            exam_subcategory: 'final',
          },
        ];

  const term_rules: TermRules[] = terms.map((term, i) => ({
    term_key: term.term_key,
    requirements: {
      written_work_count: s.ww[i] ?? 0,
      performance_task_count: s.pt[i] ?? 0,
    },
    prevent_ww_pt_before_first_lesson: true,
    prevent_lessons_after_final_quiz: false,
  }));

  const lessons: LessonRow[] = Array.from({ length: s.lessonCount }, (_, i) => ({
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

  const planId = `lp_${s.startOffset}_${s.weeks}_${s.termCount}`;
  const lesson_plan: LessonPlanRow = {
    lesson_plan_id: planId,
    public_id: planId.toUpperCase(),
    user_id: 'u_1',
    school_id: 's_1',
    subject_id: 'subj_1',
    section_id: 'sec_1',
    title: 'Property Test Plan',
    academic_year: '2025-2026',
    start_date: startDate,
    end_date: endDate,
    effective_start_date: null,
    progress_anchor: null,
    status: 'draft',
    notes: null,
    created_at: TS,
    updated_at: TS,
  };

  const rules: AlgorithmRules = {
    academic_term: 'semester',
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

  return {
    lesson_plan,
    chapters: [],
    lessons,
    activities: [],
    existing_slots: [],
    existing_blocks: [],
    school_calendar_events: [],
    delays: [],
    meeting_patterns: s.patterns,
    rules,
  };
}

const arbSpec: fc.Arbitrary<RawInputSpec> = fc.record({
  startOffset: fc.integer({ min: 0, max: 260 }), // ~1 year of Mondays from BASE
  weeks: fc.integer({ min: 4, max: 20 }),
  termCount: fc.integer({ min: 1, max: 2 }),
  lessonCount: fc.integer({ min: 0, max: 12 }),
  ww: fc.tuple(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 4 })),
  pt: fc.tuple(fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 2 })),
  patterns: arbMeetingPatterns(),
});

const arbInput = arbSpec.map(specToInput);

// For rebalance properties that also need to pick a random slot to suspend.
// `hint` is used as `hint % suspendable.length` inside the predicate — purely
// deterministic, no randomness at the predicate level.
const arbInputWithHint = fc.record({
  spec: arbSpec,
  hint: fc.integer({ min: 0, max: 9999 }),
});

// ──────────────────────────────────────────────────────────────
// Slot/block clone helpers
// ──────────────────────────────────────────────────────────────
function cloneSlots(slots: RuntimeSlot[]): RuntimeSlot[] {
  return slots.map((s) => ({ ...s, assigned_block_keys: [...s.assigned_block_keys] }));
}

function cloneBlocks(blocks: RuntimeBlock[]): RuntimeBlock[] {
  return blocks.map((b) => ({ ...b, metadata: { ...b.metadata } }));
}

function pickSuspendTarget(slots: RuntimeSlot[], hint: number): RuntimeSlot | null {
  const suspendable = slots.filter((s) => !s.blackout && !s.is_locked);
  if (suspendable.length === 0) return null;
  return suspendable[hint % suspendable.length];
}

function layoutOf(blocks: RuntimeBlock[]): Record<string, string> {
  return Object.fromEntries(
    blocks.map((b) => [b.block_key, b.slot_key ?? '(unplaced)']),
  );
}

// ──────────────────────────────────────────────────────────────
// P1–P8 — initial build invariants
// ──────────────────────────────────────────────────────────────
section('P1–P8 — initial build invariants');

check('P1: buildPlan never throws on valid input', arbInput, (raw) => {
  const input = raw as AlgorithmInput;
  buildPlan(input);
  return true;
});

check('P2: metrics consistency (total = placed + unplaced)', arbInput, (raw) => {
  const input = raw as AlgorithmInput;
  const { metrics } = buildPlan(input);
  return metrics.total_blocks === metrics.placed_blocks + metrics.unplaced_blocks;
});

check('P3: actual placed count matches metrics', arbInput, (raw) => {
  const input = raw as AlgorithmInput;
  const { blocks, metrics } = buildPlan(input);
  const actualPlaced = blocks.filter((b) => Boolean(b.slot_key)).length;
  const actualUnplaced = blocks.filter((b) => !b.slot_key).length;
  return actualPlaced === metrics.placed_blocks && actualUnplaced === metrics.unplaced_blocks;
});

check('P4: block-category counts sum to total_blocks', arbInput, (raw) => {
  const input = raw as AlgorithmInput;
  const { metrics } = buildPlan(input);
  const sum =
    metrics.lesson_count +
    metrics.written_work_count +
    metrics.performance_task_count +
    metrics.exam_count +
    metrics.buffer_count;
  return sum === metrics.total_blocks;
});

check('P5: exactly one exam block per term', arbInput, (raw) => {
  const input = raw as AlgorithmInput;
  const { blocks } = buildPlan(input);
  const examCount = blocks.filter((b) => b.session_category === 'exam').length;
  return examCount === input.rules.terms.length;
});

check('P6: all exam blocks are placed', arbInput, (raw) => {
  const input = raw as AlgorithmInput;
  const { blocks } = buildPlan(input);
  const exams = blocks.filter((b) => b.session_category === 'exam');
  return exams.every((b) => Boolean(b.slot_key));
});

check('P7: all block_key values are unique', arbInput, (raw) => {
  const input = raw as AlgorithmInput;
  const { blocks } = buildPlan(input);
  const keys = blocks.map((b) => b.block_key);
  return keys.length === new Set(keys).size;
});

// P8: For every consecutive pair of placed lesson blocks in chronological order
// (slot date, then within-slot order_no), the earlier block must have a lower
// lesson sequence_no. Validates that placeLessonSequence never scrambles lessons.
check('P8: placed lesson blocks appear in sequence_no order', arbInput, (raw) => {
  const input = raw as AlgorithmInput;
  const { blocks, slots } = buildPlan(input);

  if (input.lessons.length < 2) return true;

  const slotDateOf = new Map(slots.map((s) => [s.slot_key, s.slot_date]));

  const placedLessons = blocks
    .filter((b) => b.session_category === 'lesson' && Boolean(b.slot_key))
    .sort((a, b) => {
      const dateA = slotDateOf.get(a.slot_key!) ?? '';
      const dateB = slotDateOf.get(b.slot_key!) ?? '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      // Within the same slot, order_no is 1..n local to the slot
      return a.order_no - b.order_no;
    });

  const lessonSeq = new Map(
    input.lessons.map((l) => [l.lesson_id, l.sequence_no]),
  );

  for (let i = 0; i < placedLessons.length - 1; i++) {
    const a = placedLessons[i];
    const b = placedLessons[i + 1];
    const seqA = lessonSeq.get(a.lesson_id!) ?? 0;
    const seqB = lessonSeq.get(b.lesson_id!) ?? 0;
    if (seqA > seqB) return false;
  }
  return true;
});

// ──────────────────────────────────────────────────────────────
// P9–P11 — rebalance invariants
// ──────────────────────────────────────────────────────────────
section('P9–P11 — rebalance invariants');

check('P9: suspend any slot → block count unchanged', arbInputWithHint, (raw) => {
  const { spec, hint } = raw as { spec: RawInputSpec; hint: number };
  const input = specToInput(spec);
  const built = buildPlan(input);
  const target = pickSuspendTarget(built.slots, hint);
  if (!target) return true;

  const suspended = cloneSlots(built.slots);
  const t = suspended.find((s) => s.slot_key === target.slot_key)!;
  t.blackout = { reason: 'suspended', title: 'Test suspension', source: 'manual' };

  const result = rebalanceDay({
    slots: suspended,
    blocks: cloneBlocks(built.blocks),
    lessons: input.lessons,
    activities: input.activities,
    schedule_plan: built.schedule_plan,
    rules: input.rules,
  });

  return result.blocks.length === built.blocks.length;
});

check('P10: rebalance is idempotent on a settled state', arbInput, (raw) => {
  const input = raw as AlgorithmInput;
  const built = buildPlan(input);

  const r1 = rebalance({
    slots: cloneSlots(built.slots),
    blocks: cloneBlocks(built.blocks),
    schedule_plan: built.schedule_plan,
    rules: input.rules,
  });

  const r2 = rebalance({
    slots: cloneSlots(r1.slots),
    blocks: cloneBlocks(r1.blocks),
    schedule_plan: r1.schedule_plan,
    rules: input.rules,
  });

  const a = layoutOf(r1.blocks);
  const b = layoutOf(r2.blocks);
  return Object.keys(a).every((k) => a[k] === b[k]);
});

check(
  'P11: suspend → unsuspend round-trip restores original layout',
  arbInputWithHint,
  (raw) => {
    const { spec, hint } = raw as { spec: RawInputSpec; hint: number };
    const input = specToInput(spec);
    const built = buildPlan(input);
    const target = pickSuspendTarget(built.slots, hint);
    if (!target) return true;

    // Settle first: buildPlan output may not be fully rebalanced in one pass
    const settled = rebalance({
      slots: cloneSlots(built.slots),
      blocks: cloneBlocks(built.blocks),
      schedule_plan: built.schedule_plan,
      rules: input.rules,
    });
    const baseLayout = layoutOf(settled.blocks);

    // Suspend
    const susp = cloneSlots(settled.slots);
    const st = susp.find((s) => s.slot_key === target.slot_key)!;
    st.blackout = { reason: 'suspended', title: 'Test suspension', source: 'manual' };

    const afterSuspend = rebalanceDay({
      slots: susp,
      blocks: cloneBlocks(settled.blocks),
      lessons: input.lessons,
      activities: input.activities,
      schedule_plan: settled.schedule_plan,
      rules: input.rules,
    });

    // Unsuspend
    const unsusp = cloneSlots(afterSuspend.slots);
    const ut = unsusp.find((s) => s.slot_key === target.slot_key)!;
    ut.blackout = null;

    const afterUnsuspend = rebalanceDay({
      slots: unsusp,
      blocks: cloneBlocks(afterSuspend.blocks),
      lessons: input.lessons,
      activities: input.activities,
      schedule_plan: afterSuspend.schedule_plan,
      rules: input.rules,
    });

    const restored = layoutOf(afterUnsuspend.blocks);
    return Object.keys(baseLayout).every((k) => baseLayout[k] === restored[k]);
  },
);

check(
  'P12: locked block in suspended slot → in displaced with valid suggestions',
  arbInputWithHint,
  (raw) => {
    const { spec, hint } = raw as { spec: RawInputSpec; hint: number };
    const input = specToInput(spec);
    const built = buildPlan(input);

    // Pick a non-exam placed block to lock.
    const candidates = built.blocks.filter(
      (b) => b.session_category !== 'exam' && Boolean(b.slot_key),
    );
    if (candidates.length === 0) return true;

    const target = candidates[hint % candidates.length];
    const examSlotKeys = new Set(
      built.blocks
        .filter((b) => b.session_category === 'exam')
        .map((b) => b.slot_key!)
        .filter(Boolean),
    );

    const lockedBlocks = cloneBlocks(built.blocks).map((b) =>
      b.block_key === target.block_key ? { ...b, is_locked: true } : b,
    );
    const suspendedSlots = cloneSlots(built.slots).map((s) =>
      s.slot_key === target.slot_key
        ? { ...s, blackout: { reason: 'suspended' as const, title: 'Test', source: 'manual' as const } }
        : s,
    );

    const result = rebalanceDay({
      slots: suspendedSlots,
      blocks: lockedBlocks,
      lessons: input.lessons,
      activities: input.activities,
      schedule_plan: built.schedule_plan,
      rules: input.rules,
    });

    // The locked block must be in displaced.
    const displaced = result.displaced.find((d) => d.block_key === target.block_key);
    if (!displaced) return false;

    // Exam slots must never be suggested.
    if (displaced.suggested_slot_keys.some((k) => examSlotKeys.has(k))) return false;

    // No suggested slot should be at or above SLOT_CAPACITY.
    const SLOT_CAPACITY = 2;
    const blockCountBySlot = new Map<string, number>();
    for (const b of result.blocks) {
      if (b.slot_key) {
        blockCountBySlot.set(b.slot_key, (blockCountBySlot.get(b.slot_key) ?? 0) + 1);
      }
    }
    if (displaced.suggested_slot_keys.some((k) => (blockCountBySlot.get(k) ?? 0) >= SLOT_CAPACITY)) {
      return false;
    }

    return true;
  },
  300,
);

// ──────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(
  failed === 0
    ? `\nALL ${total} PROPERTIES HELD ✅`
    : `\n${failed}/${total} PROPERTIES FAILED ❌`,
);
if (failed > 0) process.exitCode = 1;
