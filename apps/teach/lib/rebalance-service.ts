// lib/rebalance-service.ts
//
// Bridge between Supabase and the algorithm layer (07_run.ts).
// Handles: load, snapshot, suspend/unsuspend, rebalance, persist, repopulate.
//
// Every mutating function follows the same pattern:
//   1. snapshotVersion() — save current state before touching anything
//   2. mutate the DB (insert calendar event, update blocks, etc.)
//   3. loadRuntimeData() — fresh view with the mutation applied
//   4. call rebalanceDay() / repopulate()
//   5. persistRebalance() / persistRepopulate() — write algorithm output back

import type {
  ActivityRow,
  AlgorithmRules,
  ApplyRepopulateChoicesResult,
  DisplacedBlock,
  ExamSubcategory,
  ISODateString,
  LessonRow,
  RebalanceDayResult,
  RepopulateChoice,
  RuntimeBlock,
  RuntimeSlot,
  SlotKey,
  TempId,
  TermRules,
  TermSchedulePlan,
  TermWindow,
  VacancyReport,
  WeekdayName,
} from '../algorithm/00_types';
import { applyRepopulateChoices, rebalanceDay, repopulate } from '../algorithm/07_run';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function parseTimeMinutes(t: string): number {
  const parts = t.split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

function durationMinutes(start: string, end: string): number {
  return Math.max(0, parseTimeMinutes(end) - parseTimeMinutes(start));
}

function addOneDayISO(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + 1);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// DB row → RuntimeSlot
// ---------------------------------------------------------------------------

function slotRowToRuntime(row: any, blackoutMap: Map<string, any>): RuntimeSlot {
  const slotKey = `${row.slot_date}#${row.slot_number}` as SlotKey;
  const calEvent = blackoutMap.get(`${row.slot_date}::${row.series_key}`)
    ?? blackoutMap.get(`${row.slot_date}::*`);

  return {
    slot_id: String(row.slot_id),
    temp_id: `tmp_${row.slot_id}` as TempId,
    lesson_plan_id: String(row.lesson_plan_id),
    slot_key: slotKey,
    title: row.title ?? null,
    slot_date: String(row.slot_date),
    weekday: String(row.weekday) as WeekdayName,
    start_time: String(row.start_time),
    end_time: String(row.end_time),
    duration_minutes: durationMinutes(String(row.start_time), String(row.end_time)),
    meeting_type: row.meeting_type ?? null,
    slot_number: Number(row.slot_number),
    series_key: String(row.series_key),
    is_locked: Boolean(row.is_locked),
    blackout: calEvent
      ? {
          reason: calEvent.blackout_reason ?? 'suspended',
          title: calEvent.title ?? 'Suspended',
          source: 'school_calendar_event',
          source_id: calEvent.event_id,
        }
      : null,
    assigned_block_keys: [],
  };
}

// ---------------------------------------------------------------------------
// DB row → RuntimeBlock
// ---------------------------------------------------------------------------

function blockRowToRuntime(row: any, slotKeyById: Map<string, SlotKey>): RuntimeBlock {
  const resolvedSlotKey = row.slot_id ? slotKeyById.get(String(row.slot_id)) ?? null : null;
  return {
    block_id: String(row.block_id),
    temp_id: `tmp_${row.block_id}` as TempId,
    lesson_plan_id: String(row.lesson_plan_id),
    slot_id: row.slot_id ? String(row.slot_id) : null,
    slot_key: resolvedSlotKey,
    root_block_id: row.root_block_id ? String(row.root_block_id) : null,
    lesson_id: row.lesson_id ? String(row.lesson_id) : null,
    algorithm_block_key: String(row.algorithm_block_key),
    block_key: String(row.block_key),
    title: String(row.title),
    description: row.description ?? null,
    session_category: row.session_category,
    session_subcategory: row.session_subcategory,
    meeting_type: row.meeting_type ?? null,
    start_time: String(row.start_time),
    end_time: String(row.end_time),
    duration_minutes: durationMinutes(String(row.start_time), String(row.end_time)),
    required: Boolean(row.required),
    splittable: Boolean(row.splittable),
    preferred_session_type: row.preferred_session_type ?? 'any',
    dependency_keys: Array.isArray(row.dependency_keys) ? row.dependency_keys : [],
    order_no: Number(row.order_no),
    is_locked: Boolean(row.is_locked),
    ww_subtype: row.ww_subtype ?? null,
    pt_subtype: row.pt_subtype ?? null,
    source: 'existing_db',
    metadata: row.metadata ?? {},
  } as RuntimeBlock;
}

// ---------------------------------------------------------------------------
// Reconstruct AlgorithmRules from existing exam blocks
// ---------------------------------------------------------------------------

function reconstructRules(
  planRow: any,
  examBlocks: RuntimeBlock[],
  allBlocks: RuntimeBlock[],
): AlgorithmRules {
  const sortedExams = examBlocks
    .filter((b) => b.slot_key)
    .map((b) => ({ ...b, exam_date: b.slot_key!.split('#')[0] }))
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date));

  const planStart = String(planRow.start_date);
  const planEnd = String(planRow.end_date);

  const terms: TermWindow[] = sortedExams.length > 0
    ? sortedExams.map((exam, i) => {
        const prevEnd = i === 0 ? null : sortedExams[i - 1]!.exam_date;
        const termKey = String(exam.metadata?.term_key ?? `t${i + 1}`);
        return {
          term_key: termKey,
          term_no: i + 1,
          title: exam.session_subcategory === 'final'
            ? 'Final Term'
            : exam.session_subcategory === 'midterm'
            ? 'Midterm'
            : `Term ${i + 1}`,
          start_date: prevEnd ? addOneDayISO(prevEnd) : planStart,
          end_date: exam.exam_date,
          exam_subcategory: exam.session_subcategory as ExamSubcategory,
        };
      })
    : [
        {
          term_key: 't1',
          term_no: 1,
          title: 'Semester',
          start_date: planStart,
          end_date: planEnd,
          exam_subcategory: 'final' as ExamSubcategory,
        },
      ];

  const termRules: TermRules[] = terms.map((term) => {
    const termBlocks = allBlocks.filter(
      (b) => b.metadata?.term_key === term.term_key,
    );
    const wwCount = termBlocks.filter(
      (b) => b.session_category === 'written_work' && b.session_subcategory !== 'quiz',
    ).length;
    const ptCount = termBlocks.filter(
      (b) => b.session_category === 'performance_task',
    ).length;
    return {
      term_key: term.term_key,
      requirements: {
        written_work_count: Math.max(0, wwCount),
        performance_task_count: Math.max(0, ptCount),
      },
      prevent_ww_pt_before_first_lesson: false,
      prevent_lessons_after_final_quiz: false,
    };
  });

  return {
    academic_term: sortedExams.length >= 4 ? 'quarter' : sortedExams.length >= 3 ? 'trimester' : 'semester',
    terms,
    term_rules: termRules,
    respect_locked_slots: true,
    respect_locked_blocks: true,
    fill_empty_slots: false,
    preserve_existing_exams: true,
    preserve_existing_locked_blocks: true,
    allow_buffer_blocks: true,
    allow_split_blocks: false,
  };
}

