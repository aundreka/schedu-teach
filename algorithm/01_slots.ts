import type {
  BlackoutInfo,
  CreateSlotsParams,
  DelayRow,
  ISODateString,
  MeetingPattern,
  RuntimeSlot,
  SchoolCalendarEventRow,
  SlotKey,
  SlotRow,
  TempId,
  TimeString,
  WeekdayName,
} from './00_types';

const WEEKDAY_BY_INDEX: WeekdayName[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

type NormalizedPattern = {
  weekday: WeekdayName;
  start_time: TimeString;
  end_time: TimeString;
  start_minutes: number;
  end_minutes: number;
  meeting_type: MeetingPattern['meeting_type'];
  title: string | null;
  slot_number: number;
  series_key: string;
};

type SlotOverlapCheck = Pick<
  RuntimeSlot,
  'slot_date' | 'slot_key' | 'start_time' | 'end_time' | 'slot_number'
>;

export function createSlots(params: CreateSlotsParams): RuntimeSlot[] {
  const patternsByWeekday = normalizeMeetingPatterns(params.meeting_patterns);
  const blackoutByDate = buildBlackoutMap(params);
  const generatedSlots = expandMeetingPatterns(params, patternsByWeekday, blackoutByDate);
  const mergedSlots = mergeExistingSlots(params, generatedSlots, blackoutByDate);

  assertNoSlotOverlaps(mergedSlots);

  return mergedSlots.sort(compareRuntimeSlots);
}

function normalizeMeetingPatterns(
  meetingPatterns: MeetingPattern[],
): Map<WeekdayName, NormalizedPattern[]> {
  const grouped = new Map<WeekdayName, NormalizedPattern[]>();

  for (const pattern of meetingPatterns) {
    const start_minutes = parseTimeToMinutes(pattern.start_time);
    const end_minutes = parseTimeToMinutes(pattern.end_time);

    if (end_minutes <= start_minutes) {
      throw new Error(
        `Invalid meeting pattern for ${pattern.weekday}: end_time must be after start_time.`,
      );
    }

    const list = grouped.get(pattern.weekday) ?? [];
    const slot_number =
      typeof pattern.slot_number === 'number' && pattern.slot_number > 0
        ? Math.floor(pattern.slot_number)
        : list.length + 1;

    list.push({
      weekday: pattern.weekday,
      start_time: normalizeTime(pattern.start_time),
      end_time: normalizeTime(pattern.end_time),
      start_minutes,
      end_minutes,
      meeting_type: pattern.meeting_type ?? null,
      title: pattern.title ?? null,
      slot_number,
      series_key:
        pattern.series_key?.trim() ||
        buildSeriesKey(
          pattern.weekday,
          normalizeTime(pattern.start_time),
          normalizeTime(pattern.end_time),
          pattern.meeting_type ?? null,
          slot_number,
        ),
    });

    grouped.set(pattern.weekday, list);
  }

  for (const [weekday, list] of Array.from(grouped.entries())) {
    list.sort(comparePatterns);

    for (let index = 0; index < list.length; index += 1) {
      const pattern = list[index];
      pattern.slot_number = index + 1;

      const next = list[index + 1];
      if (next && pattern.end_minutes > next.start_minutes) {
        throw new Error(
          `Overlapping meeting patterns detected on ${weekday}: slot ${index + 1} overlaps slot ${index + 2}.`,
        );
      }
    }
  }

  return grouped;
}

function expandMeetingPatterns(
  params: CreateSlotsParams,
  patternsByWeekday: Map<WeekdayName, NormalizedPattern[]>,
  blackoutByDate: Map<ISODateString, BlackoutInfo>,
): RuntimeSlot[] {
  const slots: RuntimeSlot[] = [];

  for (const slot_date of enumerateDates(
    params.lesson_plan.start_date,
    params.lesson_plan.end_date,
  )) {
    const weekday = getWeekdayName(slot_date);
    const patterns = patternsByWeekday.get(weekday) ?? [];

    for (const pattern of patterns) {
      const slot_key = makeSlotKey(slot_date, pattern.slot_number);

      slots.push({
        slot_id: undefined,
        temp_id: makeTempId(slot_date, pattern.slot_number, pattern.series_key),
        lesson_plan_id: params.lesson_plan.lesson_plan_id,
        slot_key,
        title: pattern.title,
        slot_date,
        weekday,
        start_time: pattern.start_time,
        end_time: pattern.end_time,
        duration_minutes: pattern.end_minutes - pattern.start_minutes,
        meeting_type: pattern.meeting_type ?? null,
        slot_number: pattern.slot_number,
        series_key: pattern.series_key,
        is_locked: false,
        blackout: blackoutByDate.get(slot_date) ?? null,
        assigned_block_keys: [],
      });
    }
  }

  return slots;
}

function mergeExistingSlots(
  params: CreateSlotsParams,
  generatedSlots: RuntimeSlot[],
  blackoutByDate: Map<ISODateString, BlackoutInfo>,
): RuntimeSlot[] {
  const mergedByKey = new Map<SlotKey, RuntimeSlot>(
    generatedSlots.map((slot) => [slot.slot_key, slot]),
  );
  const preserveLocked = params.rules.respect_locked_slots;

  for (const existing of params.existing_slots ?? []) {
    if (!isDateWithinPlan(params, existing.slot_date)) {
      continue;
    }

    const slot_key = makeSlotKey(existing.slot_date, existing.slot_number);
    const generated = mergedByKey.get(slot_key);

    if (generated) {
      mergedByKey.set(
        slot_key,
        mergeMatchingSlot(existing, generated, blackoutByDate.get(existing.slot_date) ?? null),
      );
      continue;
    }

    if (!preserveLocked || !existing.is_locked) {
      continue;
    }

    mergedByKey.set(
      slot_key,
      runtimeSlotFromRow(existing, blackoutByDate.get(existing.slot_date) ?? null),
    );
  }

  return Array.from(mergedByKey.values());
}

function mergeMatchingSlot(
  existing: SlotRow,
  generated: RuntimeSlot,
  blackout: BlackoutInfo | null,
): RuntimeSlot {
  const start_time = normalizeTime(existing.start_time);
  const end_time = normalizeTime(existing.end_time);

  return {
    ...generated,
    slot_id: existing.slot_id,
    temp_id: makeTempId(existing.slot_date, existing.slot_number, existing.series_key),
    title: existing.title ?? generated.title,
    start_time,
    end_time,
    duration_minutes:
      parseTimeToMinutes(existing.end_time) - parseTimeToMinutes(existing.start_time),
    meeting_type: existing.meeting_type ?? generated.meeting_type,
    series_key: existing.series_key || generated.series_key,
    is_locked: existing.is_locked,
    blackout,
    assigned_block_keys: [],
  };
}

function runtimeSlotFromRow(
  slot: SlotRow,
  blackout: BlackoutInfo | null,
): RuntimeSlot {
  const start_time = normalizeTime(slot.start_time);
  const end_time = normalizeTime(slot.end_time);

  return {
    slot_id: slot.slot_id,
    temp_id: makeTempId(slot.slot_date, slot.slot_number, slot.series_key),
    lesson_plan_id: slot.lesson_plan_id,
    slot_key: makeSlotKey(slot.slot_date, slot.slot_number),
    title: slot.title,
    slot_date: slot.slot_date,
    weekday: slot.weekday,
    start_time,
    end_time,
    duration_minutes:
      parseTimeToMinutes(slot.end_time) - parseTimeToMinutes(slot.start_time),
    meeting_type: slot.meeting_type,
    slot_number: slot.slot_number,
    series_key: slot.series_key,
    is_locked: slot.is_locked,
    blackout,
    assigned_block_keys: [],
  };
}

function buildBlackoutMap(
  params: CreateSlotsParams,
): Map<ISODateString, BlackoutInfo> {
  const blackoutByDate = new Map<ISODateString, BlackoutInfo>();

  for (const event of params.school_calendar_events) {
    if (!appliesToLessonPlan(params, event)) {
      continue;
    }

    for (const slot_date of enumerateClampedDates(
      event.start_date,
      event.end_date,
      params.lesson_plan.start_date,
      params.lesson_plan.end_date,
    )) {
      const existing = blackoutByDate.get(slot_date);
      const candidate: BlackoutInfo = {
        reason: event.blackout_reason,
        title: event.title,
        source: 'school_calendar_event',
        source_id: event.event_id,
      };

      if (!existing || shouldReplaceBlackout(existing, candidate)) {
        blackoutByDate.set(slot_date, candidate);
      }
    }
  }

  for (const delay of params.delays) {
    if (!appliesDelayToLessonPlan(params, delay)) {
      continue;
    }

    if (!isDateWithinRange(delay.absent_on, params.lesson_plan.start_date, params.lesson_plan.end_date)) {
      continue;
    }

    blackoutByDate.set(delay.absent_on, {
      reason: delay.blackout_reason,
      title: delay.reason?.trim() || 'Teacher unavailable',
      source: 'delay',
      source_id: delay.delay_id,
    });
  }

  return blackoutByDate;
}

function appliesToLessonPlan(
  params: CreateSlotsParams,
  event: SchoolCalendarEventRow,
): boolean {
  return (
    event.school_id === params.lesson_plan.school_id &&
    (event.section_id === null || event.section_id === params.lesson_plan.section_id) &&
    (event.subject_id === null || event.subject_id === params.lesson_plan.subject_id)
  );
}

function appliesDelayToLessonPlan(
  params: CreateSlotsParams,
  delay: DelayRow,
): boolean {
  return (
    delay.school_id === params.lesson_plan.school_id &&
    (delay.section_id === null || delay.section_id === params.lesson_plan.section_id) &&
    (delay.subject_id === null || delay.subject_id === params.lesson_plan.subject_id)
  );
}

function shouldReplaceBlackout(
  current: BlackoutInfo,
  candidate: BlackoutInfo,
): boolean {
  return blackoutPriority(candidate) > blackoutPriority(current);
}

function blackoutPriority(blackout: BlackoutInfo): number {
  if (blackout.source === 'delay') return 3;
  if (blackout.reason === 'exam_week') return 2;
  return 1;
}

function assertNoSlotOverlaps(slots: RuntimeSlot[]): void {
  const byDate = new Map<ISODateString, SlotOverlapCheck[]>();

  for (const slot of slots) {
    const list = byDate.get(slot.slot_date) ?? [];
    list.push(slot);
    byDate.set(slot.slot_date, list);
  }

  for (const [slot_date, daySlots] of Array.from(byDate.entries())) {
    daySlots.sort(compareSlotTimes);

    for (let index = 0; index < daySlots.length - 1; index += 1) {
      const current = daySlots[index];
      const next = daySlots[index + 1];

      if (
        parseTimeToMinutes(current.end_time) >
        parseTimeToMinutes(next.start_time)
      ) {
        throw new Error(
          `Generated slots overlap on ${slot_date}: ${current.slot_key} overlaps ${next.slot_key}.`,
        );
      }
    }
  }
}

function compareRuntimeSlots(a: RuntimeSlot, b: RuntimeSlot): number {
  if (a.slot_date !== b.slot_date) {
    return a.slot_date.localeCompare(b.slot_date);
  }

  return compareSlotTimes(a, b);
}

function compareSlotTimes(
  a: Pick<RuntimeSlot, 'start_time' | 'end_time' | 'slot_number'>,
  b: Pick<RuntimeSlot, 'start_time' | 'end_time' | 'slot_number'>,
): number {
  const startDiff = parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time);
  if (startDiff !== 0) return startDiff;

  const endDiff = parseTimeToMinutes(a.end_time) - parseTimeToMinutes(b.end_time);
  if (endDiff !== 0) return endDiff;

  return a.slot_number - b.slot_number;
}

