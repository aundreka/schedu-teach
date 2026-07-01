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
import { Radius, Spacing, Typography } from "../../../constants/fonts";
import { useAppTheme } from "../../../context/theme";
import { usePullToRefresh } from "../../../hooks/usePullToRefresh";
import {
  createActivityDocx,
  createActivityPdf,
  getActivityTypeLabel,
  shareLocalFile,
} from "../../../lib/activity-utils";
import { supabase } from "../../../lib/supabase";

type ActivityDetail = {
  activity_id: string;
  title: string;
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

function DownloadButton({
  icon,
  label,
  tint,
  onPress,
  borderColor,
}: {
  icon: "document-outline" | "document-text-outline";
  label: string;
  tint: string;
  onPress: () => void;
  borderColor: string;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.downloadBtn, { borderColor, backgroundColor: tint }, animStyle]}>
      <Pressable
        style={styles.downloadBtnInner}
        onPressIn={() => { scale.value = withTiming(0.95, { duration: 80 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
        onPress={onPress}
      >
        <Ionicons name={icon} size={16} color="#333333" />
        <Text style={styles.downloadBtnText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const ON_TINT = "#111111";

export default function ExamDetailScreen() {
  const { colors: c, scheme } = useAppTheme();
  const params = useLocalSearchParams<{
    activityId?: string | string[];
    subjectId?: string | string[];
  }>();
  const activityId = useMemo(() => readParam(params.activityId), [params.activityId]);
  const subjectId = useMemo(() => readParam(params.subjectId), [params.subjectId]);

  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [editedText, setEditedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [textFocused, setTextFocused] = useState(false);

  // ── Animated border for TextInput focus ──
  const borderAnim = useSharedValue(0);
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: borderAnim.value === 1 ? c.text : scheme === "dark" ? "#444444" : "#E2E2E2",
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

  const loadActivity = useCallback(async () => {
    if (!activityId) {
      setActivity(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("activities")
        .select("activity_id, title, activity_type, scope_summary, generated_text, subject:subjects(code, title)")
        .eq("activity_id", activityId)
        .maybeSingle();
      if (error) throw error;

      if (!data?.activity_id) {
        setActivity(null);
        return;
      }

      const subjectRaw = data.subject;
      const subject = Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw;

      const mapped: ActivityDetail = {
        activity_id: String(data.activity_id),
        title: String(data.title ?? "Untitled Exam"),
        activity_type: data.activity_type ? String(data.activity_type) : null,
        scope_summary: data.scope_summary ? String(data.scope_summary) : null,
        generated_text: data.generated_text ? String(data.generated_text) : null,
        subject_code: subject?.code ? String(subject.code) : null,
        subject_title: subject?.title ? String(subject.title) : null,
      };
      setActivity(mapped);
      setEditedText(mapped.generated_text ?? "");
    } catch {
      setActivity(null);
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const { refreshing, onRefresh } = usePullToRefresh(loadActivity);

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

  async function handleDownload(kind: "pdf" | "docx") {
    if (!activity) return;
    try {
      const subjectLabel = [activity.subject_code, activity.subject_title].filter(Boolean).join(" - ");
      const typeLabel = getActivityTypeLabel((activity.activity_type as any) ?? "");
      const text = editedText.trim();
      if (!text) {
        Alert.alert("Nothing to download", "The exam has no generated content yet.");
        return;
      }
      const path =
        kind === "pdf"
          ? await createActivityPdf({ title: activity.title, subjectLabel, typeLabel, scopeSummary: activity.scope_summary ?? "", text })
          : await createActivityDocx({ title: activity.title, subjectLabel, typeLabel, scopeSummary: activity.scope_summary ?? "", text });
      await shareLocalFile(path);
    } catch (err: any) {
      Alert.alert("Download failed", err?.message ?? "Please try again.");
    }
  }

  const pageBg = useMemo(() => (scheme === "dark" ? c.background : "#F5F6F7"), [c.background, scheme]);
  const cardBg = useMemo(() => (scheme === "dark" ? c.card : "#FFFFFF"), [c.card, scheme]);
  const isDirty = activity !== null && editedText !== (activity.generated_text ?? "");

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: pageBg }]}>
        <ActivityIndicator color={c.text} />
      </View>
    );
  }

  if (!activity) {
    return (
      <View style={[styles.center, { backgroundColor: pageBg }]}>
        <Pressable style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={18} color={c.text} />
        </Pressable>
        <Text style={[styles.emptyText, { color: c.text }]}>Exam not found.</Text>
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
        <Pressable style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={18} color={c.text} />
        </Pressable>

        <Animated.View entering={FadeInDown.duration(280).springify()}>
          <View style={[styles.heroCard, { backgroundColor: cardBg, borderColor: c.border, borderTopColor: "#D95F5F" }]}>
            <Text style={[styles.kicker, { color: c.mutedText }]}>Exam</Text>
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
              <Text style={styles.sectionLabel}>Generated Content</Text>
              {isDirty ? (
                <Animated.View entering={SlideInRight.duration(220).springify()} exiting={SlideOutRight.duration(160)}>
                  <Pressable
                    style={[styles.saveBtn, { backgroundColor: c.tint }, saving && styles.saveBtnDisabled]}
                    onPress={handleSaveText}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={ON_TINT} />
                    ) : (
                      <Text style={[styles.saveBtnText, { color: ON_TINT }]}>Save</Text>
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
                style={[styles.editableText, { color: c.text }]}
                placeholderTextColor={c.mutedText}
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
            tint="#F0F5FF"
            borderColor={c.border}
            onPress={() => handleDownload("docx")}
          />
          <DownloadButton
            icon="document-text-outline"
            label="Download PDF"
            tint="#FFF5F0"
            borderColor={c.border}
            onPress={() => handleDownload("pdf")}
          />
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
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
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#999999",
  },
  emptyText: {
    ...Typography.h3,
    textAlign: "center",
  },
  textInputWrap: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    overflow: "hidden",
  },
  editableText: {
    padding: Spacing.sm,
    minHeight: 280,
    fontSize: 14,
    lineHeight: 22,
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
    color: "#333333",
  },
});