// ---------------------------------------------------------------------------
// loadRuntimeData
// ---------------------------------------------------------------------------

export type RuntimeData = {
  planId: string;
  schoolId: string;
  sectionId: string;
  subjectId: string;
  slots: RuntimeSlot[];
  blocks: RuntimeBlock[];
  rules: AlgorithmRules;
  lessons: LessonRow[];
  activities: ActivityRow[];
  schedulePlan: TermSchedulePlan[];
};

export async function loadRuntimeData(planId: string): Promise<RuntimeData> {
  const [planRes, slotRes, blockRes] = await Promise.all([
    supabase
      .from('lesson_plans')
      .select('lesson_plan_id, school_id, section_id, subject_id, start_date, end_date, status')
      .eq('lesson_plan_id', planId)
      .single(),
    supabase
      .from('slots')
      .select('*')
      .eq('lesson_plan_id', planId)
      .order('slot_date')
      .order('slot_number'),
    supabase
      .from('blocks')
      .select('*')
      .eq('lesson_plan_id', planId)
      .order('order_no'),
  ]);

  if (planRes.error) throw planRes.error;
  if (slotRes.error) throw slotRes.error;
  if (blockRes.error) throw blockRes.error;

  const planRow = planRes.data as any;
  const schoolId = String(planRow.school_id);
  const sectionId = String(planRow.section_id);
  const subjectId = String(planRow.subject_id);

  // Load school calendar events for this school + section/subject combo
  const { data: calEvents, error: calError } = await supabase
    .from('school_calendar_events')
    .select('event_id, start_date, end_date, blackout_reason, title, series_key')
    .eq('school_id', schoolId)
    .or(`section_id.is.null,section_id.eq.${sectionId}`)
    .or(`subject_id.is.null,subject_id.eq.${subjectId}`)
    .gte('end_date', planRow.start_date)
    .lte('start_date', planRow.end_date);

  if (calError) throw calError;

  // Build blackout lookup: "YYYY-MM-DD::series_key" → event, "YYYY-MM-DD::*" → whole day
  const blackoutMap = new Map<string, any>();
  for (const evt of calEvents ?? []) {
    const start = String(evt.start_date);
    const end = String(evt.end_date);
    // Expand date range
    let cursor = start;
    while (cursor <= end) {
      const seriesKey = evt.series_key ? String(evt.series_key) : '*';
      blackoutMap.set(`${cursor}::${seriesKey}`, evt);
      cursor = addOneDayISO(cursor);
    }
  }

  // Convert slots to RuntimeSlot[]
  const slotRows = slotRes.data ?? [];
  const runtimeSlots: RuntimeSlot[] = slotRows.map((row: any) => slotRowToRuntime(row, blackoutMap));

  // Build slot_id → slot_key map for block resolution
  const slotKeyById = new Map<string, SlotKey>();
  for (const slot of runtimeSlots) {
    if (slot.slot_id) slotKeyById.set(slot.slot_id, slot.slot_key);
  }

  // Convert blocks to RuntimeBlock[]
  const blockRows = blockRes.data ?? [];
  const runtimeBlocks: RuntimeBlock[] = blockRows.map((row: any) => blockRowToRuntime(row, slotKeyById));

  // Populate assigned_block_keys on each slot
  for (const block of runtimeBlocks) {
    if (!block.slot_key) continue;
    const slot = runtimeSlots.find((s) => s.slot_key === block.slot_key);
    if (slot && !slot.assigned_block_keys.includes(block.block_key)) {
      slot.assigned_block_keys.push(block.block_key);
    }
  }

  // Load lessons for subject
  const { data: chapterRows, error: chapErr } = await supabase
    .from('chapters')
    .select('chapter_id')
    .eq('subject_id', subjectId);
  if (chapErr) throw chapErr;

  const chapterIds = (chapterRows ?? []).map((r: any) => String(r.chapter_id));
  let lessons: LessonRow[] = [];
  if (chapterIds.length > 0) {
    const { data: lessonRows, error: lesErr } = await supabase
      .from('lessons')
      .select('*')
      .in('chapter_id', chapterIds)
      .order('sequence_no');
    if (lesErr) throw lesErr;
    lessons = (lessonRows ?? []) as LessonRow[];
  }

  // Load activities for subject
  const { data: actRows, error: actErr } = await supabase
    .from('activities')
    .select('*')
    .eq('subject_id', subjectId);
  if (actErr) throw actErr;
  const activities = (actRows ?? []) as ActivityRow[];

  // Reconstruct rules from exam blocks
  const examBlocks = runtimeBlocks.filter((b) => b.session_category === 'exam');
  const rules = reconstructRules(planRow, examBlocks, runtimeBlocks);

  return {
    planId,
    schoolId,
    sectionId,
    subjectId,
    slots: runtimeSlots,
    blocks: runtimeBlocks,
    rules,
    lessons,
    activities,
    schedulePlan: [],
  };
}

