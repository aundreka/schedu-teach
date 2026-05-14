import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Radius, Spacing, Typography } from "../../../constants/fonts";
import { useAppTheme } from "../../../context/theme";
import { usePullToRefresh } from "../../../hooks/usePullToRefresh";
import { supabase } from "../../../lib/supabase";

type PlanDetail = {
  lesson_plan_id: string;
  title: string;
  academic_year: string | null;
  term: string;
  start_date: string;
  end_date: string;
  status: string;
  notes: string | null;
  school_name: string;
  subject_code: string;
  subject_title: string;
  subject_year: string | null;
  section_name: string;
  section_grade_level: string | null;
};

type PlanEntryItem = {
  plan_entry_id: string;
  day: string | null;
  start_time: string | null;
  end_time: string | null;
  meeting_type: string | null;
  room: string | null;
  instance_no: number | null;
};

type PlanDraft = {
  title: string;
  academic_year: string;
  term: string;
  start_date: string;
  end_date: string;
  notes: string;
};

const DAY_LABEL: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const DAY_ORDER: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

const TERM_OPTIONS = ["quarter", "trimester", "semester"] as const;
const DAY_OPTIONS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function makeId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toTitleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatIsoDate(value: string | null) {
  if (!value) return "-";
  const [year, month, day] = value.split("-").map((n) => Number(n));
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(value: string | null) {
  if (!value) return "";
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw ?? "0");
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const meridiem = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function toTimeInput(value: string | null) {
  if (!value) return "";
  return value.slice(0, 5);
}

function parseSqlTime(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  const matched = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!matched) return null;
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  const second = Number(matched[3] ?? "0");
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map((n) => Number(n));
  if (!year || !month || !day) return false;
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() + 1 === month &&
    parsed.getDate() === day
  );
}

function toPlanDraft(plan: PlanDetail): PlanDraft {
  return {
    title: plan.title,
    academic_year: plan.academic_year ?? "",
    term: plan.term,
    start_date: plan.start_date,
    end_date: plan.end_date,
    notes: plan.notes ?? "",
  };
}

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(year, (month ?? 1) - 1, day ?? 1);
  next.setDate(next.getDate() + days);
  const yyyy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildSlotDatesForDay(startDate: string, endDate: string, weekday: string) {
  const dates: string[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) {
    const date = new Date(`${cursor}T00:00:00`);
    const label = DAY_OPTIONS[(date.getDay() + 6) % 7];
    if (label === weekday) dates.push(cursor);
  }
  return dates;
}

function makeDraftSchedule(): PlanEntryItem {
  const key = `draft_${makeId()}`;
  return {
    plan_entry_id: key,
    day: "monday",
    start_time: "08:00:00",
    end_time: "10:00:00",
    meeting_type: "lecture",
    room: "lecture",
    instance_no: null,
  };
}

function withInstanceNumbers(entries: PlanEntryItem[]) {
  const daySlotCounts = new Map<string, number>();
  return entries.map((entry) => {
    const dayKey = entry.day ?? "";
    const nextSlotNumber = (daySlotCounts.get(dayKey) ?? 0) + 1;
    daySlotCounts.set(dayKey, nextSlotNumber);
    return { ...entry, instance_no: nextSlotNumber };
  });
}

function buildSeriesSignature(row: any) {
  const weekday = String(row?.weekday ?? "").trim().toLowerCase();
  const startTime = String(row?.start_time ?? "").trim();
  const endTime = String(row?.end_time ?? "").trim();
  const meetingType = String(row?.meeting_type ?? "").trim().toLowerCase();
  const slotNumber = Number(row?.slot_number ?? 0);
  return [weekday, startTime, endTime, meetingType, String(slotNumber)].join("__");
}

function makeLegacySeriesKey(row: any) {
  const signature = buildSeriesSignature(row).replace(/[^a-z0-9_-]+/gi, "_");
  const slotId = String(row?.slot_id ?? makeId()).replace(/[^a-z0-9_-]+/gi, "_");
  return `legacy_${signature}_${slotId}`;
}

function mapPlanDetail(row: any): PlanDetail | null {
  const subjectRaw = row?.subject;
  const subject = Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw;
  const sectionRaw = row?.section;
  const section = Array.isArray(sectionRaw) ? sectionRaw[0] : sectionRaw;
  const schoolRaw = row?.school;
  const school = Array.isArray(schoolRaw) ? schoolRaw[0] : schoolRaw;

  const lessonPlanId = String(row?.lesson_plan_id ?? "");
  const title = String(row?.title ?? "Untitled Plan");
  const rawTerm = String(row?.term ?? "").trim().toLowerCase();
  const term = TERM_OPTIONS.includes(rawTerm as (typeof TERM_OPTIONS)[number]) ? rawTerm : "semester";
  const startDate = String(row?.start_date ?? "");
  const endDate = String(row?.end_date ?? "");
  const rawStatus = String(row?.status ?? "").trim().toLowerCase();
  const status = rawStatus || "draft";

  if (!lessonPlanId || !startDate || !endDate) return null;

  return {
    lesson_plan_id: lessonPlanId,
    title,
    academic_year: row?.academic_year ? String(row.academic_year) : null,
    term,
    start_date: startDate,
    end_date: endDate,
    status,
    notes: row?.notes ? String(row.notes) : null,
    school_name: String(school?.name ?? "Unknown institution"),
    subject_code: String(subject?.code ?? ""),
    subject_title: String(subject?.title ?? "Unknown subject"),
    subject_year: subject?.year ? String(subject.year) : null,
    section_name: String(section?.name ?? "Unknown section"),
    section_grade_level: section?.grade_level ? String(section.grade_level) : null,
  };
}

