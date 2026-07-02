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
import { useAppTheme } from "../../context/theme";
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
  const { colors: c } = useAppTheme();

  // Category tokens for the fill-option chips, keyed by the scheduler's kind.
  const kindColors = useMemo<Record<string, { bg: string; text: string }>>(
    () => ({
      written_work: { bg: c.category.writtenWork.soft, text: c.category.writtenWork.onSoft },
      performance_task: { bg: c.category.performanceTask.soft, text: c.category.performanceTask.onSoft },
      buffer: { bg: c.category.buffer.soft, text: c.category.buffer.onSoft },
    }),
    [c],
  );

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
          <View style={[styles.headerDot, { backgroundColor: c.tint }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: c.text }]}>
              {totalCount} open session{totalCount !== 1 ? "s" : ""}
            </Text>
            <Text style={[styles.subtitle, { color: c.mutedText }]}>
              Your schedule has empty slots. Fill them or skip.
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={c.faintText} />
          </Pressable>
        </View>

        {suggestions.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="checkmark-circle" size={36} color={c.tint} />
            <Text style={[styles.empty, { color: c.mutedText }]}>All slots are filled!</Text>
          </View>
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {suggestions.map((sug) => {
              const activeChoice = choices[sug.slot_key];
              return (
                <View key={sug.slot_key} style={[styles.suggestionCard, { borderBottomColor: c.hairline }]}>
                  <Text style={[styles.suggestionDate, { color: c.text }]}>{formatDate(sug.slot_date)}</Text>
                  <Text style={[styles.placementLabel, { color: c.faintText }]}>
                    {sug.placement.replace(/_/g, " ")}
                  </Text>
                  <View style={styles.optionRow}>
                    {sug.options.map((opt, oi) => {
                      const palette = kindColors[opt.kind] ?? { bg: c.surfaceAlt, text: c.text };
                      const isActive =
                        activeChoice &&
                        activeChoice.kind === opt.kind &&
                        activeChoice.subcategory === opt.subcategory;
                      return (
                        <Pressable
                          key={oi}
                          onPress={() => pickOption(sug.slot_key, opt)}
                          accessibilityRole="button"
                          accessibilityLabel={opt.label}
                          accessibilityState={{ selected: Boolean(isActive) }}
                          style={[
                            styles.optionChip,
                            { borderColor: isActive ? palette.text : c.border, backgroundColor: isActive ? palette.bg : c.card },
                          ]}
                        >
                          <Ionicons
                            name={KIND_ICONS[opt.kind] ?? "bookmark"}
                            size={13}
                            color={isActive ? palette.text : c.faintText}
                          />
                          <Text
                            style={[styles.optionLabel, { color: isActive ? palette.text : c.mutedText }]}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => skipSlot(sug.slot_key)}
                      accessibilityRole="button"
                      accessibilityLabel="Skip this slot"
                      accessibilityState={{ selected: !activeChoice }}
                      style={[
                        styles.optionChip,
                        { borderColor: !activeChoice ? c.mutedText : c.border },
                      ]}
                    >
                      <Text style={[styles.optionLabel, { color: !activeChoice ? c.text : c.faintText }]}>
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
          <Pressable
            onPress={onClose}
            style={[styles.cancelBtn, { borderColor: c.border }]}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Skip all"
          >
            <Text style={[styles.cancelText, { color: c.mutedText }]}>Skip all</Text>
          </Pressable>
          <Pressable
            onPress={handleFill}
            disabled={saving || filledCount === 0}
            accessibilityRole="button"
            accessibilityLabel="Fill selected slots"
            style={[
              styles.fillBtn,
              { backgroundColor: c.tint, opacity: saving || filledCount === 0 ? 0.5 : 1 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={c.onTint} size="small" />
            ) : (
              <Text style={[styles.fillText, { color: c.onTint }]}>
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
    marginTop: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 1,
  },
  center: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 8,
  },
  empty: {
    fontSize: 14,
  },
  list: {
    maxHeight: 340,
    paddingHorizontal: 20,
  },
  suggestionCard: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  suggestionDate: {
    fontSize: 14,
    fontWeight: "700",
  },
  placementLabel: {
    fontSize: 11,
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
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "700",
  },
  fillBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fillText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
