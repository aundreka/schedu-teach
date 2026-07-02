import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import Animated, {
  FadeInDown,
  SlideInRight,
  SlideOutRight,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Radius, Spacing, Typography } from "../../constants/fonts";
import { useAppTheme } from "../../context/theme";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import {
  createActivityDocx,
  createActivityPdf,
  getActivityTypeLabel,
  shareLocalFile,
} from "../../lib/activity-utils";
import { supabase } from "../../lib/supabase";
import { ErrorState } from "../ui";

/**
 * Shared detail screen for library written-work / performance-task / exam
 * items. Two data modes:
 *  - block mode (plan entries from the blocks table, ww/pt only)
 *  - activity mode (generated activities with editable text + DOCX/PDF export)
 */

export type ActivityDetailKind = "written_work" | "performance_task" | "exam";

// The generated-document area is intentionally rendered as a white "paper"
// sheet with dark ink in BOTH color schemes — it previews the exported
// DOCX/PDF. Do not theme these.
const PAPER_BG = "#FFFFFF";
const PAPER_TEXT = "#1F2937";
const PAPER_PLACEHOLDER = "#9CA3AF";

type KindConfig = {
  /** Key into c.category for the hero top-border accent. */
  categoryToken: "writtenWork" | "performanceTask" | "exam";
  /** Title-case fallback for kickers ("Written Work" / "Performance Task" / "Exam"). */
  fallbackLabel: string;
  /** Exams only exist as generated activities — no plan-entry (block) mode. */
  hasBlockMode: boolean;
  activityNotFoundText: string;
  blockNotFoundText: string;
  emptyDownloadText: string;
  untitledActivityTitle: string;
  untitledBlockTitle: string;
};

const KIND_CONFIG: Record<ActivityDetailKind, KindConfig> = {
  written_work: {
    categoryToken: "writtenWork",
    fallbackLabel: "Written Work",
    hasBlockMode: true,
    activityNotFoundText: "Activity not found.",
    blockNotFoundText: "Item not found.",
    emptyDownloadText: "The activity has no generated content yet.",
    untitledActivityTitle: "Untitled Activity",
    untitledBlockTitle: "Untitled Written Work",
  },
  performance_task: {
    categoryToken: "performanceTask",
    fallbackLabel: "Performance Task",
    hasBlockMode: true,
    activityNotFoundText: "Activity not found.",
    blockNotFoundText: "Performance task not found.",
    emptyDownloadText: "The activity has no generated content yet.",
    untitledActivityTitle: "Untitled Activity",
    untitledBlockTitle: "Untitled Performance Task",
  },
  exam: {
    categoryToken: "exam",
    fallbackLabel: "Exam",
    hasBlockMode: false,
    activityNotFoundText: "Exam not found.",
    blockNotFoundText: "Exam not found.",
    emptyDownloadText: "The exam has no generated content yet.",
    untitledActivityTitle: "Untitled Exam",
    untitledBlockTitle: "Untitled Exam",
  },
};

// ─── Block mode (plan entries from blocks table) ─────────────────────────────

type BlockEntryDetail = {
  plan_entry_id: string;
  title: string;
  description: string | null;
  session_category: string | null;
  session_subcategory: string | null;
  scheduled_date: string | null;
  day: string | null;
  start_time: string | null;
  end_time: string | null;
  lesson_title: string | null;
};

// ─── Activity mode (generated activities from activities table) ──────────────

type ActivityDetail = {
  activity_id: string;
  title: string;
  category: string | null;
  activity_type: string | null;
  scope_summary: string | null;
  generated_text: string | null;
  subject_code: string | null;
  subject_title: string | null;
};

