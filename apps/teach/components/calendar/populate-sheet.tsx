// components/calendar/populate-sheet.tsx
//
// Vacancy filler — shown after plan creation or unsuspension when there are
// open session slots. Teacher reviews suggestions and picks what to fill each
// slot with (written work, performance task, buffer, or skip).

import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import BottomSheet from "../BottomSheet";
import Toast from "../Toast";
import { runRepopulate } from "../../lib/rebalance-service";
import { emitLessonPlanRefresh } from "../../lib/lesson-plan-refresh";
import type {
  RepopulateChoice,
  RepopulateOption,
  SlotKey,
  VacancyReport,
  VacancySuggestion,
} from "../../algorithm/00_types";

function formatDate(isoDate: string): string {
  const [y, mo, d] = isoDate.split("-").map(Number);
  const date = new Date(y, (mo ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const KIND_COLORS: Record<string, { bg: string; text: string }> = {
  written_work: { bg: "#EFF6FF", text: "#1D4ED8" },
  performance_task: { bg: "#F0FDF4", text: "#15803D" },
  buffer: { bg: "#F5F3FF", text: "#6D28D9" },
};

const KIND_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  written_work: "pencil",
  performance_task: "medal",
  buffer: "bookmark",
};

type FillChoice = RepopulateChoice | null; // null = skip

type Props = {
  visible: boolean;
  planId: string | null;
  vacancies: VacancyReport[];
  onClose: () => void;
  onDone: () => void;
};

export default function PopulateSheet({ visible, planId, vacancies, onClose, onDone }: Props) {
  // Flatten suggestions from all vacancy reports
  const suggestions = useMemo<VacancySuggestion[]>(
    () => vacancies.flatMap((r) => r.suggestions),
    [vacancies],
  );

  // choices[slotKey] = selected option, or null for "skip"
  const [choices, setChoices] = useState<Record<string, FillChoice>>(() => {
    const initial: Record<string, FillChoice> = {};
    for (const s of suggestions) {
      const recommended = s.options[s.recommended_index] ?? s.options[0];
      if (recommended) {
        initial[s.slot_key] = {
          slot_key: s.slot_key as SlotKey,
          kind: recommended.kind,
          subcategory: recommended.subcategory,
        };
      } else {
        initial[s.slot_key] = null;
      }
    }
    return initial;
  });

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; variant: "success" | "error" }>({
    visible: false,
    message: "",
    variant: "success",
  });

  const showToast = useCallback((message: string, variant: "success" | "error" = "success") => {
    setToast({ visible: true, message, variant });
  }, []);

  const pickOption = useCallback((slotKey: string, option: RepopulateOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChoices((prev) => ({
      ...prev,
      [slotKey]: { slot_key: slotKey as SlotKey, kind: option.kind, subcategory: option.subcategory },
    }));
  }, []);

  const skipSlot = useCallback((slotKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChoices((prev) => ({ ...prev, [slotKey]: null }));
  }, []);

  const handleFill = useCallback(async () => {
    if (!planId || saving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      const finalChoices = Object.values(choices).filter((c): c is RepopulateChoice => c !== null);
      if (finalChoices.length === 0) {
        onClose();
        return;
      }
      await runRepopulate(planId, finalChoices);
      emitLessonPlanRefresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
      onClose();
    } catch (err: any) {
      showToast(err?.message ?? "Could not fill slots.", "error");
    } finally {
      setSaving(false);
    }
  }, [planId, saving, choices, onClose, onDone, showToast]);

  const filledCount = Object.values(choices).filter(Boolean).length;
  const totalCount = suggestions.length;

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} snapFraction={0.68}>
        <View style={styles.header}>
          <View style={styles.headerDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              {totalCount} open session{totalCount !== 1 ? "s" : ""}
            </Text>
            <Text style={styles.subtitle}>
              Your schedule has empty slots. Fill them or skip.
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color="#9CA3AF" />
          </Pressable>
        </View>

        {suggestions.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="checkmark-circle" size={36} color="#10B981" />
            <Text style={styles.empty}>All slots are filled!</Text>
          </View>
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {suggestions.map((sug) => {
              const activeChoice = choices[sug.slot_key];
              return (
                <View key={sug.slot_key} style={styles.suggestionCard}>
                  <Text style={styles.suggestionDate}>{formatDate(sug.slot_date)}</Text>
                  <Text style={styles.placementLabel}>
                    {sug.placement.replace(/_/g, " ")}
                  </Text>
                  <View style={styles.optionRow}>
                    {sug.options.map((opt, oi) => {
                      const palette = KIND_COLORS[opt.kind] ?? { bg: "#F9FAFB", text: "#374151" };
                      const isActive =
                        activeChoice &&
                        activeChoice.kind === opt.kind &&
                        activeChoice.subcategory === opt.subcategory;
                      return (
                        <Pressable
                          key={oi}
                          onPress={() => pickOption(sug.slot_key, opt)}
                          style={[
                            styles.optionChip,
                            { borderColor: isActive ? palette.text : "#E5E7EB", backgroundColor: isActive ? palette.bg : "#FFFFFF" },
                          ]}
                        >
                          <Ionicons
                            name={KIND_ICONS[opt.kind] ?? "bookmark"}
                            size={13}
                            color={isActive ? palette.text : "#9CA3AF"}
                          />
                          <Text
                            style={[styles.optionLabel, { color: isActive ? palette.text : "#6B7280" }]}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => skipSlot(sug.slot_key)}
                      style={[
                        styles.optionChip,
                        { borderColor: !activeChoice ? "#6B7280" : "#E5E7EB" },
                      ]}
                    >
                      <Text style={[styles.optionLabel, { color: !activeChoice ? "#374151" : "#9CA3AF" }]}>
                        Skip
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <Pressable onPress={onClose} style={styles.cancelBtn} disabled={saving}>
            <Text style={styles.cancelText}>Skip all</Text>
          </Pressable>
          <Pressable
            onPress={handleFill}
            disabled={saving || filledCount === 0}
            style={[styles.fillBtn, (saving || filledCount === 0) && styles.fillBtnDisabled]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.fillText}>
                Fill {filledCount > 0 ? `${filledCount} slot${filledCount > 1 ? "s" : ""}` : "slots"}
              </Text>
            )}
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
    paddingBottom: 8,
  },
  headerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#3B82F6",
    marginTop: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 1,
  },
  center: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 8,
  },
  empty: {
    color: "#6B7280",
    fontSize: 14,
  },
  list: {
    maxHeight: 340,
    paddingHorizontal: 20,
  },
  suggestionCard: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  suggestionDate: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  placementLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 1,
    marginBottom: 8,
    textTransform: "capitalize",
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  optionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 30,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#6B7280",
  },
  fillBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  fillBtnDisabled: {
    backgroundColor: "#BFDBFE",
  },
  fillText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