// ---------------------------------------------------------------------------
// snapshotVersion
// ---------------------------------------------------------------------------

export async function snapshotVersion(
  planId: string,
  triggerType: string,
  description: string,
  slots: RuntimeSlot[],
  blocks: RuntimeBlock[],
): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id ?? null;

  const { data: lastVersion } = await supabase
    .from('lesson_plan_versions')
    .select('version_no')
    .eq('lesson_plan_id', planId)
    .order('version_no', { ascending: false })
    .limit(1)
    .single();

  const nextVersionNo = (lastVersion?.version_no ?? 0) + 1;

  const blocksSnapshot = blocks.map((b) => ({
    block_id: b.block_id,
    block_key: b.block_key,
    slot_key: b.slot_key,
    slot_id: b.slot_id,
    session_category: b.session_category,
    session_subcategory: b.session_subcategory,
    title: b.title,
    order_no: b.order_no,
    start_time: b.start_time,
    end_time: b.end_time,
    is_locked: b.is_locked,
    metadata: b.metadata,
  }));

  const slotsSnapshot = slots.map((s) => ({
    slot_id: s.slot_id,
    slot_key: s.slot_key,
    slot_date: s.slot_date,
    start_time: s.start_time,
    end_time: s.end_time,
    blackout: s.blackout,
  }));

  const { error } = await supabase.from('lesson_plan_versions').insert({
    lesson_plan_id: planId,
    version_no: nextVersionNo,
    trigger_type: triggerType,
    trigger_description: description,
    blocks_snapshot: blocksSnapshot,
    slots_snapshot: slotsSnapshot,
    created_by: userId,
  });

  if (error) {
    // Non-fatal: log but don't block the mutation
    console.warn('[rebalance-service] snapshotVersion failed:', error.message);
  }
}

