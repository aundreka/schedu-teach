import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    LayoutAnimation,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    UIManager,
    View,
} from "react-native";
import type {
    AlgorithmRules,
    LessonPlanRow,
    MeetingPattern,
    SchoolCalendarEventRow,
} from "../../../algorithm/00_types";
import { createSlots } from "../../../algorithm/01_slots";
import { buildBlocks } from "../../../algorithm/buildBlocks";
import {
    complexityScoreToDifficulty,
    complexityScoreToEstimatedMinutes,
    deriveLessonComplexityScore,
} from "../../../algorithm/buildPacingPlan";
import { placeBlocks } from "../../../algorithm/placeBlocks";
import { Radius, Spacing, Typography } from "../../../constants/fonts";
import * as Localization from "expo-localization";
import { useAppTheme } from "../../../context/theme";
import { usePullToRefresh } from "../../../hooks/usePullToRefresh";
import { defaultPlanStart, getSchoolYearForDate, todayIso } from "../../../lib/deped-calendar";
import { emitLessonPlanRefresh } from "../../../lib/lesson-plan-refresh";
import { supabase } from "../../../lib/supabase";
import PaywallModal from "../../../components/PaywallModal";
import type { QuotaType } from "../../../components/PaywallModal";
import { Badge, Chip, ListRow, SectionHeader, StepFlow, type StepDef } from "../../../components/ui";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

type RequirementKey = "written_work" | "performance_task" | "exam";
type WeekdayName = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
type RoomType = "lecture" | "laboratory";
type Difficulty = "easy" | "medium" | "hard";

type TOCUnit = {
  id: string;
  courseId: string;
  chapterId: string;
  chapterTitle: string;
  title: string;
  order: number;
  estimatedMinutes: number;
  difficulty: Difficulty;
  preferredSessionType: "lecture" | "laboratory" | "mixed" | "any";
  required: boolean;
};

type TeacherRules = {
  quizMode: "none" | "hybrid";
  quizEveryNLessons: number;
  writtenWorkMode: "total";
  minWW: number;
  allowLessonWrittenWorkOverlay: boolean;
  preferLessonWrittenWorkOverlay: boolean;
  minPT: number;
  includeReviewBeforeExam: boolean;
};

type PlanSlotRow = {
  series_key: string;
  weekday: WeekdayName;
  start_time: string;
  end_time: string;
  meeting_type: "lecture" | "laboratory" | null;
  slot_number: number;
};

type PlanBlockRow = {
  session_category: "lesson" | "written_work" | "performance_task" | "exam" | "buffer";
  slot_id: string | null;
  metadata: Record<string, unknown> | null;
};

type InstitutionItem = {
  school_id: string;
  name: string;
};

type SubjectItem = {
  subject_id: string;
  school_id: string;
  code: string;
  title: string;
  academic_year: string | null;
  description: string | null;
  syllabus: string | null;
};

type SectionItem = {
  section_id: string;
  school_id: string;
  name: string;
  grade_level: string | null;
};

type ChapterOption = {
  chapter_id: string;
  title: string;
  sequence_no: number;
  unit_id: string | null;
  unit_title: string | null;
  unit_sequence_no: number | null;
  lessons: LessonOption[];
};

type LessonOption = {
  lesson_id: string;
  chapter_id: string;
  title: string;
  sequence_no: number;
  content: string | null;
  learning_objectives: string | null;
  estimated_minutes: number | null;
  complexity_score: number | null;
};

type UnitGroup = {
  key: string;
  title: string;
  chapters: ChapterOption[];
};

type ClassInstance = {
  id: string;
  room: RoomType;
  start: string;
  end: string;
};

type DaySchedule = {
  instances: ClassInstance[];
};

type SpecialDate = {
  id: string;
  dateText: string;
  reason: string;
};

type ExamSchedule = {
  id: string;
  dateText: string;
};

type TimeTarget = {
  day: WeekdayName;
  instanceId: string;
  field: "start" | "end";
};

type DateTarget =
  | { type: "duration"; field: "start" | "end" }
  | { type: "special"; id: string }
  | { type: "exam"; id: string };

type DuplicatedPlanRow = {
  lesson_plan_id: string;
  academic_year: string | null;
  start_date: string;
  end_date: string;
  school_id: string;
  subject_id: string;
  section_id: string;
};

type DuplicatedSlotRow = Pick<
  PlanSlotRow,
  "series_key" | "weekday" | "start_time" | "end_time" | "meeting_type" | "slot_number"
>;

type DuplicatedBlockRow = Pick<
  PlanBlockRow,
  "session_category" | "slot_id" | "metadata"
>;

type DuplicatedContentRow = {
  content_level: string | null;
  chapter_id: string | null;
  lesson_id: string | null;
};

type FormFieldErrorKey =
  | "institution"
  | "subject"
  | "section"
  | "startDate"
  | "endDate"
  | "content"
  | "schedule"
  | "requirements"
  | "examDates";

const REQUIREMENT_LABEL: Record<RequirementKey, string> = {
  written_work: "Written Work",
  performance_task: "Performance Task",
  exam: "Exam",
};

const DAY_OPTIONS: { key: WeekdayName; short: string; label: string }[] = [
  { key: "monday", short: "Mon", label: "Monday" },
  { key: "tuesday", short: "Tue", label: "Tuesday" },
  { key: "wednesday", short: "Wed", label: "Wednesday" },
  { key: "thursday", short: "Thu", label: "Thursday" },
  { key: "friday", short: "Fri", label: "Friday" },
  { key: "saturday", short: "Sat", label: "Saturday" },
];

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function toLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function makeId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function buildAcademicYearFallback(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return `${start.getFullYear()}-${end.getFullYear()}`;
}

function normalizeDateInput(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return toLocalDateString(parsed);
  }
  return value;
}

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function normalizeBlockSubcategory(
  category: "lesson" | "written_work" | "performance_task" | "exam" | "buffer",
  subcategory: string | null | undefined
) {
  const normalized = (subcategory ?? "").trim().toLowerCase();
  const allowed = {
    lesson: ["lecture", "laboratory"],
    written_work: ["assignment", "seatwork", "quiz"],
    performance_task: ["activity", "lab_report", "reporting", "project"],
    exam: ["prelim", "midterm", "final"],
    buffer: ["review", "preparation", "orientation", "other"],
  } as const;

  return allowed[category].includes(normalized as never)
    ? (normalized as (typeof allowed)[typeof category][number])
    : allowed[category][0];
}

function toSqlTime(value: string) {
  const raw = value.trim().toUpperCase();
  const ampm = raw.endsWith("AM") ? "AM" : raw.endsWith("PM") ? "PM" : null;
  const core = ampm ? raw.slice(0, -2).trim() : raw;
  const [hPart, mPart] = core.split(":");
  const hours = Number(hPart);
  const mins = Number(mPart ?? "0");
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;

  let hour24 = hours;
  if (ampm) {
    if (hours < 1 || hours > 12) return null;
    if (ampm === "AM") hour24 = hours === 12 ? 0 : hours;
    if (ampm === "PM") hour24 = hours === 12 ? 12 : hours + 12;
  }

  return `${String(hour24).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00`;
}

function hasValidTimeRange(startValue: string, endValue: string) {
  const start = toSqlTime(startValue);
  const end = toSqlTime(endValue);
  if (!start || !end) return false;
  return end > start;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA < endB && startB < endA;
}

type ScheduleConflict = {
  day: WeekdayName;
  start: string;
  end: string;
  message: string;
};

