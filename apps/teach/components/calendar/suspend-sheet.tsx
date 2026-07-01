// components/calendar/suspend-sheet.tsx
//
// Slot-level suspension picker. Teacher sees every recurring class slot on a
// given date and can toggle individual ones (or all) as suspended. Confirming
// inserts school_calendar_events rows and triggers rebalanceDay() via
// rebalance-service.ts so blocks automatically compress.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import BottomSheet from "../BottomSheet";
import Toast from "../Toast";
import { getSlotsForDay, suspendSlots, unsuspendSlot, type SlotSuspensionInfo } from "../../lib/rebalance-service";
import { emitLessonPlanRefresh } from "../../lib/lesson-plan-refresh";

function formatTime12(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr ?? 0);
  const m = String(mStr ?? "00");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDate(isoDate: string): string {
  const [y, mo, d] = isoDate.split("-").map(Number);
  const date = new Date(y, (mo ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

type Props = {
  visible: boolean;
  planId: string | null;
  dateISO: string;
  onClose: () => void;
  onDone: (displaced: number, vacancies: number) => void;
};

export default function SuspendSheet({ visible, planId, dateISO, onClose, onDone }: Props) {
  const [slots, setSlots] = useState<SlotSuspensionInfo[]>([]);
  const [selected, setSelected] = useState<Set<string | null>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; variant: "success" | "warning" | "error" }>({
    visible: false,
    message: "",
    variant: "success",
  });

  const showToast = useCallback((message: string, variant: "success" | "warning" | "error" = "success") => {
    setToast({ visible: true, message, variant });
  }, []);

  useEffect(() => {
    if (!visible || !planId) return;
    setLoading(true);
    getSlotsForDay(planId, dateISO)
      .then((data) => {
        setSlots(data);
        // Pre-select already suspended slots
        const preSelected = new Set<string | null>(
          data.filter((s) => s.isSuspended).map((s) => s.seriesKey),
        );
        setSelected(preSelected);
      })
      .catch(() => showToast("Could not load slots for this day.", "error"))
      .finally(() => setLoading(false));
  }, [visible, planId, dateISO, showToast]);

  const toggleSlot = useCallback((seriesKey: string | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seriesKey)) next.delete(seriesKey);
      else next.add(seriesKey);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!planId || saving) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setSaving(true);
    try {
      const toSuspend: SlotSuspensionInfo[] = [];
      const toUnsuspend: SlotSuspensionInfo[] = [];

      for (const slot of slots) {
        const wantSuspended = selected.has(slot.seriesKey);
        const isSuspended = slot.isSuspended;
        if (wantSuspended && !isSuspended) toSuspend.push(slot);
        if (!wantSuspended && isSuspended) toUnsuspend.push(slot);
      }

      let totalDisplaced = 0;
      let totalVacancies = 0;

      // Suspend new ones
      if (toSuspend.length > 0) {
        const suspendKeys = toSuspend.map((s) => s.seriesKey).filter((k): k is string => k !== null);
        const result = await suspendSlots(planId, suspendKeys, dateISO);
        totalDisplaced += result.displaced.length;
        totalVacancies += result.vacancies.reduce((sum, r) => sum + r.excess_slots, 0);
      }

      // Unsuspend removed ones
      for (const slot of toUnsuspend) {
        const result = await unsuspendSlot(planId, slot.seriesKey, dateISO);
        totalVacancies += result.vacancies.reduce((sum, r) => sum + r.excess_slots, 0);
      }

      emitLessonPlanRefresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone(totalDisplaced, totalVacancies);
      onClose();
    } catch (err: any) {
      showToast(err?.message ?? "Could not update suspensions.", "error");
    } finally {
      setSaving(false);
    }
  }, [planId, saving, slots, selected, dateISO, onDone, onClose, showToast]);

  const allSelected = slots.length > 0 && slots.every((s) => selected.has(s.seriesKey));
  const toggleAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(slots.map((s) => s.seriesKey)));
    }
  }, [allSelected, slots]);

  const hasChanges = slots.some((s) => {
    const wantSuspended = selected.has(s.seriesKey);
    return wantSuspended !== s.isSuspended;
  });

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} snapFraction={0.62}>
        <View style={styles.header}>
          <Ionicons name="moon" size={18} color="#F59E0B" />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Suspend classes</Text>
            <Text style={styles.subtitle}>{formatDate(dateISO)}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={22} color="#9CA3AF" />
          </Pressable>
        </View>

        <Text style={styles.hint}>
          Toggle which class sessions to suspend. The schedule will compress automatically.
        </Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#F59E0B" />
          </View>
        ) : slots.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.empty}>No scheduled classes on this day.</Text>
          </View>
        ) : (
          <>
            {/* Select all row */}
            <Pressable onPress={toggleAll} style={styles.selectAllRow}>
              <Text style={styles.selectAllText}>{allSelected ? "Unselect all" : "Select all"}</Text>
              <Ionicons
                name={allSelected ? "checkbox" : "square-outline"}
                size={20}
                color={allSelected ? "#F59E0B" : "#9CA3AF"}
              />
            </Pressable>

            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {slots.map((slot, i) => {
                const isSuspended = selected.has(slot.seriesKey);
                return (
                  <Pressable
                    key={`${slot.seriesKey ?? "null"}-${i}`}
                    onPress={() => toggleSlot(slot.seriesKey)}
                    style={[
                      styles.slotRow,
                      isSuspended && styles.slotRowSuspended,
                    ]}
                  >
                    <View style={styles.slotTimeCol}>
                      <Text style={[styles.slotTime, isSuspended && styles.slotTimeSuspended]}>
                        {formatTime12(slot.startTime)}
                      </Text>
                      <Text style={styles.slotTimeEnd}>→ {formatTime12(slot.endTime)}</Text>
                    </View>
                    <View style={styles.slotMeta}>
                      <Text style={[styles.slotLabel, isSuspended && styles.slotLabelSuspended]}>
                        {isSuspended ? "Suspended" : "Active"}
                      </Text>
                      {slot.isSuspended && !isSuspended ? (
                        <Text style={styles.slotRestoreLabel}>Will unsuspend</Text>
                      ) : null}
                    </View>
                    <Switch
                      value={isSuspended}
                      onValueChange={() => toggleSlot(slot.seriesKey)}
                      thumbColor={isSuspended ? "#F59E0B" : "#D1D5DB"}
                      trackColor={{ true: "#FDE68A", false: "#F3F4F6" }}
                      ios_backgroundColor="#F3F4F6"
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        <View style={styles.footer}>
          <Pressable
            onPress={onClose}
            style={styles.cancelBtn}
            disabled={saving}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleConfirm}
            disabled={saving || !hasChanges}
            style={[
              styles.confirmBtn,
              (!hasChanges || saving) && styles.confirmBtnDisabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.confirmText}>
                {allSelected && slots.length > 0 ? "Suspend all classes" : "Apply changes"}
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
  hint: {
    fontSize: 13,
    color: "#6B7280",
    paddingHorizontal: 20,
    marginBottom: 10,
    lineHeight: 18,
  },
  center: {
    paddingVertical: 40,
    alignItems: "center",
  },
  empty: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  selectAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#F59E0B",
  },
  list: {
    maxHeight: 260,
    paddingHorizontal: 20,
  },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
    gap: 10,
  },
  slotRowSuspended: {
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    paddingHorizontal: 6,
    marginHorizontal: -6,
  },
  slotTimeCol: {
    width: 80,
  },
  slotTime: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  slotTimeSuspended: {
    color: "#F59E0B",
  },
  slotTimeEnd: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 1,
  },
  slotMeta: {
    flex: 1,
  },
  slotLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#10B981",
  },
  slotLabelSuspended: {
    color: "#F59E0B",
  },
  slotRestoreLabel: {
    fontSize: 11,
    color: "#3B82F6",
    marginTop: 2,
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
  confirmBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnDisabled: {
    backgroundColor: "#FDE68A",
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