function readParam(value?: string | string[]) {
  if (!value) return "";
  return Array.isArray(value) ? String(value[0] ?? "") : String(value);
}

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value: string | null) {
  if (!value) return null;
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw ?? "0");
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const meridiem = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function toTitleCase(value: string | null, fallback: string) {
  if (!value) return fallback;
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveKicker(entry: BlockEntryDetail, fallback: string) {
  if (entry.session_category === "exam") {
    return entry.session_subcategory ? toTitleCase(entry.session_subcategory, fallback) : "Exam";
  }
  return toTitleCase(entry.session_subcategory, fallback);
}

function DownloadButton({
  icon,
  label,
  bg,
  fg,
  onPress,
  borderColor,
}: {
  icon: "document-outline" | "document-text-outline";
  label: string;
  bg: string;
  fg: string;
  onPress: () => void;
  borderColor: string;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.downloadBtn, { borderColor, backgroundColor: bg }, animStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.downloadBtnInner}
        onPressIn={() => { scale.value = withTiming(0.95, { duration: 80 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
        onPress={onPress}
      >
        <Ionicons name={icon} size={16} color={fg} />
        <Text style={[styles.downloadBtnText, { color: fg }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function ActivityDetailScreen({ kind }: { kind: ActivityDetailKind }) {
  const config = KIND_CONFIG[kind];
  const { colors: c, scheme } = useAppTheme();
  const accent = c.category[config.categoryToken].base;
  const params = useLocalSearchParams<{
    planEntryId?: string | string[];
    subjectId?: string | string[];
    activityId?: string | string[];
  }>();
  const planEntryId = useMemo(() => readParam(params.planEntryId), [params.planEntryId]);
  const subjectId = useMemo(() => readParam(params.subjectId), [params.subjectId]);
  const activityId = useMemo(() => readParam(params.activityId), [params.activityId]);

  // Exams only ever render generated activities; ww/pt switch on the param.
  const isActivityMode = !config.hasBlockMode || Boolean(activityId);

  // ── Block mode state ──
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<BlockEntryDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Activity mode state ──
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [editedText, setEditedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [textFocused, setTextFocused] = useState(false);

  // ── Animated border for the paper TextInput focus ──
  const borderAnim = useSharedValue(0);
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: borderAnim.value === 1 ? c.tint : c.border,
  }));

  useEffect(() => {
    borderAnim.value = withTiming(textFocused ? 1 : 0, { duration: 180 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textFocused]);

  const handleBack = useCallback(() => {
    if (subjectId) {
      router.replace({
        pathname: "/library/subject_detail" as any,
        params: { subjectId },
      });
      return;
    }
    router.back();
  }, [subjectId]);

  // ── Block mode loader ──
  const loadEntry = useCallback(async () => {
    if (isActivityMode) return;
    if (!planEntryId) {
      setEntry(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      let data: any = null;
      if (kind === "written_work") {
        const { data: row, error } = await supabase
          .from("blocks")
          .select("block_id, title, description, session_category, session_subcategory, lesson_id, slot:slots(slot_date, weekday, start_time, end_time)")
          .eq("block_id", planEntryId)
          .maybeSingle();
        if (error) throw error;
        // This screen is for written-work blocks only. Without this guard it
        // would happily render an exam/lesson/performance-task block routed
        // here by id.
        if (row?.session_category !== "written_work") data = null;
        else data = row;
      } else {
        const { data: row, error } = await supabase
          .from("blocks")
          .select("block_id, title, description, session_subcategory, lesson_id, slot:slots(slot_date, weekday, start_time, end_time)")
          .eq("block_id", planEntryId)
          .eq("session_category", "performance_task")
          .maybeSingle();
        if (error) throw error;
        data = row;
      }

      if (!data?.block_id) {
        setEntry(null);
        return;
      }

      const slotRaw = data?.slot;
      const slot = Array.isArray(slotRaw) ? slotRaw[0] : slotRaw;

      setEntry({
        plan_entry_id: String(data.block_id),
        title: String(data.title ?? config.untitledBlockTitle),
        description: data?.description ? String(data.description) : null,
        session_category: data?.session_category ? String(data.session_category) : null,
        session_subcategory: data?.session_subcategory ? String(data.session_subcategory) : null,
        scheduled_date: slot?.slot_date ? String(slot.slot_date) : null,
        day: slot?.weekday ? String(slot.weekday) : null,
        start_time: slot?.start_time ? String(slot.start_time) : null,
        end_time: slot?.end_time ? String(slot.end_time) : null,
        lesson_title: null,
      });
    } catch (err: any) {
      setEntry(null);
      setLoadError(err?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [planEntryId, isActivityMode, kind, config.untitledBlockTitle]);

  // ── Activity mode loader ──
  const loadActivity = useCallback(async () => {
    if (!isActivityMode) return;
    if (!activityId) {
      setActivity(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const selectColumns =
        kind === "exam"
          ? "activity_id, title, activity_type, scope_summary, generated_text, subject:subjects(code, title)"
          : "activity_id, title, category, activity_type, scope_summary, generated_text, subject:subjects(code, title)";
      const { data, error } = await supabase
        .from("activities")
        .select(selectColumns)
        .eq("activity_id", activityId)
        .maybeSingle();
      if (error) throw error;

      const row = data as any;
      if (!row?.activity_id) {
        setActivity(null);
        return;
      }

      const subjectRaw = row.subject;
      const subject = Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw;

      const mapped: ActivityDetail = {
        activity_id: String(row.activity_id),
        title: String(row.title ?? config.untitledActivityTitle),
        category: kind === "exam" ? "exam" : String(row.category ?? kind),
        activity_type: row.activity_type ? String(row.activity_type) : null,
        scope_summary: row.scope_summary ? String(row.scope_summary) : null,
        generated_text: row.generated_text ? String(row.generated_text) : null,
        subject_code: subject?.code ? String(subject.code) : null,
        subject_title: subject?.title ? String(subject.title) : null,
      };
      setActivity(mapped);
      setEditedText(mapped.generated_text ?? "");
    } catch (err: any) {
      setActivity(null);
      setLoadError(err?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [activityId, isActivityMode, kind, config.untitledActivityTitle]);

  useEffect(() => {
    if (isActivityMode) {
      loadActivity();
    } else {
      loadEntry();
    }
  }, [isActivityMode, loadActivity, loadEntry]);

  const { refreshing, onRefresh } = usePullToRefresh(isActivityMode ? loadActivity : loadEntry);

  async function handleSaveText() {
    if (!activity) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("activities")
        .update({ generated_text: editedText })
        .eq("activity_id", activity.activity_id);
      if (error) throw error;
      setActivity((prev) => (prev ? { ...prev, generated_text: editedText } : prev));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Save failed", err?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload(downloadKind: "pdf" | "docx") {
    if (!activity) return;
    try {
      const subjectLabel = [activity.subject_code, activity.subject_title].filter(Boolean).join(" - ");
      const typeLabel = getActivityTypeLabel((activity.activity_type as any) ?? "");
      const text = editedText.trim();
      if (!text) {
        Alert.alert("Nothing to download", config.emptyDownloadText);
        return;
      }
      const path =
        downloadKind === "pdf"
          ? await createActivityPdf({ title: activity.title, subjectLabel, typeLabel, scopeSummary: activity.scope_summary ?? "", text })
          : await createActivityDocx({ title: activity.title, subjectLabel, typeLabel, scopeSummary: activity.scope_summary ?? "", text });
      await shareLocalFile(path);
    } catch (err: any) {
      Alert.alert("Download failed", err?.message ?? "Please try again.");
    }
  }

  const pageBg = useMemo(() => (scheme === "dark" ? c.background : c.surfaceAlt), [c.background, c.surfaceAlt, scheme]);
  const cardBg = c.card;
  const scheduleText = useMemo(() => {
    if (!entry) return "";
    const start = formatTime(entry.start_time);
    const end = formatTime(entry.end_time);
    if (start && end) return `${start} - ${end}`;
    return start || end || "No time set";
  }, [entry]);

  const isDirty = activity !== null && editedText !== (activity.generated_text ?? "");

  const backButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={styles.backBtn}
      onPress={handleBack}
    >
      <Ionicons name="arrow-back" size={18} color={c.text} />
    </Pressable>
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: pageBg }]}>
        <ActivityIndicator color={c.text} />
      </View>
    );
  }

  // Honest failure: never render "not found" for a network/query error.
  if (loadError) {
    return (
      <View style={[styles.errorPage, { backgroundColor: pageBg }]}>
        {backButton}
        <View style={styles.center}>
          <ErrorState
            title={`Couldn't load this ${config.fallbackLabel.toLowerCase()}`}
            onRetry={() => void (isActivityMode ? loadActivity() : loadEntry())}
          />
        </View>
      </View>
    );
  }

  // ── Activity mode render ──
  if (isActivityMode) {
    if (!activity) {
      return (
        <View style={[styles.center, { backgroundColor: pageBg }]}>
          {backButton}
          <Text style={[styles.emptyText, { color: c.text }]}>{config.activityNotFoundText}</Text>
        </View>
      );
    }

    const subjectLabel = [activity.subject_code, activity.subject_title].filter(Boolean).join(" - ");

    return (
      <KeyboardAvoidingView
        style={[styles.page, { backgroundColor: pageBg }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} />}
        >
          {backButton}

          <Animated.View entering={FadeInDown.duration(280).springify()}>
            <View style={[styles.heroCard, { backgroundColor: cardBg, borderColor: c.border, borderTopColor: accent }]}>
              <Text style={[styles.kicker, { color: c.mutedText }]}>
                {kind === "exam" ? "Exam" : toTitleCase(activity.activity_type, config.fallbackLabel)}
              </Text>
              <Text style={[styles.title, { color: c.text }]}>{activity.title}</Text>
              {subjectLabel ? (
                <Text style={[styles.meta, { color: c.mutedText }]}>{subjectLabel}</Text>
              ) : null}
              {activity.scope_summary ? (
                <Text style={[styles.meta, { color: c.mutedText }]}>Coverage: {activity.scope_summary}</Text>
              ) : null}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(320).delay(80).springify()}>
            <View style={[styles.sectionCard, { backgroundColor: cardBg, borderColor: c.border }]}>
              <View style={styles.sectionHeader}>
                <Text accessibilityRole="header" style={[styles.sectionLabel, { color: c.mutedText }]}>
                  Generated Content
                </Text>
                {isDirty ? (
                  <Animated.View entering={SlideInRight.duration(220).springify()} exiting={SlideOutRight.duration(160)}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Save changes"
                      style={[styles.saveBtn, { backgroundColor: c.tint }, saving && styles.saveBtnDisabled]}
                      onPress={handleSaveText}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color={c.onTint} />
                      ) : (
                        <Text style={[styles.saveBtnText, { color: c.onTint }]}>Save</Text>
                      )}
                    </Pressable>
                  </Animated.View>
                ) : null}
              </View>
              <Animated.View style={[styles.textInputWrap, borderStyle]}>
                <TextInput
                  value={editedText}
                  onChangeText={setEditedText}
                  onFocus={() => setTextFocused(true)}
                  onBlur={() => setTextFocused(false)}
                  multiline
                  style={styles.editableText}
                  placeholderTextColor={PAPER_PLACEHOLDER}
                  placeholder="No content generated yet."
                  textAlignVertical="top"
                />
              </Animated.View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(300).delay(160).springify()} style={styles.downloadRow}>
            <DownloadButton
              icon="document-outline"
              label="Download DOCX"
              bg={c.infoSoft}
              fg={c.info}
              borderColor={c.border}
              onPress={() => handleDownload("docx")}
            />
            <DownloadButton
              icon="document-text-outline"
              label="Download PDF"
              bg={c.dangerSoft}
              fg={c.danger}
              borderColor={c.border}
              onPress={() => handleDownload("pdf")}
            />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Block mode render ──
  if (!entry) {
    return (
      <View style={[styles.center, { backgroundColor: pageBg }]}>
        {backButton}
        <Text style={[styles.emptyText, { color: c.text }]}>{config.blockNotFoundText}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: pageBg }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} />}
      >
        {backButton}

        <View style={[styles.heroCard, { backgroundColor: cardBg, borderColor: c.border, borderTopColor: accent }]}>
          <Text style={[styles.kicker, { color: c.mutedText }]}>{resolveKicker(entry, config.fallbackLabel)}</Text>
          <Text style={[styles.title, { color: c.text }]}>{entry.title}</Text>
          {entry.lesson_title ? (
            <Text style={[styles.meta, { color: c.mutedText }]}>Lesson: {entry.lesson_title}</Text>
          ) : null}
          <Text style={[styles.meta, { color: c.mutedText }]}>Date: {formatDate(entry.scheduled_date)}</Text>
          <Text style={[styles.meta, { color: c.mutedText }]}>
            Day: {entry.day ? toTitleCase(entry.day, "Not set") : "Not set"}
          </Text>
          <Text style={[styles.meta, { color: c.mutedText }]}>Time: {scheduleText}</Text>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: cardBg, borderColor: c.border }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: c.text }]}>Description</Text>
          <Text style={[styles.body, { color: c.text }]}>
            {entry.description?.trim() || "No description added yet."}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.md,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  errorPage: {
    flex: 1,
    padding: Spacing.lg,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  heroCard: {
    borderWidth: 1,
    borderTopWidth: 3,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: 10,
  },
  kicker: {
    ...Typography.label,
    textTransform: "uppercase",
  },
  title: {
    ...Typography.h1,
  },
  meta: {
    ...Typography.body,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionLabel: {
    ...Typography.label,
    textTransform: "uppercase",
  },
  sectionTitle: {
    ...Typography.h3,
  },
  body: {
    ...Typography.body,
    lineHeight: 22,
  },
  emptyText: {
    ...Typography.h3,
    textAlign: "center",
  },
  textInputWrap: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    overflow: "hidden",
    backgroundColor: PAPER_BG,
  },
  editableText: {
    padding: Spacing.sm,
    minHeight: 280,
    fontSize: 14,
    lineHeight: 22,
    color: PAPER_TEXT,
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 60,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.55,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  downloadRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  downloadBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    overflow: "hidden",
    minHeight: 46,
  },
  downloadBtnInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 46,
    paddingHorizontal: 8,
  },
  downloadBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