// ---------------------------------------------------------------------------
// persistRebalance
// Writes changed block placements back to the DB after rebalanceDay().
// Only updates blocks whose slot/time/order actually changed.
// ---------------------------------------------------------------------------

export async function persistRebalance(
  data: RuntimeData,
  result: RebalanceDayResult,
): Promise<void> {
  const { slots: originalSlots, blocks: originalBlocks } = data;

  // Build lookup maps
  const slotIdByKey = new Map<string, string>();
  for (const slot of originalSlots) {
    if (slot.slot_id && slot.slot_key) slotIdByKey.set(slot.slot_key, slot.slot_id);
  }
  // Also add new slots from result (shouldn't exist but be safe)
  for (const slot of result.slots) {
    if (slot.slot_id && slot.slot_key) slotIdByKey.set(slot.slot_key, slot.slot_id);
  }

  const originalById = new Map<string, RuntimeBlock>();
  for (const b of originalBlocks) {
    if (b.block_id) originalById.set(b.block_id, b);
  }

  const updates: Array<{ block_id: string; slot_id: string | null; start_time: string; end_time: string; order_no: number }> = [];

  for (const block of result.blocks) {
    if (!block.block_id) continue;
    const original = originalById.get(block.block_id);
    if (!original) continue;

    const resolvedSlotId = block.slot_key
      ? (slotIdByKey.get(block.slot_key) ?? null)
      : null;

    const origSlotId = original.slot_id ?? null;
    const origStart = original.start_time ?? null;
    const origEnd = original.end_time ?? null;

    const changed =
      resolvedSlotId !== origSlotId ||
      block.start_time !== origStart ||
      block.end_time !== origEnd ||
      block.order_no !== original.order_no;

    if (changed) {
      updates.push({
        block_id: block.block_id,
        slot_id: resolvedSlotId,
        start_time: block.start_time ?? (original.start_time ?? '00:00:00'),
        end_time: block.end_time ?? (original.end_time ?? '00:00:00'),
        order_no: block.order_no,
      });
    }
  }

  // Batch updates — Supabase doesn't support bulk UPDATE with different values
  // per row, so we do individual UPDATEs. For typical plans (< 200 blocks), this
  // is fast enough.
  for (const upd of updates) {
    const { error } = await supabase
      .from('blocks')
      .update({
        slot_id: upd.slot_id,
        start_time: upd.start_time,
        end_time: upd.end_time,
        order_no: upd.order_no,
      })
      .eq('block_id', upd.block_id);
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// persistRepopulate
// Inserts newly created blocks after applyRepopulateChoices().
// ---------------------------------------------------------------------------

export async function persistRepopulate(
  data: RuntimeData,
  result: ApplyRepopulateChoicesResult,
): Promise<string[]> {
  const { slots: originalSlots } = data;

  const slotIdByKey = new Map<string, string>();
  for (const slot of originalSlots) {
    if (slot.slot_id && slot.slot_key) slotIdByKey.set(slot.slot_key, slot.slot_id);
  }
  for (const slot of result.slots) {
    if (slot.slot_id && slot.slot_key) slotIdByKey.set(slot.slot_key, slot.slot_id);
  }

  const insertedBlockIds: string[] = [];
  const newBlocks = result.blocks.filter(
    (b) => result.inserted_block_keys.includes(b.block_key) && !b.block_id,
  );

  for (const block of newBlocks) {
    if (!block.start_time || !block.end_time) continue;
    const resolvedSlotId = block.slot_key ? (slotIdByKey.get(block.slot_key) ?? null) : null;
    const { data: inserted, error } = await supabase
      .from('blocks')
      .insert({
        lesson_plan_id: block.lesson_plan_id,
        slot_id: resolvedSlotId,
        root_block_id: block.root_block_id ?? null,
        lesson_id: block.lesson_id ?? null,
        algorithm_block_key: block.algorithm_block_key,
        block_key: block.block_key,
        title: block.title,
        description: block.description,
        session_category: block.session_category,
        session_subcategory: block.session_subcategory,
        meeting_type: block.meeting_type ?? null,
        start_time: block.start_time,
        end_time: block.end_time,
        required: block.required,
        splittable: block.splittable,
        preferred_session_type: block.preferred_session_type,
        dependency_keys: block.dependency_keys,
        order_no: block.order_no,
        is_locked: block.is_locked,
        ww_subtype: block.ww_subtype ?? null,
        pt_subtype: block.pt_subtype ?? null,
        metadata: block.metadata,
      })
      .select('block_id')
      .single();

    if (error) throw error;
    if (inserted?.block_id) insertedBlockIds.push(String(inserted.block_id));
  }

  return insertedBlockIds;
}

// ---------------------------------------------------------------------------
// suspendSlots
// Full suspend flow: snapshot → insert calendar event → rebalance → persist
// ---------------------------------------------------------------------------

export type SuspendSlotsResult = {
  displaced: DisplacedBlock[];
  vacancies: VacancyReport[];
  result: RebalanceDayResult;
};

export async function suspendSlots(
  planId: string,
  seriesKeys: string[],   // empty array = suspend whole day
  targetDate: ISODateString,
  suspendTitle: string = 'Class suspended',
): Promise<SuspendSlotsResult> {
  const data = await loadRuntimeData(planId);
  await snapshotVersion(planId, 'suspension', `Suspended on ${targetDate}`, data.slots, data.blocks);

  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id ?? null;

  // Insert a calendar event per series_key (or one whole-day event)
  if (seriesKeys.length === 0) {
    const { error } = await supabase.from('school_calendar_events').insert({
      school_id: data.schoolId,
      section_id: data.sectionId,
      subject_id: data.subjectId,
      event_type: 'suspension',
      blackout_reason: 'suspended',
      title: suspendTitle,
      start_date: targetDate,
      end_date: targetDate,
      is_whole_day: true,
      series_key: null,
      created_by: userId,
    });
    if (error) throw error;
  } else {
    for (const sk of seriesKeys) {
      const { error } = await supabase.from('school_calendar_events').insert({
        school_id: data.schoolId,
        section_id: data.sectionId,
        subject_id: data.subjectId,
        event_type: 'suspension',
        blackout_reason: 'suspended',
        title: suspendTitle,
        start_date: targetDate,
        end_date: targetDate,
        is_whole_day: false,
        series_key: sk,
        created_by: userId,
      });
      if (error) throw error;
    }
  }

  // Reload with the new blackout applied
  const fresh = await loadRuntimeData(planId);
  const rebalResult = rebalanceDay({
    slots: fresh.slots,
    blocks: fresh.blocks,
    lessons: fresh.lessons,
    activities: fresh.activities,
    rules: fresh.rules,
  });

  await persistRebalance(fresh, rebalResult);

  return {
    displaced: rebalResult.displaced,
    vacancies: rebalResult.vacancies,
    result: rebalResult,
  };
}

// ---------------------------------------------------------------------------
// unsuspendSlot
// Removes the calendar event → rebalance → return vacancies if any
// ---------------------------------------------------------------------------

export type UnsuspendResult = {
  vacancies: VacancyReport[];
  result: RebalanceDayResult;
};

export async function unsuspendSlot(
  planId: string,
  seriesKey: string | null,   // null = remove whole-day suspension
  targetDate: ISODateString,
): Promise<UnsuspendResult> {
  const data = await loadRuntimeData(planId);
  await snapshotVersion(planId, 'unsuspension', `Unsuspended on ${targetDate}`, data.slots, data.blocks);

  // Delete the matching calendar event(s)
  let query = supabase
    .from('school_calendar_events')
    .delete()
    .eq('school_id', data.schoolId)
    .eq('section_id', data.sectionId)
    .eq('subject_id', data.subjectId)
    .eq('event_type', 'suspension')
    .eq('start_date', targetDate)
    .eq('end_date', targetDate);

  if (seriesKey !== null) {
    query = query.eq('series_key', seriesKey);
  } else {
    query = query.is('series_key', null);
  }

  const { error: delErr } = await query;
  if (delErr) throw delErr;

  const fresh = await loadRuntimeData(planId);
  const rebalResult = rebalanceDay({
    slots: fresh.slots,
    blocks: fresh.blocks,
    lessons: fresh.lessons,
    activities: fresh.activities,
    rules: fresh.rules,
  });

  await persistRebalance(fresh, rebalResult);

  return {
    vacancies: rebalResult.vacancies,
    result: rebalResult,
  };
}

// ---------------------------------------------------------------------------
// runRepopulate
// Applies teacher's vacancy choices and persists the new blocks
// ---------------------------------------------------------------------------

export async function runRepopulate(
  planId: string,
  choices: RepopulateChoice[],
): Promise<{ insertedBlockIds: string[]; vacancies: VacancyReport[] }> {
  const data = await loadRuntimeData(planId);
  await snapshotVersion(planId, 'block_added', `Repopulated ${choices.length} slot(s)`, data.slots, data.blocks);

  const rebalResult = rebalanceDay({
    slots: data.slots,
    blocks: data.blocks,
    lessons: data.lessons,
    activities: data.activities,
    rules: data.rules,
  });

  const populated = applyRepopulateChoices({
    slots: rebalResult.slots,
    blocks: rebalResult.blocks,
    choices,
    schedule_plan: rebalResult.schedule_plan,
    rules: data.rules,
  });

  const insertedBlockIds = await persistRepopulate(data, populated);

  // Check remaining vacancies
  const freshCheck = await loadRuntimeData(planId);
  const rep = repopulate({
    slots: freshCheck.slots,
    blocks: freshCheck.blocks,
    lessons: freshCheck.lessons,
    activities: freshCheck.activities,
    rules: freshCheck.rules,
  });

  return { insertedBlockIds, vacancies: rep.reports };
}

// ---------------------------------------------------------------------------
// getVersionHistory
// Returns the last 50 versions for a plan (newest first)
// ---------------------------------------------------------------------------

export type VersionEntry = {
  versionId: string;
  versionNo: number;
  triggerType: string;
  triggerDescription: string | null;
  createdAt: string;
  blocksSnapshot: any[];
  slotsSnapshot: any[];
};

export async function getVersionHistory(planId: string): Promise<VersionEntry[]> {
  const { data, error } = await supabase
    .from('lesson_plan_versions')
    .select('version_id, version_no, trigger_type, trigger_description, created_at, blocks_snapshot, slots_snapshot')
    .eq('lesson_plan_id', planId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    versionId: String(row.version_id),
    versionNo: Number(row.version_no),
    triggerType: String(row.trigger_type),
    triggerDescription: row.trigger_description ? String(row.trigger_description) : null,
    createdAt: String(row.created_at),
    blocksSnapshot: Array.isArray(row.blocks_snapshot) ? row.blocks_snapshot : [],
    slotsSnapshot: Array.isArray(row.slots_snapshot) ? row.slots_snapshot : [],
  }));
}