function collectDraftRecurringSlots(input: {
  activeDays: Set<WeekdayName>;
  daySchedules: Record<WeekdayName, DaySchedule>;
}) {
  return Array.from(input.activeDays)
    .flatMap((day) =>
      input.daySchedules[day].instances
        .map((instance) => {
          const start = toSqlTime(instance.start);
          const end = toSqlTime(instance.end);
          if (!start || !end || end <= start) return null;
          return {
            day,
            start,
            end,
            room: instance.room,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
    )
    .sort((a, b) => {
      if (a.day !== b.day) return a.day.localeCompare(b.day);
      if (a.start !== b.start) return a.start.localeCompare(b.start);
      return a.end.localeCompare(b.end);
    });
}

function findDraftScheduleOverlap(slots: ReturnType<typeof collectDraftRecurringSlots>): ScheduleConflict | null {
  for (let index = 0; index < slots.length; index += 1) {
    const current = slots[index];
    for (let nextIndex = index + 1; nextIndex < slots.length; nextIndex += 1) {
      const other = slots[nextIndex];
      if (other.day !== current.day) break;
      if (!rangesOverlap(current.start, current.end, other.start, other.end)) continue;
      return {
        day: current.day,
        start: current.start,
        end: current.end,
        message: `The ${DAY_OPTIONS.find((item) => item.key === current.day)?.label ?? current.day} schedule has overlapping class times.`,
      };
    }
  }

  return null;
}

type ExistingRecurringClass = {
  lesson_plan_id: string;
  title: string;
  start_date: string;
  end_date: string;
  day: WeekdayName;
  start_time: string;
  end_time: string;
};

function findExistingScheduleOverlap(input: {
  slots: ReturnType<typeof collectDraftRecurringSlots>;
  existingRows: ExistingRecurringClass[];
  nextPlanStart: string;
  nextPlanEnd: string;
}): ScheduleConflict | null {
  for (const slot of input.slots) {
    for (const row of input.existingRows) {
      if (row.day !== slot.day) continue;
      if (row.end_date < input.nextPlanStart || row.start_date > input.nextPlanEnd) continue;
      if (!rangesOverlap(slot.start, slot.end, row.start_time, row.end_time)) continue;
      return {
        day: slot.day,
        start: slot.start,
        end: slot.end,
        message: `${DAY_OPTIONS.find((item) => item.key === slot.day)?.label ?? slot.day} ${slot.start.slice(0, 5)}-${slot.end.slice(0, 5)} conflicts with "${row.title}".`,
      };
    }
  }

  return null;
}

function parseDisplayTime(value: string) {
  const raw = value.trim().toUpperCase();
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!match) return { hour: 8, minute: 0, meridiem: "AM" as const };
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3] as "AM" | "PM";
  return {
    hour: hour >= 1 && hour <= 12 ? hour : 8,
    minute: [0, 15, 30, 45].includes(minute) ? minute : 0,
    meridiem,
  };
}

function formatDisplayTime(hour: number, minute: number, meridiem: "AM" | "PM") {
  return `${hour}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function sqlTimeToDisplay(value: string | null) {
  if (!value) return "8:00 AM";
  const match = value.match(/^(\d{2}):(\d{2})/);
  if (!match) return value;
  const hours24 = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours24) || !Number.isFinite(minutes)) return value;
  const meridiem: "AM" | "PM" = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return formatDisplayTime(hours12, minutes, meridiem);
}

function parseAcademicStartYear(value: string | null) {
  if (!value) return null;
  const match = value.match(/(\d{4})\D*(\d{4})?/);
  if (!match) return null;
  const first = Number(match[1]);
  if (!Number.isFinite(first)) return null;
  return first;
}

function formatAcademicYear(startYear: number) {
  return `${startYear}-${startYear + 1}`;
}

function formatIsoDisplay(value: string) {
  const [y, m, d] = value.split("-").map((p) => Number(p));
  if (!y || !m || !d) return value;
  return `${MONTH_LABELS[m - 1]} ${String(d).padStart(2, "0")}, ${y}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getExamDefinition(index: number, total: number) {
  if (total <= 1) {
    return { title: "Final Exam", subcategory: "final" as const, label: "Final Exam" };
  }

  if (total === 2) {
    return index === 0
      ? { title: "Midterm Exam", subcategory: "midterm" as const, label: "Midterm Exam" }
      : { title: "Final Exam", subcategory: "final" as const, label: "Final Exam" };
  }

  if (total === 3) {
    if (index === 0) return { title: "Prelim Exam", subcategory: "prelim" as const, label: "Prelim Exam" };
    if (index === 1) return { title: "Midterm Exam", subcategory: "midterm" as const, label: "Midterm Exam" };
    return { title: "Final Exam", subcategory: "final" as const, label: "Final Exam" };
  }

  return {
    title: `Exam ${index + 1}`,
    subcategory: index === 0 ? ("prelim" as const) : index === total - 1 ? ("final" as const) : ("midterm" as const),
    label: `Exam ${index + 1}`,
  };
}

function buildTocUnitsFromSelections(
  lessonPlanId: string,
  selectedLessons: { chapter: ChapterOption; lesson: LessonOption }[],
  selectedChapters: ChapterOption[]
): TOCUnit[] {
  if (selectedLessons.length > 0) {
    return selectedLessons.map(({ chapter, lesson }, index) => {
      const computedComplexity =
        lesson.complexity_score ??
        deriveLessonComplexityScore({
          title: lesson.title,
          content: lesson.content,
          learningObjectives: lesson.learning_objectives,
        });
      const estimatedMinutes = lesson.estimated_minutes ?? complexityScoreToEstimatedMinutes(computedComplexity);

      return {
        id: lesson.lesson_id,
        courseId: lessonPlanId,
        chapterId: chapter.chapter_id,
        chapterTitle: chapter.title,
        title: `Lesson ${index + 1}: ${lesson.title}`,
        order: index + 1,
        estimatedMinutes,
        difficulty: complexityScoreToDifficulty(computedComplexity),
        preferredSessionType: "lecture",
        required: true,
      };
    });
  }

  return selectedChapters.map((chapter, index) => ({
    id: chapter.chapter_id,
    courseId: lessonPlanId,
    chapterId: chapter.chapter_id,
    chapterTitle: chapter.title,
    title: `Lesson ${index + 1}: ${chapter.title}`,
    order: index + 1,
    estimatedMinutes: 60,
    difficulty: "medium",
    preferredSessionType: "lecture",
    required: true,
  }));
}

function buildTeacherRulesFromCounts(requirementCounts: Record<RequirementKey, string>): TeacherRules {
  return {
    quizMode: "hybrid",
    quizEveryNLessons: 3,
    writtenWorkMode: "total",
    minWW: Math.max(1, Number(requirementCounts.written_work || "1")),
    allowLessonWrittenWorkOverlay: true,
    preferLessonWrittenWorkOverlay: true,
    minPT: Math.max(1, Number(requirementCounts.performance_task || "1")),
    includeReviewBeforeExam: Math.max(1, Number(requirementCounts.exam || "1")) > 0,
  };
}

function buildMeetingPatterns(
  activeDays: Set<WeekdayName>,
  daySchedules: Record<WeekdayName, DaySchedule>
): MeetingPattern[] {
  return Array.from(activeDays).reduce<MeetingPattern[]>((acc, day) => {
    daySchedules[day].instances.forEach((slot, index) => {
        const startTime = toSqlTime(slot.start);
        const endTime = toSqlTime(slot.end);
        if (!startTime || !endTime) return;
        acc.push({
          weekday: day,
          start_time: startTime,
          end_time: endTime,
          meeting_type: slot.room,
          slot_number: index + 1,
          series_key: slot.id,
        });
    });
    return acc;
  }, []);
}

function buildManualBlackoutEvents(
  specialDates: SpecialDate[],
  lessonPlan: Pick<LessonPlanRow, "school_id" | "subject_id" | "section_id">
): SchoolCalendarEventRow[] {
  const now = new Date().toISOString();

  return specialDates.reduce<SchoolCalendarEventRow[]>((acc, row) => {
      const slotDate = normalizeDateInput(row.dateText);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) return acc;

      acc.push({
        event_id: row.id,
        school_id: lessonPlan.school_id,
        section_id: lessonPlan.section_id,
        subject_id: lessonPlan.subject_id,
        event_type: "other" as const,
        blackout_reason: "other" as const,
        title: row.reason.trim() || "Blocked date",
        description: null,
        start_date: slotDate,
        end_date: slotDate,
        is_whole_day: true,
        created_by: null,
        created_at: now,
        updated_at: now,
      });

      return acc;
    }, []);
}

function buildSlotRules(): AlgorithmRules {
  return {
    academic_term: undefined,
    terms: [],
    term_rules: [],
    respect_locked_slots: true,
    respect_locked_blocks: true,
    fill_empty_slots: false,
    preserve_existing_exams: true,
    preserve_existing_locked_blocks: true,
    allow_buffer_blocks: true,
    allow_split_blocks: true,
  };
}

function makeInstance(room: RoomType = "lecture", start = "8:00 AM", end = "10:00 AM"): ClassInstance {
  return { id: makeId(), room, start, end };
}

function AnimatedDayChip({
  active,
  label,
  fullLabel,
  onPress,
}: {
  active: boolean;
  label: string;
  fullLabel: string;
  onPress: () => void;
}) {
  const { colors: c } = useAppTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View
      style={[
        styles.dayChip,
        { backgroundColor: active ? c.tint : c.card, borderColor: active ? c.tint : c.border },
        animStyle,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={fullLabel}
        accessibilityState={{ selected: active }}
        style={styles.dayChipInner}
        onPressIn={() => { scale.value = withTiming(0.91, { duration: 70 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 8, stiffness: 200 }); }}
        onPress={() => { Haptics.selectionAsync(); onPress(); }}
      >
        <Text style={[styles.dayChipText, { color: active ? c.onTint : c.mutedText }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function SelectField({
  label,
  value,
  placeholder,
  error,
  onPress,
  containerStyle,
}: {
  label?: string;
  value: string;
  placeholder: string;
  error?: string;
  onPress: () => void;
  containerStyle?: object;
}) {
  const { colors: c } = useAppTheme();
  return (
    <View style={containerStyle}>
      {label ? (
        <Text style={[Typography.bodySm, styles.selectLabel, { color: error ? c.danger : c.mutedText }]}>
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        accessibilityValue={value ? { text: value } : undefined}
        onPress={onPress}
        style={[
          styles.selectField,
          { backgroundColor: c.surfaceAlt, borderColor: error ? c.danger : c.border },
        ]}
      >
        <Text numberOfLines={1} style={[Typography.body, styles.selectValue, { color: value ? c.text : c.faintText }]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={c.faintText} />
      </Pressable>
      {error ? <Text style={[Typography.caption, styles.fieldErrorText, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

function ConflictBanner({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  const { colors: c } = useAppTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[styles.conflictBanner, { backgroundColor: c.dangerSoft }]}
    >
      <Ionicons name="alert-circle" size={18} color={c.danger} />
      <View style={styles.conflictBannerBody}>
        <Text style={[Typography.bodySm, { color: c.danger, fontWeight: "600" }]}>{message}</Text>
        {actionLabel && onAction ? (
          <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} hitSlop={8}>
            <Text style={[Typography.bodySm, styles.conflictBannerLink, { color: c.danger }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function LessonplanScreen() {
  const { colors: c } = useAppTheme();
  const createInFlightRef = useRef(false);
  const hydratedDuplicateIdRef = useRef("");
  const params = useLocalSearchParams<{
    duplicateFromPlanId?: string | string[];
    replacePlanId?: string | string[];
    prefillStart?: string | string[];
    prefillEnd?: string | string[];
    effectiveStart?: string | string[];
    lessonNo?: string | string[];
    writtenWorkNo?: string | string[];
    performanceTaskNo?: string | string[];
    examNo?: string | string[];
  }>();
  const duplicateFromPlanId = useMemo(() => {
    const value = params.duplicateFromPlanId;
    return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
  }, [params.duplicateFromPlanId]);
  const pickParam = (raw: string | string[] | undefined): string => {
    if (Array.isArray(raw)) return String(raw[0] ?? "");
    return String(raw ?? "");
  };
  const prefillStart = useMemo(() => pickParam(params.prefillStart), [params.prefillStart]);
  const prefillEnd = useMemo(() => pickParam(params.prefillEnd), [params.prefillEnd]);
  const onboardingEffectiveStart = useMemo(
    () => pickParam(params.effectiveStart),
    [params.effectiveStart],
  );
  const onboardingProgressAnchor = useMemo(() => {
    const lessonNo = pickParam(params.lessonNo);
    const writtenWorkNo = pickParam(params.writtenWorkNo);
    const performanceTaskNo = pickParam(params.performanceTaskNo);
    const examNo = pickParam(params.examNo);
    if (!lessonNo && !writtenWorkNo && !performanceTaskNo && !examNo) return null;
    return {
      lesson_no: Number(lessonNo) || 0,
      written_work_no: Number(writtenWorkNo) || 0,
      performance_task_no: Number(performanceTaskNo) || 0,
      exam_no: Number(examNo) || 0,
    };
  }, [params.lessonNo, params.writtenWorkNo, params.performanceTaskNo, params.examNo]);
  // When set, the freshly built plan replaces this existing one (Recreate flow):
  // it is excluded from the duplicate/overlap guards and removed once the new
  // plan is saved.
  const replacePlanId = useMemo(() => {
    const value = params.replacePlanId;
    return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
  }, [params.replacePlanId]);

  if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallQuotaType, setPaywallQuotaType] = useState<QuotaType>("lesson_plan");
  const [subjectMenuOpen, setSubjectMenuOpen] = useState(false);
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [institutionMenuOpen, setInstitutionMenuOpen] = useState(false);
  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [timeTarget, setTimeTarget] = useState<TimeTarget | null>(null);
  const [dateTarget, setDateTarget] = useState<DateTarget | null>(null);
  const [pickerHour, setPickerHour] = useState(8);
  const [pickerMinute, setPickerMinute] = useState(0);
  const [pickerMeridiem, setPickerMeridiem] = useState<"AM" | "PM">("AM");

  // Guided-funnel position; every input's state lives at the screen level so
  // values survive moving back and forward between steps.
  const [stepIndex, setStepIndex] = useState(0);
  // Cross-plan schedule conflict discovered at save time; surfaced inline on
  // the review step with a jump back to the schedule step.
  const [serverConflict, setServerConflict] = useState<string | null>(null);

  const nowYear = new Date().getFullYear();
  const [datePickerYear, setDatePickerYear] = useState(nowYear);
  const [datePickerMonth, setDatePickerMonth] = useState(1);
  const [datePickerDay, setDatePickerDay] = useState(1);

  const [institutions, setInstitutions] = useState<InstitutionItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [chapters, setChapters] = useState<ChapterOption[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [selectedLessonIds, setSelectedLessonIds] = useState<Set<string>>(new Set());

  const initialPlanStart = useMemo(
    () => (/^\d{4}-\d{2}-\d{2}$/.test(prefillStart) ? prefillStart : defaultPlanStart(todayIso())),
    [prefillStart],
  );
  const initialPlanEnd = useMemo(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(prefillEnd)) return prefillEnd;
    const sy = getSchoolYearForDate(initialPlanStart);
    return sy?.end_date ?? `${nowYear + 1}-04-02`;
  }, [initialPlanStart, nowYear, prefillEnd]);
  const [academicYearStart, setAcademicYearStart] = useState(
    () => Number(initialPlanStart.slice(0, 4)) || nowYear,
  );
  const [startDate, setStartDate] = useState(initialPlanStart);
  const [endDate, setEndDate] = useState(initialPlanEnd);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FormFieldErrorKey, string>>>({});
  const [requirementCounts, setRequirementCounts] = useState<Record<RequirementKey, string>>({
    written_work: "1",
    performance_task: "1",
    exam: "1",
  });

  const [activeDays, setActiveDays] = useState<Set<WeekdayName>>(new Set());
  const [daySchedules, setDaySchedules] = useState<Record<WeekdayName, DaySchedule>>({
    monday: {
      instances: [],
    },
    tuesday: {
      instances: [],
    },
    wednesday: {
      instances: [],
    },
    thursday: {
      instances: [],
    },
    friday: {
      instances: [],
    },
    saturday: {
      instances: [],
    },
  });

  const [specialDates, setSpecialDates] = useState<SpecialDate[]>([]);
  const [examSchedules, setExamSchedules] = useState<ExamSchedule[]>([{ id: makeId(), dateText: "" }]);

  const selectedInstitution = useMemo(
    () => institutions.find((item) => item.school_id === selectedInstitutionId) ?? null,
    [institutions, selectedInstitutionId]
  );

  const selectedSubject = useMemo(
    () => subjects.find((item) => item.subject_id === selectedSubjectId) ?? null,
    [subjects, selectedSubjectId]
  );

  const selectedSection = useMemo(
    () => sections.find((item) => item.section_id === selectedSectionId) ?? null,
    [sections, selectedSectionId]
  );

  const autoPlanName = useMemo(() => {
    if (!selectedSubject || !selectedSection || !selectedInstitution) return "";
    return `${selectedSubject.title}_${selectedSection.name}_${selectedInstitution.name}`;
  }, [selectedInstitution, selectedSection, selectedSubject]);

  const selectableSubjects = useMemo(() => {
    if (!selectedInstitutionId) return subjects;
    return subjects.filter((item) => item.school_id === selectedInstitutionId);
  }, [subjects, selectedInstitutionId]);

  const selectableSections = useMemo(() => {
    if (!selectedInstitutionId) return sections;
    return sections.filter((item) => item.school_id === selectedInstitutionId);
  }, [sections, selectedInstitutionId]);

  const subjectPreview = useMemo(() => {
    if (!selectedSubject) return "";
    const source = selectedSubject.description?.trim() || selectedSubject.syllabus?.trim() || "";
    if (!source) return "No subject content available yet.";
    return source;
  }, [selectedSubject]);

  const unitGroups = useMemo<UnitGroup[]>(() => {
    const byKey = new Map<string, UnitGroup>();
    for (const chapter of chapters) {
      const key = chapter.unit_id ?? "ungrouped";
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          title:
            chapter.unit_id !== null
              ? `Unit ${chapter.unit_sequence_no ?? "-"}: ${chapter.unit_title ?? "Untitled Unit"}`
              : "Ungrouped",
          chapters: [],
        });
      }
      byKey.get(key)?.chapters.push(chapter);
    }

    return Array.from(byKey.values()).map((group) => ({
      ...group,
      chapters: [...group.chapters].sort((a, b) => a.sequence_no - b.sequence_no),
    }));
  }, [chapters]);

  const selectedSubjectOutline = useMemo(() => {
    return unitGroups
      .map((group) => {
        const pickedChapters = group.chapters
          .map((chapter) => {
            const chapterPicked = selectedChapterIds.has(chapter.chapter_id);
            const pickedLessons = chapter.lessons.filter((lesson) => selectedLessonIds.has(lesson.lesson_id));
            if (!chapterPicked && pickedLessons.length === 0) return null;
            return {
              chapter,
              pickedLessons,
            };
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row));

        if (pickedChapters.length === 0) return null;
        return {
          group,
          pickedChapters,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  }, [unitGroups, selectedChapterIds, selectedLessonIds]);

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("No signed-in user found.");

      const { data: userSubjects, error: subjectsError } = await supabase
        .from("user_subjects")
        .select("subject:subjects(subject_id, school_id, code, title, academic_year, description, syllabus)")
        .eq("user_id", user.id);
      if (subjectsError) throw subjectsError;

      const mappedSubjects: SubjectItem[] = (userSubjects ?? [])
        .map((row: any) => {
          const subjectRaw = row?.subject;
          const subject = Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw;
          if (!subject?.subject_id || !subject?.title || !subject?.code || !subject?.school_id) return null;
          return {
            subject_id: String(subject.subject_id),
            school_id: String(subject.school_id),
            code: String(subject.code),
            title: String(subject.title),
            academic_year: subject?.academic_year ? String(subject.academic_year) : null,
            description: subject?.description ? String(subject.description) : null,
            syllabus: subject?.syllabus ? String(subject.syllabus) : null,
          } satisfies SubjectItem;
        })
        .filter((item: SubjectItem | null): item is SubjectItem => Boolean(item))
        .sort((a, b) => `${a.code} ${a.title}`.localeCompare(`${b.code} ${b.title}`));

      const { data: userSchools, error: schoolsError } = await supabase
        .from("user_schools")
        .select("school_id")
        .eq("user_id", user.id);
      if (schoolsError) throw schoolsError;

      const schoolIds = (userSchools ?? []).map((row: any) => String(row.school_id)).filter(Boolean);
      let mappedSections: SectionItem[] = [];
      let mappedInstitutions: InstitutionItem[] = [];

      if (schoolIds.length > 0) {
        const [{ data: sectionRows, error: sectionsError }, { data: schoolRows, error: schoolRowsError }] = await Promise.all([
          supabase
            .from("sections")
            .select("section_id, school_id, name, grade_level")
            .in("school_id", schoolIds)
            .order("name", { ascending: true }),
          supabase.from("schools").select("school_id, name").in("school_id", schoolIds).order("name", { ascending: true }),
        ]);
        if (sectionsError) throw sectionsError;
        if (schoolRowsError) throw schoolRowsError;

        mappedSections = (sectionRows ?? []).map((row: any) => ({
          section_id: String(row.section_id),
          school_id: String(row.school_id),
          name: String(row.name),
          grade_level: row?.grade_level ? String(row.grade_level) : null,
        }));

        mappedInstitutions = (schoolRows ?? []).map((row: any) => ({
          school_id: String(row.school_id),
          name: String(row.name),
        }));
      }

      setSubjects(mappedSubjects);
      setSections(mappedSections);
      setInstitutions(mappedInstitutions);

      setSelectedInstitutionId((prev) => {
        if (prev && mappedInstitutions.some((s) => s.school_id === prev)) return prev;
        return mappedInstitutions[0]?.school_id ?? "";
      });
    } catch (err: any) {
      Alert.alert("Unable to load lesson plan form", err?.message ?? "Please try again.");
      setSubjects([]);
      setSections([]);
      setInstitutions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadChapters = useCallback(async (subjectId: string, options?: { openModal?: boolean; autoSelectAll?: boolean }) => {
    if (!subjectId) {
      setChapters([]);
      setSelectedChapterIds(new Set());
      setSelectedLessonIds(new Set());
      return;
    }

    try {
      const { data, error } = await supabase
        .from("chapters")
        .select(
          "chapter_id, title, sequence_no, unit:units(unit_id, title, sequence_no), lessons(lesson_id, chapter_id, title, sequence_no, content, learning_objectives, estimated_minutes, complexity_score)"
        )
        .eq("subject_id", subjectId)
        .order("sequence_no", { ascending: true });
      if (error) throw error;

      const mapped: ChapterOption[] = (data ?? []).map((row: any) => ({
        chapter_id: String(row.chapter_id),
        title: String(row.title),
        sequence_no: Number(row.sequence_no ?? 0),
        unit_id: row?.unit?.unit_id ? String(row.unit.unit_id) : null,
        unit_title: row?.unit?.title ? String(row.unit.title) : null,
        unit_sequence_no: typeof row?.unit?.sequence_no === "number" ? Number(row.unit.sequence_no) : null,
        lessons: (row?.lessons ?? [])
          .map((lesson: any) => ({
            lesson_id: String(lesson.lesson_id),
            chapter_id: String(lesson.chapter_id),
            title: String(lesson.title),
            sequence_no: Number(lesson.sequence_no ?? 0),
            content: lesson?.content ? String(lesson.content) : null,
            learning_objectives: lesson?.learning_objectives ? String(lesson.learning_objectives) : null,
            estimated_minutes:
              typeof lesson?.estimated_minutes === "number" ? Number(lesson.estimated_minutes) : null,
            complexity_score:
              typeof lesson?.complexity_score === "number" ? Number(lesson.complexity_score) : null,
          }))
          .sort((a: LessonOption, b: LessonOption) => a.sequence_no - b.sequence_no),
      }));

      setChapters(mapped);
      if (options?.autoSelectAll ?? true) {
        setSelectedChapterIds(new Set(mapped.map((item) => item.chapter_id)));
        setSelectedLessonIds(new Set(mapped.flatMap((item) => item.lessons.map((lesson) => lesson.lesson_id))));
      }
      if (options?.openModal ?? true) {
        setChapterModalOpen(true);
      }
    } catch (err: any) {
      Alert.alert("Unable to load units/chapters", err?.message ?? "Please try again.");
      setChapters([]);
      setSelectedChapterIds(new Set());
      setSelectedLessonIds(new Set());
    }
  }, []);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (loading || !duplicateFromPlanId || hydratedDuplicateIdRef.current === duplicateFromPlanId) {
      return;
    }

    let cancelled = false;

    const hydrateDuplicate = async () => {
      try {
        const [{ data: planRow, error: planError }, { data: slotRows, error: slotsError }, { data: blockRows, error: blocksError }, { data: contentRows, error: contentError }] =
          await Promise.all([
            supabase
              .from("lesson_plans")
              .select("lesson_plan_id, academic_year, start_date, end_date, school_id, subject_id, section_id")
              .eq("lesson_plan_id", duplicateFromPlanId)
              .maybeSingle(),
            supabase
              .from("slots")
              .select("series_key, weekday, start_time, end_time, meeting_type, slot_number")
              .eq("lesson_plan_id", duplicateFromPlanId),
            supabase
              .from("blocks")
              .select("session_category, slot_id, metadata")
              .eq("lesson_plan_id", duplicateFromPlanId),
            supabase
              .from("plan_subject_content")
              .select("content_level, chapter_id, lesson_id")
              .eq("lesson_plan_id", duplicateFromPlanId),
          ]);

        if (planError) throw planError;
        if (slotsError) throw slotsError;
        if (blocksError) throw blocksError;
        if (contentError) throw contentError;
        if (!planRow) throw new Error("The source lesson plan could not be found.");

        const sourcePlan = planRow as DuplicatedPlanRow;
        const institutionExists = institutions.some((item) => item.school_id === sourcePlan.school_id);
        const subjectExists = subjects.some((item) => item.subject_id === sourcePlan.subject_id);
        const sectionExists = sections.some((item) => item.section_id === sourcePlan.section_id);

        if (!institutionExists || !subjectExists || !sectionExists) {
          throw new Error("Some source plan references are no longer available in your account.");
        }

        const sourceSlots = (slotRows ?? []) as DuplicatedSlotRow[];
        const sourceBlocks = (blockRows ?? []) as DuplicatedBlockRow[];
        const sourceContent = (contentRows ?? []) as DuplicatedContentRow[];

        const nextDaySchedules: Record<WeekdayName, DaySchedule> = {
          monday: { instances: [] },
          tuesday: { instances: [] },
          wednesday: { instances: [] },
          thursday: { instances: [] },
          friday: { instances: [] },
          saturday: { instances: [] },
        };

        const seenSeriesKeys = new Set<string>();
        for (const row of sourceSlots) {
          const dayKey = String(row.weekday ?? "").toLowerCase();
          const seriesKey = String(row.series_key ?? "");
          if (!DAY_OPTIONS.some((day) => day.key === dayKey)) continue;
          if (seriesKey && seenSeriesKeys.has(seriesKey)) continue;
          if (seriesKey) seenSeriesKeys.add(seriesKey);

          const normalizedDay = dayKey as WeekdayName;
          const room = row.meeting_type === "laboratory" ? "laboratory" : "lecture";
          nextDaySchedules[normalizedDay].instances.push({
            id: makeId(),
            room,
            start: sqlTimeToDisplay(row.start_time),
            end: sqlTimeToDisplay(row.end_time),
          });
        }

        for (const day of DAY_OPTIONS) {
          nextDaySchedules[day.key].instances.sort((a, b) => {
            const startCompare = (toSqlTime(a.start) ?? "").localeCompare(toSqlTime(b.start) ?? "");
            if (startCompare !== 0) return startCompare;
            return (toSqlTime(a.end) ?? "").localeCompare(toSqlTime(b.end) ?? "");
          });
        }

        const selectedDays = new Set(
          DAY_OPTIONS.filter((day) => nextDaySchedules[day.key].instances.length > 0).map((day) => day.key)
        );

        const writtenWorkCount = sourceBlocks.filter((row) => row.session_category === "written_work").length;
        const performanceTaskCount = sourceBlocks.filter((row) => row.session_category === "performance_task").length;
        const examRows = sourceBlocks
          .filter((row) => row.session_category === "exam")
          .map((row) => ({
            scheduled_date:
              typeof row.metadata?.preferredDate === "string"
                ? String(row.metadata.preferredDate)
                : null,
          }))
          .sort((a, b) => (a.scheduled_date ?? "9999-99-99").localeCompare(b.scheduled_date ?? "9999-99-99"));

        const chapterIds = new Set(
          sourceContent
            .filter((row) => row.content_level === "chapter" && row.chapter_id)
            .map((row) => String(row.chapter_id))
        );
        const lessonIds = new Set(
          sourceContent
            .filter((row) => row.content_level === "lesson" && row.lesson_id)
            .map((row) => String(row.lesson_id))
        );

        await loadChapters(sourcePlan.subject_id, { openModal: false, autoSelectAll: false });
        if (cancelled) return;

        setSelectedInstitutionId(sourcePlan.school_id);
        setSelectedSubjectId(sourcePlan.subject_id);
        setSelectedSectionId(sourcePlan.section_id);
        setAcademicYearStart(parseAcademicStartYear(sourcePlan.academic_year) ?? new Date(`${sourcePlan.start_date}T00:00:00`).getFullYear());
        setStartDate(sourcePlan.start_date);
        setEndDate(sourcePlan.end_date);
        setRequirementCounts({
          written_work: String(Math.max(1, writtenWorkCount || 1)),
          performance_task: String(Math.max(1, performanceTaskCount || 1)),
          exam: String(Math.max(1, examRows.length || 1)),
        });
        setActiveDays(selectedDays);
        setDaySchedules(nextDaySchedules);
        setSelectedChapterIds(chapterIds);
        setSelectedLessonIds(lessonIds);
        setExamSchedules(
          examRows.length > 0
            ? examRows.map((row) => ({ id: makeId(), dateText: row.scheduled_date ?? "" }))
            : [{ id: makeId(), dateText: "" }]
        );
        setSpecialDates([]);
        hydratedDuplicateIdRef.current = duplicateFromPlanId;
      } catch (err: any) {
        if (cancelled) return;
        Alert.alert("Could not duplicate lesson plan", err?.message ?? "Please try again.");
      }
    };

    void hydrateDuplicate();

    return () => {
      cancelled = true;
    };
  }, [duplicateFromPlanId, institutions, loadChapters, loading, sections, subjects]);

  useEffect(() => {
    const examCount = Math.max(1, Number(requirementCounts.exam || "1"));
    setExamSchedules((prev) => {
      if (prev.length === examCount) return prev;

      return Array.from({ length: examCount }, (_, index) => prev[index] ?? { id: makeId(), dateText: "" });
    });
  }, [requirementCounts.exam]);

  const { refreshing, onRefresh } = usePullToRefresh(loadBase);
  const animateIn = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

  const clearFieldError = (key: FormFieldErrorKey) => {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const toggleDay = (day: WeekdayName) => {
    animateIn();
    clearFieldError("schedule");
    setActiveDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const setInstanceField = (day: WeekdayName, instanceId: string, field: "start" | "end", value: string) => {
    setDaySchedules((prev) => ({
      ...prev,
      [day]: {
        instances: prev[day].instances.map((item) => (item.id === instanceId ? { ...item, [field]: value } : item)),
      },
    }));
  };

  const setInstanceRoom = (day: WeekdayName, instanceId: string, room: RoomType) => {
    animateIn();
    setDaySchedules((prev) => ({
      ...prev,
      [day]: {
        instances: prev[day].instances.map((item) => (item.id === instanceId ? { ...item, room } : item)),
      },
    }));
  };

  const addInstance = (day: WeekdayName) => {
    animateIn();
    clearFieldError("schedule");
    setDaySchedules((prev) => {
      const current = prev[day];
      return {
        ...prev,
        [day]: {
          instances: [...current.instances, makeInstance(current.instances.length % 2 === 0 ? "lecture" : "laboratory", "1:00 PM", "3:00 PM")],
        },
      };
    });
  };

  const removeInstance = (day: WeekdayName, instanceId: string) => {
    animateIn();
    clearFieldError("schedule");
    setDaySchedules((prev) => {
      const remaining = prev[day].instances.filter((item) => item.id !== instanceId);
      return {
        ...prev,
        [day]: {
          instances: remaining.length > 0 ? remaining : [makeInstance()],
        },
      };
    });
  };

  const duplicateInstance = (day: WeekdayName, instanceId: string) => {
    animateIn();
    setDaySchedules((prev) => {
      const current = prev[day];
      const index = current.instances.findIndex((item) => item.id === instanceId);
      if (index === -1) return prev;

      const source = current.instances[index];
      const duplicated: ClassInstance = {
        ...source,
        id: makeId(),
      };

      const nextInstances = [...current.instances];
      nextInstances.splice(index + 1, 0, duplicated);

      return {
        ...prev,
        [day]: {
          instances: nextInstances,
        },
      };
    });
  };

  const openTimePicker = (target: TimeTarget) => {
    const schedule = daySchedules[target.day];
    const instance = schedule.instances.find((row) => row.id === target.instanceId);
    if (!instance) return;

    const current = parseDisplayTime(instance[target.field]);
    setPickerHour(current.hour);
    setPickerMinute(current.minute);
    setPickerMeridiem(current.meridiem);
    setTimeTarget(target);
    setTimePickerOpen(true);
  };

  const applyPickedTime = () => {
    if (!timeTarget) return;
    const value = formatDisplayTime(pickerHour, pickerMinute, pickerMeridiem);
    setInstanceField(timeTarget.day, timeTarget.instanceId, timeTarget.field, value);
    clearFieldError("schedule");
    setTimePickerOpen(false);
    setTimeTarget(null);
  };

  const setRequirementCount = (key: RequirementKey, value: string) => {
    const sanitized = value.replace(/[^0-9]/g, "");
    setRequirementCounts((prev) => ({ ...prev, [key]: sanitized }));
  };

  const adjustRequirementCount = (key: RequirementKey, delta: number) => {
    const current = Number(requirementCounts[key] || "0");
    const next = Math.max(1, Math.min(99, (Number.isFinite(current) ? current : 0) + delta));
    setRequirementCount(key, String(next));
    clearFieldError("requirements");
    if (key === "exam") clearFieldError("examDates");
  };

  const toggleChapter = (chapterId: string) => {
    animateIn();
    clearFieldError("content");
    const chapter = chapters.find((row) => row.chapter_id === chapterId);
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      const chapterWillBeSelected = !next.has(chapterId);
      if (chapterWillBeSelected) next.add(chapterId);
      else next.delete(chapterId);

      if (chapter) {
        setSelectedLessonIds((lessonPrev) => {
          const lessonNext = new Set(lessonPrev);
          for (const lesson of chapter.lessons) {
            if (chapterWillBeSelected) lessonNext.add(lesson.lesson_id);
            else lessonNext.delete(lesson.lesson_id);
          }
          return lessonNext;
        });
      }

      return next;
    });
  };

  const toggleLesson = (chapterId: string, lessonId: string) => {
    animateIn();
    clearFieldError("content");
    const chapter = chapters.find((row) => row.chapter_id === chapterId);
    if (!chapter) return;

    setSelectedLessonIds((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);

      setSelectedChapterIds((chapterPrev) => {
        const chapterNext = new Set(chapterPrev);
        const hasAnySelectedLesson = chapter.lessons.some((row) => next.has(row.lesson_id));
        if (hasAnySelectedLesson) chapterNext.add(chapterId);
        else chapterNext.delete(chapterId);
        return chapterNext;
      });

      return next;
    });
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/create");
  };

  const addSpecialDateRow = () => {
    animateIn();
    setSpecialDates((prev) => [...prev, { id: makeId(), dateText: "", reason: "" }]);
  };

  const setSpecialDateField = (id: string, field: "dateText" | "reason", value: string) => {
    setSpecialDates((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const setExamScheduleField = (id: string, value: string) => {
    setExamSchedules((prev) => prev.map((row) => (row.id === id ? { ...row, dateText: value } : row)));
  };

  const addExamScheduleRow = () => {
    animateIn();
    clearFieldError("examDates");
    setExamSchedules((prev) => {
      const next = [...prev, { id: makeId(), dateText: "" }];
      setRequirementCounts((counts) => ({ ...counts, exam: String(next.length) }));
      return next;
    });
  };

  const removeExamScheduleRow = (id: string) => {
    animateIn();
    clearFieldError("examDates");
    setExamSchedules((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((row) => row.id !== id);
      setRequirementCounts((counts) => ({ ...counts, exam: String(next.length) }));
      return next;
    });
  };

  const removeSpecialDateRow = (id: string) => {
    animateIn();
    setSpecialDates((prev) => prev.filter((row) => row.id !== id));
  };

  const openDatePicker = (target: DateTarget, currentValue: string) => {
    const normalized = normalizeDateInput(currentValue);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? new Date(`${normalized}T00:00:00`) : new Date();
    const safe = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

    setDatePickerYear(safe.getFullYear());
    setDatePickerMonth(safe.getMonth() + 1);
    setDatePickerDay(safe.getDate());
    setDateTarget(target);
    setDatePickerOpen(true);
  };

  const applyPickedDate = () => {
    if (!dateTarget) return;
    const daysInMonth = getDaysInMonth(datePickerYear, datePickerMonth);
    const safeDay = Math.min(datePickerDay, daysInMonth);
    const iso = `${datePickerYear}-${String(datePickerMonth).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;

    if (dateTarget.type === "duration") {
      if (dateTarget.field === "start") {
        setStartDate(iso);
        setFieldErrors((prev) => ({ ...prev, startDate: undefined }));
      }
      if (dateTarget.field === "end") {
        setEndDate(iso);
        setFieldErrors((prev) => ({ ...prev, endDate: undefined }));
      }
    } else if (dateTarget.type === "exam") {
      setExamScheduleField(dateTarget.id, iso);
      clearFieldError("examDates");
    } else {
      setSpecialDateField(dateTarget.id, "dateText", iso);
    }

    setDatePickerOpen(false);
    setDateTarget(null);
  };

  const handlePickInstitution = (schoolId: string) => {
    setSelectedInstitutionId(schoolId);
    setFieldErrors((prev) => ({ ...prev, institution: undefined }));
    setInstitutionMenuOpen(false);

    if (selectedSubject && selectedSubject.school_id !== schoolId) {
      setSelectedSubjectId("");
      setChapters([]);
      setSelectedChapterIds(new Set());
      setSelectedLessonIds(new Set());
    }
    if (selectedSection && selectedSection.school_id !== schoolId) {
      setSelectedSectionId("");
    }
  };

  const handlePickSubject = async (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setFieldErrors((prev) => ({ ...prev, subject: undefined }));
    setSubjectMenuOpen(false);

    const subject = subjects.find((item) => item.subject_id === subjectId);
    if (subject?.school_id) setSelectedInstitutionId(subject.school_id);

    const parsedYear = parseAcademicStartYear(subject?.academic_year ?? null);
    if (parsedYear) setAcademicYearStart(parsedYear);

    await loadChapters(subjectId);
  };

  const requirementKeys = Object.keys(REQUIREMENT_LABEL) as RequirementKey[];
  const hasRequirementCounts = requirementKeys.every((key) => {
    const parsed = Number(requirementCounts[key] || "0");
    return Number.isFinite(parsed) && parsed > 0;
  });

  const validateRequiredFields = useCallback(() => {
    const errors: Partial<Record<FormFieldErrorKey, string>> = {};
    if (!selectedInstitution) errors.institution = "Institution is required.";
    if (!selectedSubject) errors.subject = "Subject is required.";
    if (!selectedSection) errors.section = "Section is required.";

    const normalizedStart = normalizeDateInput(startDate);
    const normalizedEnd = normalizeDateInput(endDate);
    const parsedStart = parseIsoDate(normalizedStart);
    const parsedEnd = parseIsoDate(normalizedEnd);

    if (!normalizedStart) errors.startDate = "Start date is required.";
    else if (!parsedStart) errors.startDate = "Start date is invalid.";

    if (!normalizedEnd) errors.endDate = "End date is required.";
    else if (!parsedEnd) errors.endDate = "End date is invalid.";

    if (parsedStart && parsedEnd) {
      if (normalizedEnd < normalizedStart) {
        errors.endDate = "End date must be after start date.";
      } else if (parsedEnd > addMonths(parsedStart, 6)) {
        errors.endDate = "Duration must not exceed 6 months.";
      }
    }

    return errors;
  }, [endDate, selectedInstitution, selectedSection, selectedSubject, startDate]);

  const hasValidSchedule = activeDays.size > 0 && Array.from(activeDays).every((day) => {
    const schedule = daySchedules[day];
    return schedule.instances.length > 0 && schedule.instances.every((instance) => hasValidTimeRange(instance.start, instance.end));
  });

  const hasSelectedSubjectContent = selectedLessonIds.size > 0;

  // The same draft-overlap check that guards the save also gates the schedule
  // step, so overlapping times surface while the teacher is still editing them.
  const draftConflict = useMemo(
    () => findDraftScheduleOverlap(collectDraftRecurringSlots({ activeDays, daySchedules })),
    [activeDays, daySchedules]
  );

  const scheduleSummary = useMemo(() => {
    const parts: string[] = [];
    for (const day of DAY_OPTIONS) {
      if (!activeDays.has(day.key)) continue;
      for (const instance of daySchedules[day.key].instances) {
        const start = (toSqlTime(instance.start) ?? "").slice(0, 5).replace(/^0/, "");
        const end = (toSqlTime(instance.end) ?? "").slice(0, 5).replace(/^0/, "");
        const range = start && end ? `${start}–${end}` : `${instance.start}–${instance.end}`;
        parts.push(`${day.short} ${range}${instance.room === "laboratory" ? " (Lab)" : ""}`);
      }
    }
    return parts.join(" · ");
  }, [activeDays, daySchedules]);

  // ---- Per-step validation gates ----------------------------------------
  // Each gate reuses the field-keyed error mechanism: run the rules for the
  // step, write them into fieldErrors (which drives the inline red borders
  // and captions), and block advancing while any remain.

  const validateWhenStep = useCallback(() => {
    const all = validateRequiredFields();
    const errors: Partial<Record<FormFieldErrorKey, string>> = {};
    if (all.institution) errors.institution = all.institution;
    if (all.startDate) errors.startDate = all.startDate;
    if (all.endDate) errors.endDate = all.endDate;
    return errors;
  }, [validateRequiredFields]);

  const validateSubjectStep = useCallback(() => {
    const all = validateRequiredFields();
    const errors: Partial<Record<FormFieldErrorKey, string>> = {};
    if (all.subject) errors.subject = all.subject;
    if (all.section) errors.section = all.section;
    if (!hasSelectedSubjectContent) {
      errors.content = "Select at least one lesson from the subject content picker.";
    }
    return errors;
  }, [hasSelectedSubjectContent, validateRequiredFields]);

  const validateScheduleStep = useCallback(() => {
    const errors: Partial<Record<FormFieldErrorKey, string>> = {};
    if (!hasValidSchedule) {
      errors.schedule = "Set valid class times for each selected day, with end time after start time.";
    }
    return errors;
  }, [hasValidSchedule]);

  const validateRequirementsStep = useCallback(() => {
    const errors: Partial<Record<FormFieldErrorKey, string>> = {};
    if (!hasRequirementCounts) {
      errors.requirements = "Fill in Written Work, Performance Task, and Exam counts.";
    }

    const normalizedStart = normalizeDateInput(startDate);
    const normalizedEnd = normalizeDateInput(endDate);
    const examDates = examSchedules.map((row) => normalizeDateInput(row.dateText));
    if (examDates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
      errors.examDates = "Pick a valid date for every exam.";
    } else if (new Set(examDates).size !== examDates.length) {
      errors.examDates = "Each exam date must be different.";
    } else if (examDates.some((date) => date < normalizedStart || date > normalizedEnd)) {
      errors.examDates = "Each exam date must be within the lesson plan duration.";
    }
    return errors;
  }, [endDate, examSchedules, hasRequirementCounts, startDate]);

  const STEP_ERROR_KEYS: FormFieldErrorKey[][] = [
    ["institution", "startDate", "endDate"],
    ["subject", "section", "content"],
    ["schedule"],
    ["requirements", "examDates"],
  ];

  const stepValidators = [validateWhenStep, validateSubjectStep, validateScheduleStep, validateRequirementsStep];

  const steps: StepDef[] = useMemo(
    () => [
      { key: "when", title: "When and where?", subtitle: "Set the academic year, duration, and institution." },
      { key: "subject", title: "Which subject?", subtitle: "Pick the subject, its content, and the section." },
      { key: "schedule", title: "Your weekly schedule", subtitle: "Choose class days and the time of each meeting." },
      { key: "requirements", title: "Requirements & exams", subtitle: "Set assessment counts, exam dates, and blocked dates." },
      {
        key: "review",
        title: "Review & generate",
        subtitle: replacePlanId
          ? "This rebuilds the plan and removes the old version."
          : "Double-check everything before generating the plan.",
      },
    ],
    [replacePlanId]
  );

  const handleStepBack = () => {
    if (stepIndex === 0) {
      handleBack();
      return;
    }
    setStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleStepNext = () => {
    if (stepIndex < stepValidators.length) {
      const errors = stepValidators[stepIndex]();
      setFieldErrors((prev) => {
        const next = { ...prev };
        for (const key of STEP_ERROR_KEYS[stepIndex]) next[key] = undefined;
        return { ...next, ...errors };
      });
      if (Object.keys(errors).length > 0) return;
      // The draft-conflict banner is already visible inline on the schedule
      // step; block advancing until the overlap is resolved.
      if (stepIndex === 2 && draftConflict) return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStepIndex((prev) => Math.min(steps.length - 1, prev + 1));
  };

  const handleCreatePlan = async () => {
    if (createInFlightRef.current || saving) {
      return;
    }
    setServerConflict(null);
    const nextFieldErrors = validateRequiredFields();
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      const durationError = nextFieldErrors.startDate ?? nextFieldErrors.endDate;
      if (durationError) {
        Alert.alert("Invalid lesson plan duration", durationError);
      } else {
        Alert.alert("Missing required fields", "Complete the highlighted fields before creating the lesson plan.");
      }
      return;
    }

    const normalizedStart = normalizeDateInput(startDate);
    const normalizedEnd = normalizeDateInput(endDate);
    const institution = selectedInstitution;
    const subject = selectedSubject;
    const section = selectedSection;
    if (!institution || !subject || !section) {
      Alert.alert("Missing required fields", "Complete the highlighted fields before creating the lesson plan.");
      return;
    }
    if (!hasValidSchedule) {
      Alert.alert("Schedule required", "Set valid class times for each selected day, with end time after start time.");
      return;
    }

    const draftRecurringSlots = collectDraftRecurringSlots({ activeDays, daySchedules });
    const draftScheduleConflict = findDraftScheduleOverlap(draftRecurringSlots);
    if (draftScheduleConflict) {
      Alert.alert("Schedule conflict", draftScheduleConflict.message);
      return;
    }

    if (!hasRequirementCounts) {
      Alert.alert("Requirements required", "Fill in Written Work, Performance Task, and Exam counts.");
      return;
    }
    if (examSchedules.some((row) => !/^\d{4}-\d{2}-\d{2}$/.test(normalizeDateInput(row.dateText)))) {
      Alert.alert("Exam dates required", "Pick a valid date for every exam.");
      return;
    }
    const normalizedStartDate = normalizeDateInput(startDate);
    const normalizedEndDate = normalizeDateInput(endDate);
    const examDates = examSchedules.map((row) => normalizeDateInput(row.dateText));
    if (new Set(examDates).size !== examDates.length) {
      Alert.alert("Duplicate exam dates", "Each exam date must be different.");
      return;
    }
    if (examDates.some((date) => date < normalizedStartDate || date > normalizedEndDate)) {
      Alert.alert("Exam dates out of range", "Each exam date must be within the lesson plan duration.");
      return;
    }
    if (!hasSelectedSubjectContent) {
      Alert.alert("Subject content required", "Select at least one lesson from the subject content picker.");
      return;
    }

    createInFlightRef.current = true;
    setSaving(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("No signed-in user found.");

      const { data: duplicateScopedPlans, error: duplicateScopedPlansError } = await supabase
        .from("lesson_plans")
        .select("lesson_plan_id, title, start_date, end_date")
        .eq("user_id", user.id)
        .eq("school_id", institution.school_id)
        .eq("subject_id", subject.subject_id)
        .eq("section_id", section.section_id)
        .lte("start_date", normalizedEnd)
        .gte("end_date", normalizedStart);
      if (duplicateScopedPlansError) throw duplicateScopedPlansError;

      const conflictingScopedPlans = (duplicateScopedPlans ?? []).filter(
        (row: any) => String(row?.lesson_plan_id ?? "") !== replacePlanId
      );
      if (conflictingScopedPlans.length > 0) {
        const existingPlan = conflictingScopedPlans[0] as {
          title?: string | null;
          start_date?: string | null;
          end_date?: string | null;
        };
        Alert.alert(
          "Duplicate lesson plan",
          `A lesson plan for this institution, subject, and section already exists from ${String(existingPlan.start_date ?? normalizedStart)} to ${String(existingPlan.end_date ?? normalizedEnd)}.`
        );
        return;
      }

      const { data: overlappingPlans, error: overlappingPlansError } = await supabase
        .from("lesson_plans")
        .select("lesson_plan_id, title, start_date, end_date")
        .eq("user_id", user.id)
        .lte("start_date", normalizedEnd)
        .gte("end_date", normalizedStart);
      if (overlappingPlansError) throw overlappingPlansError;

      const overlappingPlanIds = (overlappingPlans ?? [])
        .map((row: any) => String(row.lesson_plan_id))
        .filter((id) => Boolean(id) && id !== replacePlanId);
      if (overlappingPlanIds.length > 0) {
        const titleByPlanId = new Map(
          (overlappingPlans ?? []).map((row: any) => [
            String(row.lesson_plan_id),
            {
              title: String(row.title ?? "Untitled Plan"),
              start_date: String(row.start_date),
              end_date: String(row.end_date),
            },
          ])
        );

        const { data: existingSlots, error: existingSlotsError } = await supabase
          .from("slots")
          .select("lesson_plan_id, weekday, start_time, end_time, series_key")
          .in("lesson_plan_id", overlappingPlanIds);
        if (existingSlotsError) throw existingSlotsError;

        const seenExistingSeries = new Set<string>();
        const existingRecurringRows: ExistingRecurringClass[] = (existingSlots ?? [])
          .map((row: any) => {
            const planId = String(row.lesson_plan_id ?? "");
            const meta = titleByPlanId.get(planId);
            const day = row?.weekday ? String(row.weekday).toLowerCase() : "";
            const start = row?.start_time ? String(row.start_time) : "";
            const end = row?.end_time ? String(row.end_time) : "";
            const seriesKey = String(row?.series_key ?? `${planId}_${day}_${start}_${end}`);
            if (
              !meta ||
              !DAY_OPTIONS.some((item) => item.key === day) ||
              !start ||
              !end
            ) {
              return null;
            }
            if (seenExistingSeries.has(seriesKey)) return null;
            seenExistingSeries.add(seriesKey);

            return {
              lesson_plan_id: planId,
              title: meta.title,
              start_date: meta.start_date,
              end_date: meta.end_date,
              day: day as WeekdayName,
              start_time: start,
              end_time: end,
            };
          })
          .filter((row: ExistingRecurringClass | null): row is ExistingRecurringClass => Boolean(row));

        const existingConflict = findExistingScheduleOverlap({
          slots: draftRecurringSlots,
          existingRows: existingRecurringRows,
          nextPlanStart: normalizedStart,
          nextPlanEnd: normalizedEnd,
        });
        if (existingConflict) {
          setServerConflict(existingConflict.message);
          return;
        }
      }

      const title = autoPlanName.trim();
      const yearText = formatAcademicYear(academicYearStart).trim() || buildAcademicYearFallback(normalizedStart, normalizedEnd);

      const { data: planRow, error: planError } = await supabase.rpc("create_lesson_plan", {
        p_school_id:            institution.school_id,
        p_subject_id:           subject.subject_id,
        p_section_id:           section.section_id,
        p_title:                title,
        p_start_date:           normalizedStart,
        p_end_date:             normalizedEnd,
        p_academic_year:        yearText,
        p_notes:                null,
        p_effective_start_date: onboardingEffectiveStart || null,
        p_progress_anchor:      onboardingProgressAnchor ?? null,
      });
      if (planError) {
        if (planError.message?.includes("quota_exceeded")) {
          setPaywallQuotaType("lesson_plan");
          setPaywallVisible(true);
          return;
        }
        throw planError;
      }

      const lessonPlanId = String((planRow as { lesson_plan_id: string }).lesson_plan_id);

      const selectedChapters = chapters
        .filter((item) => selectedChapterIds.has(item.chapter_id))
        .sort((a, b) => a.sequence_no - b.sequence_no);

      const selectedLessons = chapters
        .flatMap((chapter) =>
          chapter.lessons
            .filter((lesson) => selectedLessonIds.has(lesson.lesson_id))
            .map((lesson) => ({ chapter, lesson }))
        )
        .sort((a, b) => {
          if (a.chapter.sequence_no !== b.chapter.sequence_no) {
            return a.chapter.sequence_no - b.chapter.sequence_no;
          }
          return a.lesson.sequence_no - b.lesson.sequence_no;
        });

      const meetingPatterns = buildMeetingPatterns(activeDays, daySchedules);

      const runtimeSlots = createSlots({
        lesson_plan: {
          lesson_plan_id: lessonPlanId,
          public_id: "",
          user_id: user.id,
          school_id: institution.school_id,
          subject_id: subject.subject_id,
          section_id: section.section_id,
          title,
          academic_year: yearText,
          start_date: normalizedStart,
          end_date: normalizedEnd,
          effective_start_date: null,
          progress_anchor: null,
          status: "draft",
          notes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        meeting_patterns: meetingPatterns,
        school_calendar_events: buildManualBlackoutEvents(specialDates, {
          school_id: institution.school_id,
          subject_id: subject.subject_id,
          section_id: section.section_id,
        }),
        delays: [],
        existing_slots: [],
        rules: buildSlotRules(),
      });
      const generatedSlots = runtimeSlots
        .filter((slot) => !slot.blackout)
        .map((slot) => ({
          id: slot.series_key,
          date: slot.slot_date,
          startTime: slot.start_time.slice(0, 5),
          endTime: slot.end_time.slice(0, 5),
          sessionType: slot.meeting_type ?? "lecture",
          slotNumber: slot.slot_number,
        }));

      for (const examSched of examSchedules) {
        const isoDate = normalizeDateInput(examSched.dateText);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) continue;
        if (generatedSlots.some((s) => s.date === isoDate)) continue;
        generatedSlots.push({
          id: `exam_slot_${isoDate}`,
          date: isoDate,
          startTime: "08:00",
          endTime: "11:00",
          sessionType: "lecture" as const,
          slotNumber: 9000,
        });
      }

      const tocUnits = buildTocUnitsFromSelections(lessonPlanId, selectedLessons, selectedChapters);
      const teacherRules = buildTeacherRulesFromCounts(requirementCounts);
      const examTemplates = examSchedules.map((row, index) => {
        const examDefinition = getExamDefinition(index, examSchedules.length);
        const normalizedExamDate = normalizeDateInput(row.dateText);
        return {
          id: `exam_template_${index + 1}`,
          title: examDefinition.title,
          estimatedMinutes: 90,
          subcategory: examDefinition.subcategory,
          preferredDate: /^\d{4}-\d{2}-\d{2}$/.test(normalizedExamDate) ? normalizedExamDate : null,
          required: true,
        };
      });

      const generatedBlocks = buildBlocks({
        courseId: lessonPlanId,
        tocUnits,
        teacherRules,
        examBlockTemplates: examTemplates,
        slots: generatedSlots,
        initialDelayDates: [],
      });
      const placedPlan = placeBlocks({
        slots: generatedSlots,
        blocks: generatedBlocks,
      });
      const slotRows = placedPlan.slots.map((slot) => {
        const isExamOnlySlot = slot.slotNumber === 9000;
        const weekday = DAY_OPTIONS.find((day) => {
          const dayIndex = DAY_OPTIONS.findIndex((item) => item.key === day.key) + 1;
          return dayIndex === new Date(`${slot.date}T00:00:00`).getDay();
        })?.key ?? "monday";

        if (isExamOnlySlot) {
          return {
            lesson_plan_id: lessonPlanId,
            title: null,
            slot_date: slot.date,
            weekday,
            start_time: `${slot.startTime}:00`,
            end_time: `${slot.endTime}:00`,
            meeting_type: null,
            slot_number: 9000,
            series_key: `exam_date_${slot.date}`,
            is_locked: false,
          };
        }

        const sourceSchedule = meetingPatterns.find(
          (candidate) =>
            candidate.weekday === weekday &&
            candidate.start_time.slice(0, 5) === slot.startTime &&
            candidate.end_time.slice(0, 5) === slot.endTime &&
            (candidate.meeting_type ?? "lecture") === slot.sessionType
        );
        const seriesKey =
          sourceSchedule?.series_key ?? `${slot.date}_${slot.startTime}_${slot.endTime}`;

        return {
          lesson_plan_id: lessonPlanId,
          title: null,
          slot_date: slot.date,
          weekday,
          start_time: `${slot.startTime}:00`,
          end_time: `${slot.endTime}:00`,
          meeting_type: slot.sessionType === "lecture" || slot.sessionType === "laboratory" ? slot.sessionType : null,
          slot_number: sourceSchedule?.slot_number ?? 1,
          series_key: seriesKey,
          is_locked: false,
        };
      });

      const persistedSlotIdByPlannerKey = new Map<string, string>();
      if (slotRows.length > 0) {
        const { data: insertedSlots, error: slotsError } = await supabase
          .from("slots")
          .insert(slotRows)
          .select("slot_id, slot_date, slot_number");
        if (slotsError) throw slotsError;

        for (const row of insertedSlots ?? []) {
          const slotDate = String((row as { slot_date: string }).slot_date);
          const slotNumber = Number((row as { slot_number: number }).slot_number ?? 1);
          const slotId = String((row as { slot_id: string }).slot_id);
          persistedSlotIdByPlannerKey.set(`${slotDate}__${slotNumber}`, slotId);
        }
      }

      const placementByBlockId = new Map(
        placedPlan.slots.flatMap((slot) =>
          slot.placements.map((placement, index) => [
            placement.blockId,
            {
              slotId: persistedSlotIdByPlannerKey.get(`${slot.date}__${slot.slotNumber ?? 1}`) ?? null,
              startTime: `${slot.startTime}:00`,
              endTime: `${slot.endTime}:00`,
              orderNo: index + 1,
            },
          ] as const)
        )
      );

      const lessonDetailsById = new Map(
        selectedLessons.map(({ chapter, lesson }) => [
          lesson.lesson_id,
          {
            lessonId: lesson.lesson_id,
            description:
              lesson.learning_objectives || lesson.content ||
              (chapter.unit_title ? `${chapter.unit_title} • Chapter ${chapter.sequence_no}` : `Chapter ${chapter.sequence_no}`),
          },
        ])
      );

      const blockRows = generatedBlocks.map((block) => {
        const lessonDetails =
          typeof block.sourceTocId === "string" ? lessonDetailsById.get(block.sourceTocId) ?? null : null;
        const normalizedSubcategory = normalizeBlockSubcategory(block.type, block.subcategory);
        const placement = placementByBlockId.get(block.id) ?? null;
        if (!placement?.startTime || !placement?.endTime) {
          throw new Error(`A scheduled time could not be resolved for block "${block.title}".`);
        }
        return {
          lesson_plan_id: lessonPlanId,
          slot_id: placement.slotId,
          root_block_id: null,
          lesson_id: lessonDetails?.lessonId ?? null,
          algorithm_block_key: block.id,
          block_key: block.id,
          title: block.title,
          description: lessonDetails?.description ?? null,
          session_category: block.type,
          session_subcategory: normalizedSubcategory,
          meeting_type:
            block.preferredSessionType === "lecture" || block.preferredSessionType === "laboratory"
              ? block.preferredSessionType
              : null,
          start_time: placement.startTime,
          end_time: placement.endTime,
          required: block.required,
          splittable: block.splittable,
          preferred_session_type: block.preferredSessionType,
          dependency_keys: block.dependencies,
          order_no: placement.orderNo ?? 1,
          is_locked: false,
          ww_subtype: block.type === "written_work" ? normalizedSubcategory : null,
          pt_subtype: block.type === "performance_task" ? normalizedSubcategory : null,
          metadata: block.metadata ?? {},
        };
      });

      if (blockRows.length > 0) {
        const { error: blocksError } = await supabase.from("blocks").insert(blockRows);
        if (blocksError) throw blocksError;
      }

      const subjectContentRows = selectedSubjectOutline
        .flatMap((unitGroup, unitIndex) => {
          const rows: any[] = [];
          rows.push({
            lesson_plan_id: lessonPlanId,
            subject_id: subject.subject_id,
            unit_id: unitGroup.group.key !== "ungrouped" ? unitGroup.group.key : null,
            content_level: "unit",
            sequence_no: unitIndex + 1,
            selected_title: unitGroup.group.title,
            selected_content: null,
          });

          unitGroup.pickedChapters.forEach((row, chapterIndex) => {
            rows.push({
              lesson_plan_id: lessonPlanId,
              subject_id: subject.subject_id,
              unit_id: row.chapter.unit_id,
              chapter_id: row.chapter.chapter_id,
              content_level: "chapter",
              sequence_no: chapterIndex + 1,
              selected_title: `Chapter ${row.chapter.sequence_no}: ${row.chapter.title}`,
              selected_content: null,
            });

            row.pickedLessons.forEach((lesson, lessonIndex) => {
              rows.push({
                lesson_plan_id: lessonPlanId,
                subject_id: subject.subject_id,
                unit_id: row.chapter.unit_id,
                chapter_id: row.chapter.chapter_id,
                lesson_id: lesson.lesson_id,
                content_level: "lesson",
                sequence_no: lessonIndex + 1,
                selected_title: lesson.title,
                selected_content: lesson.content ?? null,
                learning_objectives: lesson.learning_objectives,
                estimated_minutes: lesson.estimated_minutes,
              });
            });
          });
          return rows;
        })
        .filter((row) => row.selected_title || row.selected_content);

      if (subjectContentRows.length > 0) {
        const { error: contentError } = await supabase.from("plan_subject_content").insert(subjectContentRows);
        if (contentError) throw contentError;
      }

      const specialEvents = specialDates
        .map((row) => ({ ...row, isoDate: normalizeDateInput(row.dateText) }))
        .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.isoDate) && row.reason.trim());

      if (specialEvents.length > 0) {
        const { error: eventsError } = await supabase.from("school_calendar_events").insert(
          specialEvents.map((row) => ({
            school_id: institution.school_id,
            section_id: section.section_id,
            subject_id: subject.subject_id,
            event_type: "other",
            blackout_reason: "event",
            title: row.reason.trim(),
            description: row.reason.trim(),
            start_date: row.isoDate,
            end_date: row.isoDate,
            is_whole_day: true,
            created_by: user.id,
          }))
        );
        if (eventsError) throw eventsError;
      }

      if (replacePlanId && replacePlanId !== lessonPlanId) {
        const { error: replaceDeleteError } = await supabase
          .from("lesson_plans")
          .delete()
          .eq("lesson_plan_id", replacePlanId)
          .eq("user_id", user.id);
        if (replaceDeleteError) throw replaceDeleteError;
      }

      emitLessonPlanRefresh();
      Alert.alert(
        replacePlanId ? "Lesson plan recreated" : "Lesson plan created",
        replacePlanId
          ? "The plan was rebuilt from your inputs and the old version was removed."
          : "Your lesson plan was saved.",
        [{ text: "OK", onPress: () => router.push("/(tabs)/calendar") }]
      );
    } catch (err: any) {
      Alert.alert(
        replacePlanId ? "Could not recreate lesson plan" : "Could not create lesson plan",
        err?.message ?? "Please try again."
      );
    } finally {
      createInFlightRef.current = false;
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.tint} />
      </View>
    );
  }

  // ---- Step renderers -----------------------------------------------------

  const renderWhenStep = () => (
    <ScrollView
      contentContainerStyle={styles.stepContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
    >
      <SelectField
        label="Academic year"
        value={formatAcademicYear(academicYearStart)}
        placeholder="Pick academic year"
        onPress={() => {
          animateIn();
          setYearPickerOpen(true);
        }}
      />

      <View style={styles.dateRow}>
        <SelectField
          label="Start date"
          value={startDate ? formatIsoDisplay(startDate) : ""}
          placeholder="Pick date"
          error={fieldErrors.startDate}
          onPress={() => {
            animateIn();
            openDatePicker({ type: "duration", field: "start" }, startDate);
          }}
          containerStyle={styles.dateField}
        />
        <SelectField
          label="End date"
          value={endDate ? formatIsoDisplay(endDate) : ""}
          placeholder="Pick date"
          error={fieldErrors.endDate}
          onPress={() => {
            animateIn();
            openDatePicker({ type: "duration", field: "end" }, endDate);
          }}
          containerStyle={styles.dateField}
        />
      </View>

      <SelectField
        label="Institution"
        value={selectedInstitution?.name ?? ""}
        placeholder="Pick institution"
        error={fieldErrors.institution}
        onPress={() => {
          animateIn();
          setInstitutionMenuOpen((v) => !v);
        }}
      />
      {institutionMenuOpen ? (
        <View style={[styles.dropdown, { backgroundColor: c.card, borderColor: c.border }]}>
          {institutions.map((institution) => (
            <Pressable
              key={institution.school_id}
              accessibilityRole="button"
              accessibilityLabel={institution.name}
              style={[styles.dropdownItem, { borderBottomColor: c.hairline }]}
              onPress={() => handlePickInstitution(institution.school_id)}
            >
              <Text style={[Typography.body, { color: c.text }]}>{institution.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );

  const renderSubjectStep = () => (
    <ScrollView
      contentContainerStyle={styles.stepContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <SelectField
        label="Subject"
        value={selectedSubject ? `${selectedSubject.code} - ${selectedSubject.title}` : ""}
        placeholder="Pick subject"
        error={fieldErrors.subject}
        onPress={() => {
          animateIn();
          setSubjectMenuOpen((v) => !v);
        }}
      />
      {subjectMenuOpen ? (
        <View style={[styles.dropdown, { backgroundColor: c.card, borderColor: c.border }]}>
          {selectableSubjects.map((subject) => (
            <Pressable
              key={subject.subject_id}
              accessibilityRole="button"
              accessibilityLabel={`${subject.code} - ${subject.title}`}
              style={[styles.dropdownItem, { borderBottomColor: c.hairline }]}
              onPress={() => handlePickSubject(subject.subject_id)}
            >
              <Text style={[Typography.body, { color: c.text }]}>{subject.code} - {subject.title}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {selectedSubject ? (
        <View>
          <SectionHeader
            title="Subject content"
            actionLabel="Edit"
            onAction={() => {
              animateIn();
              setChapterModalOpen(true);
            }}
          />
          <View
            style={[
              styles.subjectPreviewBox,
              { backgroundColor: c.card, borderColor: fieldErrors.content ? c.danger : c.border },
            ]}
          >
            {selectedSubjectOutline.length > 0 ? (
              selectedSubjectOutline.map((unitGroup, unitIndex) => (
                <View key={unitGroup.group.key} style={styles.previewUnitBlock}>
                  <View style={[styles.tocRow, { borderBottomColor: c.hairline }]}>
                    <Text style={[styles.tocIndex, { color: c.mutedText }]}>{String(unitIndex + 1).padStart(2, "0")}</Text>
                    <Text style={[styles.tocText, { color: c.text }]}>{unitGroup.group.title}</Text>
                  </View>
                  {unitGroup.pickedChapters.map((row, chapterIndex) => (
                    <View key={row.chapter.chapter_id} style={styles.previewChapterBlock}>
                      <View style={[styles.tocRow, { borderBottomColor: c.hairline }]}>
                        <Text style={[styles.tocIndex, { color: c.mutedText }]}>{`${unitIndex + 1}.${chapterIndex + 1}`}</Text>
                        <Text style={[styles.tocText, { color: c.text }]}>
                          {`Chapter ${row.chapter.sequence_no}: ${row.chapter.title}`}
                        </Text>
                      </View>
                      {row.pickedLessons.map((lesson, lessonIndex) => (
                        <View key={lesson.lesson_id} style={styles.previewLessonBlock}>
                          <View style={[styles.tocRow, { borderBottomColor: c.hairline }]}>
                            <Text style={[styles.tocIndex, { color: c.mutedText }]}>
                              {`${unitIndex + 1}.${chapterIndex + 1}.${lessonIndex + 1}`}
                            </Text>
                            <Text style={[styles.tocText, { color: c.text }]}>{lesson.title}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              ))
            ) : (
              <Text style={[Typography.body, { color: c.mutedText }]}>{subjectPreview}</Text>
            )}
          </View>
          {fieldErrors.content ? (
            <Text style={[Typography.caption, styles.fieldErrorText, { color: c.danger }]}>{fieldErrors.content}</Text>
          ) : null}
        </View>
      ) : null}

      <SelectField
        label="Section"
        value={selectedSection?.name ?? ""}
        placeholder="Pick section"
        error={fieldErrors.section}
        onPress={() => {
          animateIn();
          setSectionMenuOpen((v) => !v);
        }}
      />
      {sectionMenuOpen ? (
        <View style={[styles.dropdown, { backgroundColor: c.card, borderColor: c.border }]}>
          {selectableSections.map((section) => (
            <Pressable
              key={section.section_id}
              accessibilityRole="button"
              accessibilityLabel={section.name}
              style={[styles.dropdownItem, { borderBottomColor: c.hairline }]}
              onPress={() => {
                setSelectedSectionId(section.section_id);
                setFieldErrors((prev) => ({ ...prev, section: undefined }));
                setSectionMenuOpen(false);
              }}
            >
              <Text style={[Typography.body, { color: c.text }]}>{section.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );

  const renderScheduleStep = () => (
    <ScrollView
      contentContainerStyle={styles.stepContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.dayChipRow}>
        {DAY_OPTIONS.map((day) => (
          <AnimatedDayChip
            key={day.key}
            active={activeDays.has(day.key)}
            label={day.short}
            fullLabel={day.label}
            onPress={() => toggleDay(day.key)}
          />
        ))}
      </View>

      {fieldErrors.schedule ? (
        <Text style={[Typography.caption, styles.fieldErrorText, { color: c.danger }]}>{fieldErrors.schedule}</Text>
      ) : null}

      {draftConflict ? <ConflictBanner message={draftConflict.message} /> : null}

      {DAY_OPTIONS.filter((day) => activeDays.has(day.key)).map((day) => {
        const row = daySchedules[day.key];

        return (
          <View key={day.key} style={[styles.scheduleCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.scheduleCardHeader}>
              <Text style={[Typography.bodyMedium, { color: c.text }]}>{day.label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add time slot to ${day.label}`}
                style={styles.iconAction}
                onPress={() => addInstance(day.key)}
              >
                <Ionicons name="add" size={20} color={c.tint} />
              </Pressable>
            </View>

            <View style={styles.slotStack}>
              {row.instances.length === 0 ? (
                <Text style={[Typography.caption, { color: c.faintText }]}>
                  No class time yet. Tap + to add one.
                </Text>
              ) : null}
              {row.instances.map((instance, index) => {
                const roomAccent =
                  instance.room === "lecture" ? c.category.lesson.base : c.category.performanceTask.base;
                return (
                  <View key={instance.id} style={[styles.instanceWrap, { backgroundColor: c.card, borderColor: roomAccent }]}>
                    <View style={styles.instanceHeaderRow}>
                      <Text style={[Typography.caption, styles.instanceLabel, { color: c.mutedText }]}>
                        Slot {index + 1}
                      </Text>
                      <View style={styles.instanceActionRow}>
                        <Pressable
                          style={[styles.removeBtn, { borderColor: c.border }]}
                          accessibilityRole="button"
                          accessibilityLabel="Duplicate slot"
                          onPress={() => duplicateInstance(day.key, instance.id)}
                        >
                          <Ionicons name="copy-outline" size={14} color={c.mutedText} />
                        </Pressable>
                        {row.instances.length > 1 ? (
                          <Pressable
                            style={[styles.removeBtn, { borderColor: c.border }]}
                            accessibilityRole="button"
                            accessibilityLabel="Remove slot"
                            onPress={() => removeInstance(day.key, instance.id)}
                          >
                            <Ionicons name="close" size={16} color={c.mutedText} />
                          </Pressable>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.instanceRoomSwitch}>
                      <Chip
                        label="Lecture"
                        icon="school-outline"
                        category="lesson"
                        selected={instance.room === "lecture"}
                        onPress={() => setInstanceRoom(day.key, instance.id, "lecture")}
                      />
                      <Chip
                        label="Laboratory"
                        icon="flask-outline"
                        category="performanceTask"
                        selected={instance.room === "laboratory"}
                        onPress={() => setInstanceRoom(day.key, instance.id, "laboratory")}
                      />
                    </View>

                    <View style={styles.timeRowCentered}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${day.label} slot ${index + 1} start time`}
                        accessibilityValue={{ text: instance.start }}
                        style={[styles.timeInputButton, { backgroundColor: c.surfaceAlt, borderColor: roomAccent }]}
                        onPress={() => openTimePicker({ day: day.key, instanceId: instance.id, field: "start" })}
                      >
                        <Text style={[Typography.bodySm, { color: c.text }]}>{instance.start}</Text>
                      </Pressable>
                      <Text style={[Typography.caption, { color: c.mutedText }]}>to</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${day.label} slot ${index + 1} end time`}
                        accessibilityValue={{ text: instance.end }}
                        style={[styles.timeInputButton, { backgroundColor: c.surfaceAlt, borderColor: roomAccent }]}
                        onPress={() => openTimePicker({ day: day.key, instanceId: instance.id, field: "end" })}
                      >
                        <Text style={[Typography.bodySm, { color: c.text }]}>{instance.end}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );

  const renderRequirementsStep = () => (
    <ScrollView
      contentContainerStyle={styles.stepContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <SectionHeader title="Minimum requirements" />
      {requirementKeys.map((key) => (
        <View key={key} style={[styles.stepperRow, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[Typography.bodyMedium, styles.stepperLabel, { color: c.text }]}>
            {REQUIREMENT_LABEL[key]}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${REQUIREMENT_LABEL[key]} count`}
            style={[styles.stepperBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
            onPress={() => adjustRequirementCount(key, -1)}
          >
            <Ionicons name="remove" size={18} color={c.text} />
          </Pressable>
          <Text
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${REQUIREMENT_LABEL[key]} count: ${requirementCounts[key] || "0"}`}
            style={[Typography.h3, styles.stepperValue, { color: c.text }]}
          >
            {requirementCounts[key] || "0"}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Increase ${REQUIREMENT_LABEL[key]} count`}
            style={[styles.stepperBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
            onPress={() => adjustRequirementCount(key, 1)}
          >
            <Ionicons name="add" size={18} color={c.text} />
          </Pressable>
        </View>
      ))}
      {fieldErrors.requirements ? (
        <Text style={[Typography.caption, styles.fieldErrorText, { color: c.danger }]}>{fieldErrors.requirements}</Text>
      ) : null}

      <SectionHeader title="Exam dates" actionLabel="Add exam date" onAction={addExamScheduleRow} />
      {examSchedules.map((row, index) => {
        const examDefinition = getExamDefinition(index, examSchedules.length);
        return (
          <View key={row.id} style={styles.specialRow}>
            <View style={[styles.examLabelBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Text style={[Typography.caption, styles.examLabelText, { color: c.text }]}>{examDefinition.label}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${examDefinition.label} date`}
              accessibilityValue={row.dateText ? { text: formatIsoDisplay(row.dateText) } : undefined}
              style={[
                styles.specialDatePill,
                { backgroundColor: c.surfaceAlt, borderColor: fieldErrors.examDates ? c.danger : c.border },
              ]}
              onPress={() => openDatePicker({ type: "exam", id: row.id }, row.dateText)}
            >
              <Text style={[Typography.caption, styles.pillText, { color: row.dateText ? c.text : c.faintText }]}>
                {row.dateText ? formatIsoDisplay(row.dateText) : "Pick date"}
              </Text>
            </Pressable>
            {examSchedules.length > 1 ? (
              <Pressable
                style={styles.iconAction}
                accessibilityRole="button"
                accessibilityLabel="Remove exam date"
                onPress={() => removeExamScheduleRow(row.id)}
              >
                <Ionicons name="close" size={16} color={c.mutedText} />
              </Pressable>
            ) : (
              <View style={styles.iconAction} />
            )}
          </View>
        );
      })}
      {fieldErrors.examDates ? (
        <Text style={[Typography.caption, styles.fieldErrorText, { color: c.danger }]}>{fieldErrors.examDates}</Text>
      ) : null}

      <SectionHeader title="Special dates" />
      {specialDates.map((row, index) => (
        <View key={row.id} style={styles.specialRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Special date"
            accessibilityValue={row.dateText ? { text: formatIsoDisplay(row.dateText) } : undefined}
            style={[styles.specialDatePill, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
            onPress={() => openDatePicker({ type: "special", id: row.id }, row.dateText)}
          >
            <Text style={[Typography.caption, styles.pillText, { color: row.dateText ? c.text : c.faintText }]}>
              {row.dateText ? formatIsoDisplay(row.dateText) : "Pick date"}
            </Text>
          </Pressable>
          <View style={[styles.specialReasonBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
            <TextInput
              value={row.reason}
              onChangeText={(value) => setSpecialDateField(row.id, "reason", value)}
              placeholder="Reason"
              placeholderTextColor={c.faintText}
              accessibilityLabel="Special date reason"
              style={[Typography.body, styles.reasonInput, { color: c.text }]}
            />
          </View>
          <Pressable
            style={styles.iconAction}
            accessibilityRole="button"
            accessibilityLabel="Remove special date"
            onPress={() => removeSpecialDateRow(row.id)}
          >
            <Ionicons name="close" size={16} color={c.mutedText} />
          </Pressable>
          {index === specialDates.length - 1 ? (
            <Pressable
              style={styles.iconAction}
              accessibilityRole="button"
              accessibilityLabel="Add special date"
              onPress={addSpecialDateRow}
            >
              <Ionicons name="add" size={20} color={c.tint} />
            </Pressable>
          ) : (
            <View style={styles.iconAction} />
          )}
        </View>
      ))}
      {specialDates.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add special date"
          style={[styles.addSpecialDateBtn, { backgroundColor: c.card, borderColor: c.border }]}
          onPress={addSpecialDateRow}
        >
          <Ionicons name="add" size={14} color={c.mutedText} />
          <Text style={[Typography.caption, styles.addSpecialDateText, { color: c.mutedText }]}>Add Special Date</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );

  const renderReviewStep = () => (
    <ScrollView
      contentContainerStyle={styles.stepContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {serverConflict ? (
        <ConflictBanner
          message={serverConflict}
          actionLabel="Fix schedule in Step 3"
          onAction={() => setStepIndex(2)}
        />
      ) : null}

      <ListRow
        icon="calendar-outline"
        title="Dates"
        subtitle={`${formatIsoDisplay(startDate)} – ${formatIsoDisplay(endDate)} · AY ${formatAcademicYear(academicYearStart)}`}
        onPress={() => setStepIndex(0)}
        accessibilityLabel="Edit dates"
      />
      <ListRow
        icon="business-outline"
        title="Institution"
        subtitle={selectedInstitution?.name ?? "Not set"}
        onPress={() => setStepIndex(0)}
        accessibilityLabel="Edit institution"
      />
      <ListRow
        icon="book-outline"
        title="Subject"
        subtitle={selectedSubject ? `${selectedSubject.code} - ${selectedSubject.title}` : "Not set"}
        onPress={() => setStepIndex(1)}
        accessibilityLabel="Edit subject"
      />
      <ListRow
        icon="people-outline"
        title="Section"
        subtitle={selectedSection?.name ?? "Not set"}
        onPress={() => setStepIndex(1)}
        accessibilityLabel="Edit section"
      />
      <ListRow
        icon="list-outline"
        title="Content"
        subtitle={`${selectedLessonIds.size} lesson${selectedLessonIds.size === 1 ? "" : "s"} across ${selectedChapterIds.size} chapter${selectedChapterIds.size === 1 ? "" : "s"}`}
        onPress={() => setStepIndex(1)}
        accessibilityLabel="Edit subject content"
      />
      <ListRow
        icon="time-outline"
        title="Weekly schedule"
        subtitle={scheduleSummary || "Not set"}
        onPress={() => setStepIndex(2)}
        accessibilityLabel="Edit weekly schedule"
      />
      <ListRow
        icon="ribbon-outline"
        title="Exam dates"
        subtitle={
          examSchedules
            .map((row) => (row.dateText ? formatIsoDisplay(row.dateText) : "Not set"))
            .join(" · ") || "Not set"
        }
        onPress={() => setStepIndex(3)}
        accessibilityLabel="Edit exam dates"
        divider={false}
      />

      <SectionHeader title="Requirements" />
      <View style={styles.badgeRow}>
        <Badge category="writtenWork" label={`${requirementCounts.written_work || "0"} Written Work`} />
        <Badge category="performanceTask" label={`${requirementCounts.performance_task || "0"} Performance Task`} />
        <Badge category="exam" label={`${requirementCounts.exam || "0"} Exam${Number(requirementCounts.exam || "0") === 1 ? "" : "s"}`} />
        {specialDates.length > 0 ? (
          <Badge category="buffer" label={`${specialDates.length} Special Date${specialDates.length === 1 ? "" : "s"}`} />
        ) : null}
      </View>
    </ScrollView>
  );

  const stepRenderers = [
    renderWhenStep,
    renderSubjectStep,
    renderScheduleStep,
    renderRequirementsStep,
    renderReviewStep,
  ];
  const isReviewStep = stepIndex === steps.length - 1;

  return (
    <View style={[styles.page, { backgroundColor: c.background }]}>
      <StepFlow
        steps={steps}
        index={stepIndex}
        onBack={handleStepBack}
        backLabelOnFirst="Cancel"
        nextLabel={isReviewStep ? "Generate plan" : "Continue"}
        onNext={isReviewStep ? handleCreatePlan : handleStepNext}
        nextLoading={isReviewStep && saving}
      >
        {stepRenderers[stepIndex]()}
      </StepFlow>

      <Modal visible={chapterModalOpen} transparent animationType="fade" onRequestClose={() => setChapterModalOpen(false)}>
        <Pressable style={[styles.modalBackdrop, { backgroundColor: c.backdrop }]} onPress={() => setChapterModalOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => {}}>
            <Text style={[Typography.h2, styles.modalTitle, { color: c.text }]}>Select Units, Chapters, and Lessons</Text>
            <ScrollView style={styles.modalScroll}>
              {unitGroups.length === 0 ? (
                <Text style={[Typography.body, { color: c.mutedText }]}>No units/chapters found for this subject.</Text>
              ) : (
                unitGroups.map((group) => (
                  <View key={group.key} style={styles.modalGroup}>
                    <Text style={[Typography.body, styles.modalGroupTitle, { color: c.text }]}>{group.title}</Text>
                    {group.chapters.map((chapter) => {
                      const selectedChapter = selectedChapterIds.has(chapter.chapter_id);
                      return (
                        <View key={chapter.chapter_id} style={styles.chapterWithLessons}>
                          <Pressable
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selectedChapter }}
                            accessibilityLabel={`Chapter ${chapter.sequence_no}: ${chapter.title}`}
                            style={styles.modalChapterRow}
                            onPress={() => toggleChapter(chapter.chapter_id)}
                          >
                            <View
                              style={[
                                styles.selectionBox,
                                { borderColor: selectedChapter ? c.tint : c.border, backgroundColor: selectedChapter ? c.tint : c.card },
                              ]}
                            >
                              {selectedChapter ? <Ionicons name="checkmark" size={12} color={c.onTint} /> : null}
                            </View>
                            <Text style={[Typography.body, styles.modalChapterText, { color: c.text }]}>
                              Chapter {chapter.sequence_no}: {chapter.title}
                            </Text>
                          </Pressable>
                          {chapter.lessons.map((lesson) => {
                            const selectedLesson = selectedLessonIds.has(lesson.lesson_id);
                            return (
                              <Pressable
                                key={lesson.lesson_id}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: selectedLesson }}
                                accessibilityLabel={`Lesson ${lesson.sequence_no}: ${lesson.title}`}
                                style={styles.modalLessonRow}
                                onPress={() => toggleLesson(chapter.chapter_id, lesson.lesson_id)}
                              >
                                <View
                                  style={[
                                    styles.selectionBoxSmall,
                                    { borderColor: selectedLesson ? c.tint : c.border, backgroundColor: selectedLesson ? c.tint : c.card },
                                  ]}
                                >
                                  {selectedLesson ? <Ionicons name="checkmark" size={11} color={c.onTint} /> : null}
                                </View>
                                <Text style={[Typography.caption, styles.modalLessonText, { color: c.mutedText }]}>
                                  Lesson {lesson.sequence_no}: {lesson.title}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                ))
              )}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done selecting content"
              style={[styles.modalDone, { backgroundColor: c.tint }]}
              onPress={() => setChapterModalOpen(false)}
            >
              <Text style={[Typography.h3, { color: c.onTint }]}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={timePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setTimePickerOpen(false);
          setTimeTarget(null);
        }}
      >
        <Pressable
          style={[styles.modalBackdrop, { backgroundColor: c.backdrop }]}
          onPress={() => {
            setTimePickerOpen(false);
            setTimeTarget(null);
          }}
        >
          <Pressable style={[styles.timeModalCard, { backgroundColor: c.card }]} onPress={() => {}}>
            <Text style={[Typography.h2, styles.modalTitle, { color: c.text }]}>Select Time</Text>
            <View style={styles.timePickerRow}>
              <View style={styles.timePickerCol}>
                <Picker
                  selectedValue={pickerHour}
                  onValueChange={(v) => setPickerHour(Number(v))}
                  style={{ color: c.text }}
                  itemStyle={[styles.pickerItem, { color: c.text }]}
                >
                  {Array.from({ length: 12 }).map((_, i) => {
                    const hour = i + 1;
                    return <Picker.Item key={hour} label={`${hour}`} value={hour} />;
                  })}
                </Picker>
              </View>
              <View style={styles.timePickerCol}>
                <Picker
                  selectedValue={pickerMinute}
                  onValueChange={(v) => setPickerMinute(Number(v))}
                  style={{ color: c.text }}
                  itemStyle={[styles.pickerItem, { color: c.text }]}
                >
                  {[0, 15, 30, 45].map((minute) => (
                    <Picker.Item key={minute} label={String(minute).padStart(2, "0")} value={minute} />
                  ))}
                </Picker>
              </View>
              <View style={styles.timePickerCol}>
                <Picker
                  selectedValue={pickerMeridiem}
                  onValueChange={(v) => setPickerMeridiem(v as "AM" | "PM")}
                  style={{ color: c.text }}
                  itemStyle={[styles.pickerItem, { color: c.text }]}
                >
                  <Picker.Item label="AM" value="AM" />
                  <Picker.Item label="PM" value="PM" />
                </Picker>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set time"
              style={[styles.modalDone, { backgroundColor: c.tint }]}
              onPress={applyPickedTime}
            >
              <Text style={[Typography.h3, { color: c.onTint }]}>Set Time</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={datePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDatePickerOpen(false);
          setDateTarget(null);
        }}
      >
        <Pressable
          style={[styles.modalBackdrop, { backgroundColor: c.backdrop }]}
          onPress={() => {
            setDatePickerOpen(false);
            setDateTarget(null);
          }}
        >
          <Pressable style={[styles.timeModalCard, { backgroundColor: c.card }]} onPress={() => {}}>
            <Text style={[Typography.h2, styles.modalTitle, { color: c.text }]}>Pick Date</Text>
            <View style={styles.timePickerRow}>
              <View style={styles.timePickerCol}>
                <Picker
                  selectedValue={datePickerMonth}
                  onValueChange={(v) => setDatePickerMonth(Number(v))}
                  style={{ color: c.text }}
                  itemStyle={[styles.pickerItem, { color: c.text }]}
                >
                  {MONTH_LABELS.map((month, idx) => (
                    <Picker.Item key={month} label={month} value={idx + 1} />
                  ))}
                </Picker>
              </View>
              <View style={styles.timePickerCol}>
                <Picker
                  selectedValue={datePickerDay}
                  onValueChange={(v) => setDatePickerDay(Number(v))}
                  style={{ color: c.text }}
                  itemStyle={[styles.pickerItem, { color: c.text }]}
                >
                  {Array.from({ length: getDaysInMonth(datePickerYear, datePickerMonth) }).map((_, i) => {
                    const day = i + 1;
                    return <Picker.Item key={day} label={String(day)} value={day} />;
                  })}
                </Picker>
              </View>
              <View style={styles.timePickerCol}>
                <Picker
                  selectedValue={datePickerYear}
                  onValueChange={(v) => setDatePickerYear(Number(v))}
                  style={{ color: c.text }}
                  itemStyle={[styles.pickerItem, { color: c.text }]}
                >
                  {Array.from({ length: 16 }).map((_, i) => {
                    const year = nowYear - 5 + i;
                    return <Picker.Item key={year} label={String(year)} value={year} />;
                  })}
                </Picker>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set date"
              style={[styles.modalDone, { backgroundColor: c.tint }]}
              onPress={applyPickedDate}
            >
              <Text style={[Typography.h3, { color: c.onTint }]}>Set Date</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={yearPickerOpen} transparent animationType="fade" onRequestClose={() => setYearPickerOpen(false)}>
        <Pressable style={[styles.modalBackdrop, { backgroundColor: c.backdrop }]} onPress={() => setYearPickerOpen(false)}>
          <Pressable style={[styles.timeModalCard, { backgroundColor: c.card }]} onPress={() => {}}>
            <Text style={[Typography.h2, styles.modalTitle, { color: c.text }]}>Pick Academic Year Start</Text>
            <View style={styles.singlePickerWrap}>
              <Picker
                selectedValue={academicYearStart}
                onValueChange={(v) => setAcademicYearStart(Number(v))}
                style={{ color: c.text }}
                itemStyle={[styles.pickerItem, { color: c.text }]}
              >
                {Array.from({ length: 16 }).map((_, i) => {
                  const year = nowYear - 5 + i;
                  return <Picker.Item key={year} label={`${year} (${formatAcademicYear(year)})`} value={year} />;
                })}
              </Picker>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set academic year"
              style={[styles.modalDone, { backgroundColor: c.tint }]}
              onPress={() => setYearPickerOpen(false)}
            >
              <Text style={[Typography.h3, { color: c.onTint }]}>Set Year</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        quotaType={paywallQuotaType}
        regionCode={Localization.getLocales()[0]?.regionCode ?? null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  stepContent: {
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  selectLabel: { marginBottom: Spacing.xs, fontWeight: "500" },
  selectField: {
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  selectValue: { flex: 1 },
  dateRow: { flexDirection: "row", gap: Spacing.sm },
  dateField: { flex: 1 },
  fieldErrorText: { marginTop: Spacing.xs },
  dropdown: {
    borderRadius: Radius.md,
    overflow: "hidden",
    borderWidth: 1,
  },
  dropdownItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subjectPreviewBox: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    gap: 6,
  },
  tocRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    minHeight: 30,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tocIndex: {
    ...Typography.caption,
    width: 26,
    textAlign: "right",
    fontWeight: "600",
  },
  tocText: {
    ...Typography.body,
    flex: 1,
  },
  previewUnitBlock: { gap: 4 },
  previewChapterBlock: { marginLeft: Spacing.sm, gap: 4 },
  previewLessonBlock: { marginLeft: Spacing.sm, gap: 4 },
  dayChipRow: { flexDirection: "row", gap: Spacing.sm },
  dayChip: {
    flex: 1,
    minHeight: 46,
    borderRadius: Radius.sm,
    borderWidth: 1,
    overflow: "hidden",
  },
  dayChipInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  dayChipText: { ...Typography.h3, fontWeight: "500" },
  conflictBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  conflictBannerBody: { flex: 1, gap: Spacing.xs },
  conflictBannerLink: { fontWeight: "600", textDecorationLine: "underline" },
  scheduleCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  scheduleCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  slotStack: { gap: Spacing.sm },
  instanceWrap: {
    borderWidth: 2,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  instanceHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  instanceLabel: { fontWeight: "600" },
  instanceActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  instanceRoomSwitch: {
    flexDirection: "row",
    gap: 6,
  },
  timeRowCentered: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  timeInputButton: {
    minHeight: 36,
    minWidth: 105,
    borderWidth: 1,
    borderRadius: Radius.round,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  removeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconAction: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 56,
  },
  stepperLabel: { flex: 1 },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.round,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    minWidth: 32,
    textAlign: "center",
  },
  examLabelBox: {
    width: "36%",
    minHeight: 44,
    borderWidth: 1,
    borderRadius: Radius.round,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  examLabelText: {
    textAlign: "center",
    fontWeight: "600",
  },
  specialRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  specialDatePill: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: Radius.round,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  pillText: { textAlign: "center", paddingVertical: 0 },
  specialReasonBox: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.sm,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  reasonInput: { paddingVertical: 0 },
  addSpecialDateBtn: {
    minHeight: 40,
    borderRadius: Radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addSpecialDateText: { fontWeight: "600" },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: Spacing.xl,
  },
  modalCard: {
    borderRadius: Radius.lg,
    maxHeight: "80%",
    padding: 14,
    borderWidth: 1,
  },
  modalTitle: { marginBottom: Spacing.sm },
  modalScroll: { maxHeight: 420 },
  modalGroup: { marginBottom: Spacing.md, gap: Spacing.sm },
  modalGroupTitle: { fontWeight: "600" },
  chapterWithLessons: { gap: 4 },
  modalChapterRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  modalChapterText: { flex: 1 },
  modalLessonRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginLeft: Spacing.xxl },
  modalLessonText: { flex: 1 },
  selectionBox: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionBoxSmall: {
    width: 16,
    height: 16,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  modalDone: {
    marginTop: Spacing.sm,
    minHeight: 42,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  timeModalCard: {
    borderRadius: Radius.lg,
    padding: 14,
  },
  timePickerRow: { flexDirection: "row", gap: Spacing.sm },
  timePickerCol: { flex: 1, minHeight: 160, justifyContent: "center" },
  singlePickerWrap: { minHeight: 180, justifyContent: "center" },
  pickerItem: { fontSize: 18 },
});