function mapPlanEntry(row: any): PlanEntryItem | null {
  const planEntryId = String(row?.series_key ?? row?.slot_id ?? "");
  const meetingType = row?.meeting_type ? String(row.meeting_type) : null;

  if (!planEntryId) return null;

  return {
    plan_entry_id: planEntryId,
    day: row?.weekday ? String(row.weekday) : null,
    start_time: row?.start_time ? String(row.start_time) : null,
    end_time: row?.end_time ? String(row.end_time) : null,
    meeting_type: meetingType,
    room: meetingType,
    instance_no: typeof row?.slot_number === "number" ? Number(row.slot_number) : null,
  };
}

const DANGER = "#DC2626";

function statusPalette(status: string): { bg: string; fg: string } {
  switch (status) {
    case "active":
    case "published":
      return { bg: "rgba(34,197,94,0.14)", fg: "#15803D" };
    case "archived":
      return { bg: "rgba(107,114,128,0.16)", fg: "#4B5563" };
    default:
      return { bg: "rgba(245,158,11,0.16)", fg: "#B45309" };
  }
}

export default function PlanDetailScreen() {
  const { lessonPlanId } = useLocalSearchParams<{ lessonPlanId?: string | string[] }>();
  const planId = useMemo(
    () => (Array.isArray(lessonPlanId) ? lessonPlanId[0] : lessonPlanId) ?? "",
    [lessonPlanId]
  );

  const { colors: c, scheme } = useAppTheme();
  const isDark = scheme === "dark";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [entries, setEntries] = useState<PlanEntryItem[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [draftEntries, setDraftEntries] = useState<PlanEntryItem[]>([]);

  const loadPlanDetail = useCallback(async () => {
    if (!planId) {
      setPlan(null);
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("No signed-in user found.");

      const { data: planRow, error: planError } = await supabase
        .from("lesson_plans")
        .select(
          "lesson_plan_id, title, academic_year, start_date, end_date, status, notes, school:schools(name), subject:subjects(code, title, year), section:sections(name, grade_level)"
        )
        .eq("lesson_plan_id", planId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (planError) throw planError;

      const mappedPlan = mapPlanDetail(planRow);
      setPlan(mappedPlan);
      if (!isEditing) {
        setDraft(mappedPlan ? toPlanDraft(mappedPlan) : null);
      }

      if (!mappedPlan) {
        setEntries([]);
        return;
      }

      const { data: entryRows, error: entriesError } = await supabase
        .from("slots")
        .select(
          "slot_id, title, weekday, slot_date, start_time, end_time, meeting_type, slot_number, series_key"
        )
        .eq("lesson_plan_id", mappedPlan.lesson_plan_id)
        .order("slot_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (entriesError) throw entriesError;

      const rowsWithSeriesKey = [...(entryRows ?? [])];
      const groupedRows = new Map<string, any[]>();
      for (const row of rowsWithSeriesKey) {
        const signature = buildSeriesSignature(row);
        const list = groupedRows.get(signature) ?? [];
        list.push(row);
        groupedRows.set(signature, list);
      }

      const legacyUpdates: PromiseLike<{ error: any }>[] = [];
      for (const rows of groupedRows.values()) {
        const existingSeriesKey = rows.find((row) => String(row?.series_key ?? "").trim())?.series_key ?? null;
        const resolvedSeriesKey = existingSeriesKey ? String(existingSeriesKey) : makeLegacySeriesKey(rows[0]);
        const missingSlotIds = rows
          .filter((row) => !String(row?.series_key ?? "").trim() && row?.slot_id)
          .map((row) => String(row.slot_id));

        for (const row of rows) {
          if (!String(row?.series_key ?? "").trim()) {
            row.series_key = resolvedSeriesKey;
          }
        }

        if (missingSlotIds.length > 0) {
          legacyUpdates.push(
            supabase
              .from("slots")
              .update({ series_key: resolvedSeriesKey })
              .in("slot_id", missingSlotIds)
          );
        }
      }

      if (legacyUpdates.length > 0) {
        const results = await Promise.all(legacyUpdates);
        const failedUpdate = results.find((result) => result.error);
        if (failedUpdate?.error) throw failedUpdate.error;
      }

      const seenSeriesKeys = new Set<string>();
      const mappedEntries = rowsWithSeriesKey
        .filter((row: any) => {
          const seriesKey = String(row?.series_key ?? "");
          if (!seriesKey || seenSeriesKeys.has(seriesKey)) return false;
          seenSeriesKeys.add(seriesKey);
          return true;
        })
        .map(mapPlanEntry)
        .filter((item: PlanEntryItem | null): item is PlanEntryItem => Boolean(item));

      const numberedEntries = withInstanceNumbers(mappedEntries);
      setEntries(numberedEntries);
      if (!isEditing) {
        setDraftEntries(numberedEntries.map((entry) => ({ ...entry })));
      }
    } catch {
      setPlan(null);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [isEditing, planId]);

  useEffect(() => {
    loadPlanDetail();
  }, [loadPlanDetail]);

  const { refreshing, onRefresh } = usePullToRefresh(loadPlanDetail);

  const handleEdit = useCallback(() => {
    if (!plan) return;
    setDraft(toPlanDraft(plan));
    setDraftEntries(withInstanceNumbers(entries.map((entry) => ({ ...entry }))));
    setIsEditing(true);
  }, [entries, plan]);

  const handleDuplicate = useCallback(() => {
    if (!plan) return;
    router.push({
      pathname: "/(tabs)/create/lessonplan",
      params: { duplicateFromPlanId: plan.lesson_plan_id },
    });
  }, [plan]);

  const handleRecreate = useCallback(() => {
    if (!plan) return;
    router.push({
      pathname: "/(tabs)/create/lessonplan",
      params: { duplicateFromPlanId: plan.lesson_plan_id, replacePlanId: plan.lesson_plan_id },
    });
  }, [plan]);

  const confirmRecreate = useCallback(() => {
    if (!plan || deleting || saving) return;
    Alert.alert(
      "Recreate this plan?",
      "We'll rebuild the schedule from your original inputs — subjects, lessons, requirements and exam dates — then replace the current plan once you confirm on the next screen.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Recreate", onPress: () => handleRecreate() },
      ]
    );
  }, [deleting, handleRecreate, plan, saving]);

  const handleCancelEdit = useCallback(() => {
    if (plan) setDraft(toPlanDraft(plan));
    setDraftEntries(withInstanceNumbers(entries.map((entry) => ({ ...entry }))));
    setIsEditing(false);
  }, [entries, plan]);

  const setEntryField = useCallback(
    <K extends keyof PlanEntryItem>(planEntryId: string, key: K, value: PlanEntryItem[K]) => {
      setDraftEntries((prev) =>
        withInstanceNumbers(
          prev.map((entry) => (entry.plan_entry_id === planEntryId ? { ...entry, [key]: value } : entry))
        )
      );
    },
    []
  );

  const addDraftSchedule = useCallback((day: (typeof DAY_OPTIONS)[number] = "monday") => {
    setDraftEntries((prev) => withInstanceNumbers([...prev, { ...makeDraftSchedule(), day }]));
  }, []);

  const duplicateDraftSchedule = useCallback((planEntryId: string) => {
    setDraftEntries((prev) => {
      const index = prev.findIndex((entry) => entry.plan_entry_id === planEntryId);
      if (index === -1) return prev;
      const source = prev[index];
      const next = [...prev];
      next.splice(index + 1, 0, {
        ...source,
        plan_entry_id: `draft_${makeId()}`,
        instance_no: null,
      });
      return withInstanceNumbers(next);
    });
  }, []);

  const removeDraftSchedule = useCallback((planEntryId: string) => {
    setDraftEntries((prev) => withInstanceNumbers(prev.filter((entry) => entry.plan_entry_id !== planEntryId)));
  }, []);

  const toggleDraftDay = useCallback((day: (typeof DAY_OPTIONS)[number]) => {
    setDraftEntries((prev) => {
      const hasDay = prev.some((entry) => entry.day === day);
      if (hasDay) {
        return withInstanceNumbers(prev.filter((entry) => entry.day !== day));
      }
      return withInstanceNumbers([...prev, { ...makeDraftSchedule(), day }]);
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!plan || !draft) return;

    const title = draft.title.trim();
    const term = draft.term.trim().toLowerCase();
    const startDate = draft.start_date.trim();
    const endDate = draft.end_date.trim();
    const academicYear = draft.academic_year.trim();
    const notes = draft.notes.trim();

    if (!title) {
      Alert.alert("Title required", "Enter a lesson plan title.");
      return;
    }
    if (!TERM_OPTIONS.includes(term as (typeof TERM_OPTIONS)[number])) {
      Alert.alert("Invalid term", "Select Quarter, Trimester, or Semester.");
      return;
    }
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      Alert.alert("Invalid dates", "Use YYYY-MM-DD for start and end dates.");
      return;
    }
    if (endDate < startDate) {
      Alert.alert("Invalid range", "End date must be on or after start date.");
      return;
    }

    const normalizedEntries: PlanEntryItem[] = [];
    for (const entry of draftEntries) {
      const day = entry.day?.trim().toLowerCase() ?? "";
      const room = entry.room?.trim() ?? "";
      const startTimeRaw = entry.start_time?.trim() ?? "";
      const endTimeRaw = entry.end_time?.trim() ?? "";
      const startTime = startTimeRaw ? parseSqlTime(startTimeRaw) : null;
      const endTime = endTimeRaw ? parseSqlTime(endTimeRaw) : null;

      if (startTimeRaw && !startTime) {
        Alert.alert("Invalid start time", "Use 24-hour HH:MM (example: 13:30).");
        return;
      }
      if (endTimeRaw && !endTime) {
        Alert.alert("Invalid end time", "Use 24-hour HH:MM (example: 15:00).");
        return;
      }
      if (!DAY_OPTIONS.includes(day as (typeof DAY_OPTIONS)[number])) {
        Alert.alert("Invalid meeting day", "Recurring meetings must have a valid day.");
        return;
      }
      if (!startTime || !endTime) {
        Alert.alert("Slot time required", "Recurring slots must have start and end times.");
        return;
      }

      normalizedEntries.push({
        ...entry,
        day: day || null,
        meeting_type: room || null,
        room: room || null,
        start_time: startTime,
        end_time: endTime,
        instance_no: null,
      });
    }

    setSaving(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("No signed-in user found.");

      const { error: updateError } = await supabase
        .from("lesson_plans")
        .update({
          title,
          academic_year: academicYear || null,
          start_date: startDate,
          end_date: endDate,
          notes: notes || null,
        })
        .eq("lesson_plan_id", plan.lesson_plan_id)
        .eq("user_id", user.id);
      if (updateError) throw updateError;

      const existingSeriesKeys = new Set(entries.map((entry) => entry.plan_entry_id));
      const nextSeriesKeys = new Set(normalizedEntries.map((entry) => entry.plan_entry_id));
      const removedSeriesKeys = Array.from(existingSeriesKeys).filter((seriesKey) => !nextSeriesKeys.has(seriesKey));

      if (removedSeriesKeys.length > 0) {
        const { error: deleteRemovedError } = await supabase
          .from("slots")
          .delete()
          .eq("lesson_plan_id", plan.lesson_plan_id)
          .in("series_key", removedSeriesKeys);
        if (deleteRemovedError) throw deleteRemovedError;
      }

      const slotDatesBySeriesKey = new Map<string, string[]>();
      for (const entry of normalizedEntries) {
        const slotDates = buildSlotDatesForDay(startDate, endDate, entry.day ?? "");
        if (slotDates.length === 0) {
          Alert.alert("Schedule day out of range", `No ${entry.day ?? "selected"} dates fall within the current plan range.`);
          return;
        }
        slotDatesBySeriesKey.set(entry.plan_entry_id, slotDates);
      }

      const daySlotCounts = new Map<string, number>();
      for (const entry of normalizedEntries) {
        const { error: deleteSeriesError } = await supabase
          .from("slots")
          .delete()
          .eq("lesson_plan_id", plan.lesson_plan_id)
          .eq("series_key", entry.plan_entry_id);
        if (deleteSeriesError) throw deleteSeriesError;

        const dayKey = entry.day ?? "";
        const nextSlotNumber = (daySlotCounts.get(dayKey) ?? 0) + 1;
        daySlotCounts.set(dayKey, nextSlotNumber);

        const slotDates = slotDatesBySeriesKey.get(entry.plan_entry_id) ?? [];
        const slotRows = slotDates.map((slotDate) => ({
          lesson_plan_id: plan.lesson_plan_id,
          title: null,
          slot_date: slotDate,
          weekday: entry.day,
          start_time: entry.start_time,
          end_time: entry.end_time,
          meeting_type: entry.room,
          slot_number: nextSlotNumber,
          series_key: entry.plan_entry_id,
          is_locked: false,
        }));

        const { error: insertSeriesError } = await supabase.from("slots").insert(slotRows);
        if (insertSeriesError) throw insertSeriesError;
      }

      setPlan((prev) =>
        prev
          ? {
              ...prev,
              title,
              academic_year: academicYear || null,
              term,
              start_date: startDate,
              end_date: endDate,
              notes: notes || null,
            }
          : prev
      );
      const numberedEntries = withInstanceNumbers(normalizedEntries);
      setEntries(numberedEntries.map((entry) => ({ ...entry })));
      setDraftEntries(numberedEntries.map((entry) => ({ ...entry })));
      setIsEditing(false);
      Alert.alert("Saved", "Lesson plan and schedule have been updated.");
    } catch (error: any) {
      Alert.alert("Update failed", error?.message ?? "Could not save lesson plan changes.");
    } finally {
      setSaving(false);
    }
  }, [draft, draftEntries, entries, plan]);

  const handleDeletePlan = useCallback(async () => {
    if (!plan || deleting) return;
    setDeleting(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("No signed-in user found.");

      const { error } = await supabase
        .from("lesson_plans")
        .delete()
        .eq("lesson_plan_id", plan.lesson_plan_id)
        .eq("user_id", user.id);
      if (error) throw error;

      Alert.alert("Plan deleted", "The lesson plan has been removed.");
      router.replace("/plans");
    } catch (err: any) {
      Alert.alert("Could not delete plan", err?.message ?? "Please try again.");
    } finally {
      setDeleting(false);
    }
  }, [deleting, plan]);

  const confirmDeletePlan = useCallback(() => {
    if (!plan || deleting || saving) return;
    Alert.alert(
      "Delete lesson plan?",
      "This permanently deletes the lesson plan and its entries.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void handleDeletePlan();
          },
        },
      ]
    );
  }, [deleting, handleDeletePlan, plan, saving]);

  const recurringEntries = useMemo(
    () =>
      (isEditing ? draftEntries : entries)
        .sort((a, b) => {
          const dayA = DAY_ORDER[a.day ?? ""] ?? 99;
          const dayB = DAY_ORDER[b.day ?? ""] ?? 99;
          if (dayA !== dayB) return dayA - dayB;
          const instanceA = a.instance_no ?? 99;
          const instanceB = b.instance_no ?? 99;
          if (instanceA !== instanceB) return instanceA - instanceB;
          return (a.start_time ?? "99:99:99").localeCompare(b.start_time ?? "99:99:99");
        }),
    [draftEntries, entries, isEditing]
  );
  const visibleDays = useMemo(
    () =>
      DAY_OPTIONS.filter((day) => recurringEntries.some((entry) => entry.day === day)),
    [recurringEntries]
  );

  const cardBg = c.card;
  const fieldBg = isDark ? "rgba(255,255,255,0.04)" : "#F8FAFC";
  const chipBg = isDark ? "rgba(255,255,255,0.06)" : "#EEF2F7";
  const filledText = c.text;
  const mutedText = c.mutedText;
  const status = statusPalette(plan?.status ?? "draft");
  const subjectLine = plan
    ? plan.subject_code
      ? `${plan.subject_code} · ${plan.subject_title}`
      : plan.subject_title
    : "";

  return (
    <View style={[styles.page, { backgroundColor: c.background }]}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.tint} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
        >
          <View style={styles.headingRow}>
            <View style={styles.headingLeft}>
              <Pressable
                onPress={() => router.back()}
                hitSlop={10}
                style={[styles.backBtn, { borderColor: c.border, backgroundColor: cardBg }]}
              >
                <Ionicons name="chevron-back" size={18} color={c.text} />
              </Pressable>
              <Text style={[styles.pageTitle, { color: c.text }]}>Plan Details</Text>
            </View>
            {plan ? (
              <View style={styles.headerActions}>
                {isEditing ? (
                  <>
                    <Pressable
                      style={[styles.actionBtn, { borderColor: c.border, backgroundColor: cardBg }]}
                      onPress={handleCancelEdit}
                      disabled={saving}
                    >
                      <Text style={[styles.actionText, { color: c.text }]}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.actionPrimary, { backgroundColor: c.tint, borderColor: c.tint, opacity: saving ? 0.7 : 1 }]}
                      onPress={handleSave}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.actionPrimaryText}>Save</Text>
                      )}
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    style={[styles.actionBtn, styles.actionPrimary, { backgroundColor: c.tint, borderColor: c.tint, opacity: deleting ? 0.6 : 1 }]}
                    onPress={handleEdit}
                    disabled={deleting}
                  >
                    <Ionicons name="create-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.actionPrimaryText}>Edit</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>

          {!plan ? (
            <View style={[styles.emptyState, { borderColor: c.border, backgroundColor: cardBg }]}>
              <Ionicons name="document-text-outline" size={28} color={mutedText} />
              <Text style={[styles.emptyText, { color: mutedText }]}>Plan not found.</Text>
            </View>
          ) : (
            <>
              <View style={[styles.heroCard, { backgroundColor: cardBg, borderColor: c.border }]}>
                {isEditing ? (
                  <TextInput
                    value={draft?.title ?? ""}
                    onChangeText={(value) => setDraft((prev) => (prev ? { ...prev, title: value } : prev))}
                    placeholder="Lesson plan name"
                    placeholderTextColor={mutedText}
                    style={[styles.heroTitleInput, { color: filledText, borderColor: c.border, backgroundColor: fieldBg }]}
                  />
                ) : (
                  <Text style={[styles.heroTitle, { color: filledText }]}>{plan.title || "Untitled Plan"}</Text>
                )}
                <View style={styles.heroMetaRow}>
                  <View style={[styles.badge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.badgeText, { color: status.fg }]}>{toTitleCase(plan.status)}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: chipBg }]}>
                    <Ionicons name="calendar-outline" size={11} color={mutedText} />
                    <Text style={[styles.badgeText, { color: mutedText }]}>{toTitleCase(plan.term)}</Text>
                  </View>
                  {plan.academic_year ? (
                    <View style={[styles.badge, { backgroundColor: chipBg }]}>
                      <Text style={[styles.badgeText, { color: mutedText }]}>{plan.academic_year}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.heroSubject, { color: mutedText }]} numberOfLines={1}>{subjectLine}</Text>
                <Text style={[styles.heroLine, { color: mutedText }]} numberOfLines={1}>
                  {plan.section_name}
                  {plan.section_grade_level ? `  ·  Grade ${plan.section_grade_level}` : ""}
                </Text>
                <Text style={[styles.heroLine, { color: mutedText }]} numberOfLines={1}>{plan.school_name}</Text>
                <View style={[styles.heroDivider, { backgroundColor: c.border }]} />
                {isEditing ? (
                  <View style={styles.editGrid}>
                    <View style={styles.editField}>
                      <Text style={[styles.editLabel, { color: mutedText }]}>Academic year</Text>
                      <TextInput
                        value={draft?.academic_year ?? ""}
                        onChangeText={(value) => setDraft((prev) => (prev ? { ...prev, academic_year: value } : prev))}
                        placeholder="2025-2026"
                        placeholderTextColor={mutedText}
                        style={[styles.editInput, { color: filledText, borderColor: c.border, backgroundColor: fieldBg }]}
                      />
                    </View>
                    <View style={styles.editField}>
                      <Text style={[styles.editLabel, { color: mutedText }]}>Term</Text>
                      <Pressable
                        style={[styles.editInput, styles.editPick, { borderColor: c.border, backgroundColor: fieldBg }]}
                        onPress={() =>
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  term:
                                    prev.term === "quarter"
                                      ? "trimester"
                                      : prev.term === "trimester"
                                        ? "semester"
                                        : "quarter",
                                }
                              : prev
                          )
                        }
                      >
                        <Text style={{ color: filledText, ...Typography.body }}>
                          {TERM_OPTIONS.includes((draft?.term ?? "") as (typeof TERM_OPTIONS)[number])
                            ? toTitleCase(draft?.term ?? "")
                            : "Term"}
                        </Text>
                        <Ionicons name="swap-vertical" size={14} color={mutedText} />
                      </Pressable>
                    </View>
                    <View style={styles.editField}>
                      <Text style={[styles.editLabel, { color: mutedText }]}>Start date</Text>
                      <TextInput
                        value={draft?.start_date ?? ""}
                        onChangeText={(value) => setDraft((prev) => (prev ? { ...prev, start_date: value } : prev))}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={mutedText}
                        autoCapitalize="none"
                        style={[styles.editInput, { color: filledText, borderColor: c.border, backgroundColor: fieldBg }]}
                      />
                    </View>
                    <View style={styles.editField}>
                      <Text style={[styles.editLabel, { color: mutedText }]}>End date</Text>
                      <TextInput
                        value={draft?.end_date ?? ""}
                        onChangeText={(value) => setDraft((prev) => (prev ? { ...prev, end_date: value } : prev))}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={mutedText}
                        autoCapitalize="none"
                        style={[styles.editInput, { color: filledText, borderColor: c.border, backgroundColor: fieldBg }]}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.heroDates}>
                    <Ionicons name="time-outline" size={14} color={mutedText} />
                    <Text style={[styles.heroDatesText, { color: filledText }]}>
                      {formatIsoDate(plan.start_date)}  →  {formatIsoDate(plan.end_date)}
                    </Text>
                  </View>
                )}
              </View>

              {!isEditing ? (
                <View style={styles.secondaryActions}>
                  <Pressable
                    style={[styles.secondaryBtn, { borderColor: c.border, backgroundColor: cardBg, opacity: deleting || saving ? 0.5 : 1 }]}
                    onPress={confirmRecreate}
                    disabled={deleting || saving}
                    accessibilityRole="button"
                    accessibilityLabel="Recreate lesson plan"
                  >
                    <Ionicons name="refresh" size={15} color={c.tint} />
                    <Text style={[styles.secondaryBtnText, { color: filledText }]}>Recreate</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryBtn, { borderColor: c.border, backgroundColor: cardBg, opacity: deleting || saving ? 0.5 : 1 }]}
                    onPress={handleDuplicate}
                    disabled={deleting || saving}
                    accessibilityRole="button"
                    accessibilityLabel="Duplicate lesson plan"
                  >
                    <Ionicons name="copy-outline" size={15} color={mutedText} />
                    <Text style={[styles.secondaryBtnText, { color: filledText }]}>Duplicate</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryBtn, { borderColor: c.border, backgroundColor: cardBg, opacity: deleting ? 0.5 : 1 }]}
                    onPress={confirmDeletePlan}
                    disabled={deleting || saving}
                    accessibilityRole="button"
                    accessibilityLabel="Delete lesson plan"
                  >
                    {deleting ? (
                      <ActivityIndicator size="small" color={DANGER} />
                    ) : (
                      <Ionicons name="trash-outline" size={15} color={DANGER} />
                    )}
                    <Text style={[styles.secondaryBtnText, { color: DANGER }]}>Delete</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: c.text }]}>Schedule</Text>
                {isEditing ? (
                  <Text style={[styles.sectionHint, { color: mutedText }]}>Tap a day to add or remove meetings</Text>
                ) : null}
              </View>

              <View style={styles.dayChipRow}>
                {DAY_OPTIONS.map((day) => {
                  const active = recurringEntries.some((entry) => entry.day === day);
                  const chipStyle = [
                    styles.dayChipPill,
                    { borderColor: c.border, backgroundColor: cardBg },
                    active ? { backgroundColor: c.tint, borderColor: c.tint } : undefined,
                  ];
                  const label = (
                    <Text style={[styles.dayChipPillText, { color: active ? "#FFFFFF" : mutedText }]}>
                      {DAY_LABEL[day].slice(0, 3)}
                    </Text>
                  );
                  return isEditing ? (
                    <Pressable key={day} style={chipStyle} onPress={() => toggleDraftDay(day)}>
                      {label}
                    </Pressable>
                  ) : (
                    <View key={day} style={chipStyle}>
                      {label}
                    </View>
                  );
                })}
              </View>

              {visibleDays.map((day) => {
                const rows = recurringEntries.filter((entry) => entry.day === day);
                return (
                  <View key={day} style={[styles.scheduleCard, { backgroundColor: cardBg, borderColor: c.border }]}>
                    <View style={styles.scheduleCardHeader}>
                      <Text style={[styles.dayLabel, { color: filledText }]}>{DAY_LABEL[day]}</Text>
                      {isEditing ? (
                        <Pressable
                          style={[styles.addSlotBtn, { borderColor: c.tint }]}
                          onPress={() => addDraftSchedule(day)}
                        >
                          <Ionicons name="add" size={16} color={c.tint} />
                          <Text style={[styles.addSlotText, { color: c.tint }]}>Slot</Text>
                        </Pressable>
                      ) : (
                        <Text style={[styles.dayCount, { color: mutedText }]}>
                          {rows.length} slot{rows.length === 1 ? "" : "s"}
                        </Text>
                      )}
                    </View>

                    <View style={styles.slotStack}>
                      {rows.map((entry) => {
                        const isLab = entry.room === "laboratory";
                        const accent = isLab ? "#D9534F" : "#2D7BD8";
                        return (
                          <View
                            key={entry.plan_entry_id}
                            style={[styles.instanceWrap, { borderColor: c.border, backgroundColor: fieldBg }]}
                          >
                            <View style={[styles.accentBar, { backgroundColor: accent }]} />
                            <View style={styles.instanceBody}>
                              <View style={styles.instanceHeaderRow}>
                                <Text style={[styles.instanceLabel, { color: mutedText }]}>Slot {entry.instance_no ?? 1}</Text>
                                <View style={styles.instanceHeaderRight}>
                                  <View style={styles.instanceRoomSwitch}>
                                    {(["lecture", "laboratory"] as const).map((roomOption) => {
                                      const selected = (entry.room ?? "lecture") === roomOption;
                                      return (
                                        <Pressable
                                          key={`${entry.plan_entry_id}_${roomOption}`}
                                          disabled={!isEditing}
                                          style={({ pressed }) => [
                                            styles.roomIconChip,
                                            { borderColor: c.border, backgroundColor: cardBg },
                                            selected ? { borderColor: accent, backgroundColor: isLab ? "rgba(217,83,79,0.12)" : "rgba(45,123,216,0.12)" } : undefined,
                                            isEditing && pressed ? styles.pressScale : undefined,
                                          ]}
                                          onPress={() => setEntryField(entry.plan_entry_id, "room", roomOption)}
                                        >
                                          <Ionicons
                                            name={roomOption === "lecture" ? "school-outline" : "flask-outline"}
                                            size={13}
                                            color={selected ? accent : mutedText}
                                          />
                                          {selected ? (
                                            <Text style={[styles.roomChipTextActive, { color: accent }]}>{toTitleCase(roomOption)}</Text>
                                          ) : null}
                                        </Pressable>
                                      );
                                    })}
                                  </View>
                                  {isEditing ? (
                                    <View style={styles.instanceActionRow}>
                                      <Pressable
                                        style={[styles.removeBtn, { borderColor: c.border }]}
                                        onPress={() => duplicateDraftSchedule(entry.plan_entry_id)}
                                      >
                                        <Ionicons name="copy-outline" size={13} color={mutedText} />
                                      </Pressable>
                                      {rows.length > 1 ? (
                                        <Pressable
                                          style={[styles.removeBtn, { borderColor: c.border }]}
                                          onPress={() => removeDraftSchedule(entry.plan_entry_id)}
                                        >
                                          <Ionicons name="close" size={15} color={mutedText} />
                                        </Pressable>
                                      ) : null}
                                    </View>
                                  ) : null}
                                </View>
                              </View>

                              <View style={styles.timeRowCentered}>
                                {isEditing ? (
                                  <>
                                    <TextInput
                                      value={toTimeInput(entry.start_time)}
                                      onChangeText={(value) => setEntryField(entry.plan_entry_id, "start_time", value)}
                                      placeholder="08:00"
                                      placeholderTextColor={mutedText}
                                      autoCapitalize="none"
                                      style={[styles.timeInputEditable, { borderColor: accent, color: filledText, backgroundColor: cardBg }]}
                                    />
                                    <Text style={[styles.toText, { color: mutedText }]}>to</Text>
                                    <TextInput
                                      value={toTimeInput(entry.end_time)}
                                      onChangeText={(value) => setEntryField(entry.plan_entry_id, "end_time", value)}
                                      placeholder="10:00"
                                      placeholderTextColor={mutedText}
                                      autoCapitalize="none"
                                      style={[styles.timeInputEditable, { borderColor: accent, color: filledText, backgroundColor: cardBg }]}
                                    />
                                  </>
                                ) : (
                                  <>
                                    <View style={[styles.timeChip, { borderColor: accent, backgroundColor: cardBg }]}>
                                      <Text style={[styles.timeChipText, { color: filledText }]}>{formatTime(entry.start_time)}</Text>
                                    </View>
                                    <Text style={[styles.toText, { color: mutedText }]}>to</Text>
                                    <View style={[styles.timeChip, { borderColor: accent, backgroundColor: cardBg }]}>
                                      <Text style={[styles.timeChipText, { color: filledText }]}>{formatTime(entry.end_time)}</Text>
                                    </View>
                                  </>
                                )}
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              {recurringEntries.length === 0 ? (
                <View style={[styles.emptyState, { borderColor: c.border, backgroundColor: cardBg }]}>
                  <Ionicons name="calendar-clear-outline" size={24} color={mutedText} />
                  <Text style={[styles.emptyText, { color: mutedText }]}>No schedule yet.</Text>
                </View>
              ) : null}

              <Text style={[styles.sectionTitle, { color: c.text, marginTop: Spacing.sm }]}>Extra Requirements</Text>
              <TextInput
                value={draft?.notes ?? ""}
                onChangeText={(value) => setDraft((prev) => (prev ? { ...prev, notes: value } : prev))}
                editable={isEditing}
                placeholder={isEditing ? "Type notes…" : "No extra requirements."}
                placeholderTextColor={mutedText}
                multiline
                style={[
                  styles.extraBox,
                  {
                    backgroundColor: cardBg,
                    borderColor: c.border,
                    color: (draft?.notes ?? "").trim() ? filledText : mutedText,
                  },
                ]}
              />
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const cardShadow = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 96,
    gap: Spacing.md,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  headingLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, flexShrink: 1 },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.round,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionBtn: {
    height: 34,
    minWidth: 70,
    borderRadius: Radius.round,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
  },
  actionPrimary: { ...cardShadow },
  actionText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  actionPrimaryText: {
    ...Typography.caption,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  pageTitle: { ...Typography.h1 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
  },
  sectionTitle: { ...Typography.h2 },
  sectionHint: { ...Typography.caption, flexShrink: 1, textAlign: "right" },

  emptyState: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.xxl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  emptyText: { ...Typography.body },

  heroCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: 6,
    ...cardShadow,
  },
  heroTitle: { ...Typography.h1, fontSize: 22, lineHeight: 28 },
  heroTitleInput: {
    ...Typography.h1,
    fontSize: 20,
    lineHeight: 26,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.round,
  },
  badgeText: { ...Typography.caption, fontWeight: "600" },
  heroSubject: { ...Typography.body, fontWeight: "600", marginTop: 8 },
  heroLine: { ...Typography.caption },
  heroDivider: { height: 1, marginVertical: 10 },
  heroDates: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroDatesText: { ...Typography.body, fontWeight: "600" },

  editGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  editField: { flexGrow: 1, flexBasis: "46%", gap: 4 },
  editLabel: { ...Typography.caption, fontWeight: "600" },
  editInput: {
    ...Typography.body,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  editPick: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  secondaryActions: { flexDirection: "row", gap: Spacing.sm },
  secondaryBtn: {
    flex: 1,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  secondaryBtnText: { ...Typography.caption, fontWeight: "700" },

  dayChipRow: { flexDirection: "row", gap: 6 },
  dayChipPill: {
    flex: 1,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayChipPillText: { ...Typography.caption, fontWeight: "700" },

  scheduleCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...cardShadow,
  },
  scheduleCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayLabel: { ...Typography.body, fontWeight: "700" },
  dayCount: { ...Typography.caption },
  addSlotBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderRadius: Radius.round,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  addSlotText: { ...Typography.caption, fontWeight: "700" },
  slotStack: { gap: Spacing.sm },
  instanceWrap: {
    borderWidth: 1,
    borderRadius: Radius.md,
    flexDirection: "row",
    overflow: "hidden",
  },
  accentBar: { width: 4 },
  instanceBody: { flex: 1, padding: Spacing.sm, gap: Spacing.sm },
  instanceHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  instanceLabel: { ...Typography.caption, fontWeight: "700" },
  instanceHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  instanceActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  instanceRoomSwitch: {
    flexDirection: "row",
    gap: 4,
  },
  roomIconChip: {
    minHeight: 26,
    minWidth: 26,
    borderRadius: Radius.round,
    borderWidth: 1,
    paddingHorizontal: 7,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  roomChipTextActive: {
    ...Typography.caption,
    fontWeight: "700",
  },
  pressScale: {
    transform: [{ scale: 0.96 }],
  },
  timeRowCentered: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  timeChip: {
    minHeight: 34,
    minWidth: 102,
    borderWidth: 1,
    borderRadius: Radius.round,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  timeInputEditable: {
    ...Typography.caption,
    minHeight: 34,
    minWidth: 102,
    borderWidth: 1,
    borderRadius: Radius.round,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  timeChipText: { ...Typography.caption, fontWeight: "600", textAlign: "center" },
  toText: { ...Typography.caption },
  removeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  extraBox: {
    minHeight: 130,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Typography.body,
    textAlignVertical: "top",
  },
});
