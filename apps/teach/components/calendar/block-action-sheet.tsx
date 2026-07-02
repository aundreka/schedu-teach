// components/calendar/block-action-sheet.tsx
//
// Warning sheet shown when teacher tries to delete or alter a requirement block
// (written_work, performance_task, exam). Offers three safe exit paths:
//   1. Lessen requirements → navigates to plan_detail for editing
//   2. Delete & regenerate → removes this block, rebalance fills the gap
//   3. Keep it → cancel, no change

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import BottomSheet from "../BottomSheet";
import Toast from "../Toast";
import { useAppTheme } from "../../context/theme";
import { emitLessonPlanRefresh } from "../../lib/lesson-plan-refresh";
import { supabase } from "../../lib/supabase";
import { loadRuntimeData, persistRebalance, snapshotVersion } from "../../lib/rebalance-service";
import { rebalanceDay } from "../../algorithm/07_run";
import type { SessionCategory } from "../../algorithm/00_types";

type Props = {
  visible: boolean;
  blockId: string;
  blockKey: string;
  title: string;
  label: string;
  category: SessionCategory;
  lessonPlanId: string;
  onClose: () => void;
  /** Called after the block was successfully deleted & regenerated */
  onDeleted: () => void;
};

export default function BlockActionSheet({
  visible,
  blockId,
  blockKey,
  title,
  label,
  category,
  lessonPlanId,
  onClose,
  onDeleted,
}: Props) {
  const { colors: c } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; variant: "success" | "error" }>({
    visible: false,
    message: "",
    variant: "success",
  });

  const showToast = useCallback((message: string, variant: "success" | "error" = "success") => {
    setToast({ visible: true, message, variant });
  }, []);

  const handleLessenRequirements = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push({ pathname: "/(tabs)/plans/plan_detail", params: { lessonPlanId, tab: "details" } });
  }, [onClose, lessonPlanId]);

  const handleDeleteAndRegenerate = useCallback(async () => {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    try {
      const data = await loadRuntimeData(lessonPlanId);
      await snapshotVersion(
        lessonPlanId,
        'block_deleted',
        `Deleted ${label}: ${title}`,
        data.slots,
        data.blocks,
      );

      // Delete from DB
      const { error } = await supabase
        .from('blocks')
        .delete()
        .eq('block_id', blockId)
        .eq('lesson_plan_id', lessonPlanId);
      if (error) throw error;

      // Reload and rebalance
      const fresh = await loadRuntimeData(lessonPlanId);
      const rebalResult = rebalanceDay({
        slots: fresh.slots,
        blocks: fresh.blocks,
        lessons: fresh.lessons,
        activities: fresh.activities,
        rules: fresh.rules,
      });
      await persistRebalance(fresh, rebalResult);

      emitLessonPlanRefresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDeleted();
      onClose();
    } catch (err: any) {
      showToast(err?.message ?? "Could not delete block.", "error");
    } finally {
      setBusy(false);
    }
  }, [busy, lessonPlanId, blockId, label, title, onDeleted, onClose, showToast]);

  const isExam = category === 'exam';
  const displayName = `${label}${title ? `: ${title}` : ''}`;

  const CATEGORY_HELP: Partial<Record<SessionCategory, string>> = {
    written_work: 'This will affect your written work requirement count for this term.',
    performance_task: 'This will affect your performance task requirement count for this term.',
    exam: 'Deleting an exam changes the term structure. Go to plan settings to adjust instead.',
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} snapFraction={0.5}>
        <View style={styles.header}>
          <View style={[styles.warningBadge, { backgroundColor: isExam ? c.dangerSoft : c.warningSoft }]}>
            <Ionicons name="warning" size={16} color={isExam ? c.danger : c.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: c.text }]}>{"Delete \""}{displayName}{"\"?"}</Text>
            <Text style={[styles.subtitle, { color: c.mutedText }]}>
              {CATEGORY_HELP[category] ?? "This block will be removed from your schedule."}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={c.faintText} />
          </Pressable>
        </View>

        <View style={styles.optionsBlock}>
          {/* Option 1: Lessen requirements */}
          <Pressable
            onPress={handleLessenRequirements}
            style={[styles.option, { backgroundColor: c.surfaceAlt }]}
            accessibilityRole="button"
            accessibilityLabel="Adjust requirements. Edit requirement counts in plan settings; the schedule regenerates to match."
          >
            <View style={[styles.optionIcon, { backgroundColor: c.infoSoft }]}>
              <Ionicons name="settings-outline" size={18} color={c.info} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: c.text }]}>Adjust requirements</Text>
              <Text style={[styles.optionDesc, { color: c.mutedText }]}>
                Edit requirement counts in plan settings. The schedule regenerates to match.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.faintText} />
          </Pressable>

          {/* Option 2: Delete & regenerate (not for exam) */}
          {!isExam ? (
            <Pressable
              onPress={handleDeleteAndRegenerate}
              style={[styles.option, { backgroundColor: c.surfaceAlt }]}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Delete and regenerate. Removes this block and rebalances the schedule to fill the gap elsewhere."
              accessibilityState={{ disabled: busy }}
            >
              <View style={[styles.optionIcon, { backgroundColor: c.warningSoft }]}>
                {busy ? (
                  <ActivityIndicator size="small" color={c.warning} />
                ) : (
                  <Ionicons name="refresh" size={18} color={c.warning} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, { color: c.text }]}>Delete & regenerate</Text>
                <Text style={[styles.optionDesc, { color: c.mutedText }]}>
                  Removes this block and rebalances the schedule to fill the gap elsewhere.
                </Text>
              </View>
              {!busy ? <Ionicons name="chevron-forward" size={16} color={c.faintText} /> : null}
            </Pressable>
          ) : null}

          {/* Option 3: Keep it */}
          <Pressable
            onPress={onClose}
            style={[styles.option, { backgroundColor: c.surfaceAlt }]}
            accessibilityRole="button"
            accessibilityLabel="Keep it. No changes; the block stays in the schedule."
          >
            <View style={[styles.optionIcon, { backgroundColor: c.tintSoft }]}>
              <Ionicons name="checkmark-circle-outline" size={18} color={c.tintDeep} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: c.text }]}>Keep it</Text>
              <Text style={[styles.optionDesc, { color: c.mutedText }]}>No changes. The block stays in the schedule.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.faintText} />
          </Pressable>
        </View>
      </BottomSheet>

      <Toast
        visible={toast.visible}
        message={toast.message}
        variant={toast.variant}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  warningBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },
  optionsBlock: {
    paddingHorizontal: 20,
    gap: 4,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    marginBottom: 6,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  optionDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
});