function comparePatterns(a: NormalizedPattern, b: NormalizedPattern): number {
  const startDiff = a.start_minutes - b.start_minutes;
  if (startDiff !== 0) return startDiff;

  const endDiff = a.end_minutes - b.end_minutes;
  if (endDiff !== 0) return endDiff;

  return a.slot_number - b.slot_number;
}

function enumerateClampedDates(
  start_date: ISODateString,
  end_date: ISODateString,
  min_date: ISODateString,
  max_date: ISODateString,
): ISODateString[] {
  const clampedStart = start_date > min_date ? start_date : min_date;
  const clampedEnd = end_date < max_date ? end_date : max_date;

  if (clampedStart > clampedEnd) {
    return [];
  }

  return enumerateDates(clampedStart, clampedEnd);
}

function enumerateDates(
  start_date: ISODateString,
  end_date: ISODateString,
): ISODateString[] {
  const dates: ISODateString[] = [];
  let current = start_date;

  while (current <= end_date) {
    dates.push(current);
    current = addDays(current, 1);
  }

  return dates;
}

function addDays(date: ISODateString, days: number): ISODateString {
  const [year, month, day] = date.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day + days));
  return utcDate.toISOString().slice(0, 10) as ISODateString;
}

function getWeekdayName(date: ISODateString): WeekdayName {
  const [year, month, day] = date.split('-').map(Number);
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return WEEKDAY_BY_INDEX[weekdayIndex]!;
}