// ---------------------------------------------------------------------------
// restoreVersion
// Restores blocks to a prior snapshot state.
// ---------------------------------------------------------------------------

export async function restoreVersion(planId: string, versionId: string): Promise<void> {
  const data = await loadRuntimeData(planId);
  await snapshotVersion(planId, 'manual_restore', `Restored to version ${versionId}`, data.slots, data.blocks);

  const { data: versionRow, error: vErr } = await supabase
    .from('lesson_plan_versions')
    .select('blocks_snapshot, slots_snapshot')
    .eq('version_id', versionId)
    .eq('lesson_plan_id', planId)
    .single();

  if (vErr) throw vErr;

  const blocksSnapshot: any[] = versionRow.blocks_snapshot ?? [];

  for (const snap of blocksSnapshot) {
    if (!snap.block_id) continue;
    // Resolve slot_id from slot_key if needed
    let resolvedSlotId = snap.slot_id ?? null;
    if (!resolvedSlotId && snap.slot_key) {
      const slot = data.slots.find((s) => s.slot_key === snap.slot_key);
      resolvedSlotId = slot?.slot_id ?? null;
    }

    const { error } = await supabase
      .from('blocks')
      .update({
        slot_id: resolvedSlotId,
        start_time: snap.start_time ?? undefined,
        end_time: snap.end_time ?? undefined,
        order_no: snap.order_no ?? 1,
        is_locked: snap.is_locked ?? false,
      })
      .eq('block_id', snap.block_id)
      .eq('lesson_plan_id', planId);

    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// getSuspendedSlotsForDay
// Returns which slots on a given date are suspended for this plan.
// ---------------------------------------------------------------------------

export type SlotSuspensionInfo = {
  seriesKey: string | null;
  startTime: string;
  endTime: string;
  slotNumber: number;
  isSuspended: boolean;
};

export async function getSlotsForDay(planId: string, dateISO: string): Promise<SlotSuspensionInfo[]> {
  const [slotRes, evtRes] = await Promise.all([
    supabase
      .from('slots')
      .select('slot_id, series_key, start_time, end_time, slot_number')
      .eq('lesson_plan_id', planId)
      .eq('slot_date', dateISO)
      .order('slot_number'),
    supabase
      .from('school_calendar_events')
      .select('series_key')
      .eq('event_type', 'suspension')
      .lte('start_date', dateISO)
      .gte('end_date', dateISO),
  ]);

  if (slotRes.error) throw slotRes.error;
  if (evtRes.error) throw evtRes.error;

  const suspendedKeys = new Set<string>();
  let wholeDaySuspended = false;

  for (const evt of evtRes.data ?? []) {
    if (evt.series_key === null || evt.series_key === undefined) {
      wholeDaySuspended = true;
    } else {
      suspendedKeys.add(String(evt.series_key));
    }
  }

  return (slotRes.data ?? []).map((row: any) => ({
    seriesKey: row.series_key ? String(row.series_key) : null,
    startTime: String(row.start_time),
    endTime: String(row.end_time),
    slotNumber: Number(row.slot_number),
    isSuspended: wholeDaySuspended || (row.series_key ? suspendedKeys.has(String(row.series_key)) : false),
  }));
}