function isDateWithinPlan(
  params: CreateSlotsParams,
  date: ISODateString,
): boolean {
  return isDateWithinRange(
    date,
    params.lesson_plan.start_date,
    params.lesson_plan.end_date,
  );
}

function isDateWithinRange(
  date: ISODateString,
  start_date: ISODateString,
  end_date: ISODateString,
): boolean {
  return date >= start_date && date <= end_date;
}

function parseTimeToMinutes(time: TimeString): number {
  const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error(`Invalid time string: "${time}". Expected HH:mm or HH:mm:ss.`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? '0');

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    throw new Error(`Invalid time value: "${time}".`);
  }

  return hours * 60 + minutes + seconds / 60;
}

function normalizeTime(time: TimeString): TimeString {
  const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error(`Invalid time string: "${time}". Expected HH:mm or HH:mm:ss.`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? '0');

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function buildSeriesKey(
  weekday: WeekdayName,
  start_time: TimeString,
  end_time: TimeString,
  meeting_type: MeetingPattern['meeting_type'],
  slot_number: number,
): string {
  return [
    'pattern',
    weekday,
    start_time.slice(0, 5),
    end_time.slice(0, 5),
    meeting_type ?? 'none',
    String(slot_number),
  ].join('__');
}

function makeSlotKey(
  slot_date: ISODateString,
  slot_number: number,
): SlotKey {
  return `${slot_date}#${slot_number}`;
}

function makeTempId(
  slot_date: ISODateString,
  slot_number: number,
  series_key: string,
): TempId {
  const sanitized = series_key.replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `tmp_slot_${slot_date}_${slot_number}_${sanitized}`;
}
