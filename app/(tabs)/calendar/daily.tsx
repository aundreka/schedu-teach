// app/(tabs)/calendar/daily.tsx
//
// Daily agenda across ALL of the teacher's lesson plans. Each block is its own
// card on the timeline:
//   • tap a card  → edit it in the funnel (BlockEditor)
//   • swipe-left  → delete (with confirmation)
//   • top-right ↗ → open the matching detail page (lesson / written work / PT)
//   • top-right + (in the header) → create a manual block

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import {
  addDaysISO,
  BlockEditor,
  borderFor,
  type BlockEditorInitial,
  type BlockEditValues,
  createManualBlock,
  type DayAgenda,
  type DayBlock,
  dayOfMonth,
  DEMO_AGENDA,
  deleteBlock,
  formatLongDate,
  hourLabel12,
  loadDayAgenda,
  lockedPlanIds,
  suspendLessonPlans,
  timeToMinutes,
  todayISO,
  unsuspendLessonPlans,
  updateBlock,
  WEEKDAY_INITIALS,
  weekOf,
} from "../../../components/calendar";
import { Spacing } from "../../../constants/fonts";
import { useAppTheme } from "../../../context/theme";
import { emitLessonPlanRefresh, subscribeToLessonPlanRefresh } from "../../../lib/lesson-plan-refresh";
import { supabase } from "../../../lib/supabase";

const PAGE_PADDING_H = 12;
const HOUR_H = 64;
const GUTTER_W = 34;
const MIN_CARD_H = 56;
const STACK_GAP = 4;
const DELETE_ACTION_W = 78;

type EditorState = {
  open: boolean;
  mode: "create" | "edit";
  initial: BlockEditorInitial | null;
};

type SuspendState = {
  open: boolean;
  reason: string;
  selectedPlanIds: Set<string>;
  busy: boolean;
};

type PositionedEntry = { entry: DayBlock; top: number; height: number; left: number; width: number };

export default function DailyCalendarScreen() {
  const { colors: c } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.max(280, windowWidth - PAGE_PADDING_H * 2);

  const params = useLocalSearchParams<{ date?: string }>();
  const today = useMemo(() => todayISO(), []);
  const initialDate = typeof params.date === "string" && params.date ? params.date : today;
  const [loading, setLoading] = useState(true);
  const [agenda, setAgenda] = useState<DayAgenda | null>(null);
  const [usingDemo, setUsingDemo] = useState(false);
  const [dateISO, setDateISO] = useState(initialDate);
  const [editor, setEditor] = useState<EditorState>({ open: false, mode: "create", initial: null });
  const [suspend, setSuspend] = useState<SuspendState>({
    open: false,
    reason: "",
    selectedPlanIds: new Set<string>(),
    busy: false,
  });

  const load = useCallback(async (date: string) => {
    setLoading(true);
    try {
      let userId: string | null = null;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        userId = user?.id ?? null;
      } catch {
        userId = null;
      }
      if (!userId) {
        setAgenda(DEMO_AGENDA);
        setUsingDemo(true);
        setDateISO(DEMO_AGENDA.dateISO);
        return;
      }
      const result = await loadDayAgenda(userId, date);
      if (result.plans.length === 0) {
        setAgenda(DEMO_AGENDA);
        setUsingDemo(true);
        setDateISO(DEMO_AGENDA.dateISO);
      } else {
        setAgenda(result);
        setUsingDemo(false);
        setDateISO(date);
      }
    } catch {
      setAgenda(DEMO_AGENDA);
      setUsingDemo(true);
      setDateISO(DEMO_AGENDA.dateISO);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(initialDate);
  }, [load, initialDate]);

  useEffect(() => {
    return subscribeToLessonPlanRefresh(() => {
      load(dateISO);
    });
  }, [load, dateISO]);

  const selectDay = useCallback(
    (date: string) => {
      setDateISO(date);
      if (!usingDemo) load(date);
    },
    [load, usingDemo],
  );

  const weekDates = useMemo(() => weekOf(dateISO), [dateISO]);

  const entries = useMemo<DayBlock[]>(() => {
    if (!agenda) return [];
    if (usingDemo && dateISO !== DEMO_AGENDA.dateISO) return [];
    return agenda.entries;
  }, [agenda, usingDemo, dateISO]);

  const { startHour, endHour, positioned } = useMemo(() => {
    const starts = entries.map((e) => Math.floor(timeToMinutes(e.startTime) / 60));
    const ends = entries.map((e) => Math.ceil(timeToMinutes(e.endTime) / 60));
    const sHour = Math.min(7, ...(starts.length ? starts : [7]));
    const eHour = Math.max(21, sHour + 9, ...(ends.length ? ends : [21]));

    // Group entries that share an exact (start, end) — i.e. live in the same
    // slot — so they can be stacked vertically inside that slot's height
    // instead of split side-by-side.
    const sorted = [...entries].sort(
      (a, b) =>
        timeToMinutes(a.startTime) - timeToMinutes(b.startTime) ||
        timeToMinutes(a.endTime) - timeToMinutes(b.endTime) ||
        a.subjectTitle.localeCompare(b.subjectTitle),
    );
    const slotGroups = new Map<string, DayBlock[]>();
    for (const entry of sorted) {
      const key = `${entry.startTime}|${entry.endTime}`;
      const list = slotGroups.get(key);
      if (list) list.push(entry);
      else slotGroups.set(key, [entry]);
    }
    const cardWidth = contentWidth - GUTTER_W;
    const yOf = (time: string) => ((timeToMinutes(time) - sHour * 60) / 60) * HOUR_H;

    const pos: PositionedEntry[] = [];
    for (const group of slotGroups.values()) {
      const slotTop = yOf(group[0].startTime);
      const slotHeight = Math.max(MIN_CARD_H, yOf(group[0].endTime) - slotTop);
      const totalGap = STACK_GAP * (group.length - 1);
      const perCard = Math.max(MIN_CARD_H, (slotHeight - totalGap) / group.length);
      group.forEach((entry, index) => {
        pos.push({
          entry,
          top: slotTop + index * (perCard + STACK_GAP),
          height: perCard,
          left: GUTTER_W,
          width: cardWidth,
        });
      });
    }
    return { startHour: sHour, endHour: eHour, positioned: pos };
  }, [entries, contentWidth]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  );
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const isToday = dateISO === today;

  const lessonsForPlan = useCallback(
    (planId: string) => agenda?.plans.find((p) => p.lessonPlanId === planId)?.lessons ?? [],
    [agenda],
  );

  const openCreate = useCallback(() => {
    setEditor({ open: true, mode: "create", initial: null });
  }, []);

  const lockedPlans = useMemo(() => (agenda ? new Set(lockedPlanIds(agenda)) : new Set<string>()), [agenda]);

  const openSuspend = useCallback(() => {
    if (usingDemo) {
      Alert.alert("Sample calendar", "Open a real lesson plan to suspend it.");
      return;
    }
    setSuspend({
      open: true,
      reason: "",
      selectedPlanIds: new Set<string>(),
      busy: false,
    });
  }, [usingDemo]);

  const closeSuspend = useCallback(() => {
    setSuspend((prev) => (prev.busy ? prev : { ...prev, open: false }));
  }, []);

  const togglePlanInSuspend = useCallback((planId: string) => {
    setSuspend((prev) => {
      const next = new Set(prev.selectedPlanIds);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return { ...prev, selectedPlanIds: next };
    });
  }, []);

  const submitSuspend = useCallback(async () => {
    if (suspend.busy) return;
    const ids = Array.from(suspend.selectedPlanIds);
    const reason = suspend.reason.trim();
    if (ids.length === 0) {
      Alert.alert("Pick at least one plan", "Choose which lesson plan(s) to suspend.");
      return;
    }
    if (!reason) {
      Alert.alert("Reason required", "Briefly say why these plans are suspended.");
      return;
    }
    setSuspend((prev) => ({ ...prev, busy: true }));
    try {
      const toSuspend = ids.filter((id) => !lockedPlans.has(id));
      const toUnsuspend = ids.filter((id) => lockedPlans.has(id));
      if (toSuspend.length > 0) await suspendLessonPlans(toSuspend, reason);
      if (toUnsuspend.length > 0) await unsuspendLessonPlans(toUnsuspend);
      emitLessonPlanRefresh();
      await load(dateISO);
      setSuspend({ open: false, reason: "", selectedPlanIds: new Set<string>(), busy: false });
    } catch (err: any) {
      Alert.alert("Could not update", err?.message ?? "Please try again.");
      setSuspend((prev) => ({ ...prev, busy: false }));
    }
  }, [suspend.busy, suspend.selectedPlanIds, suspend.reason, lockedPlans, load, dateISO]);

  const openEdit = useCallback((entry: DayBlock) => {
    setEditor({
      open: true,
      mode: "edit",
      initial: {
        blockId: entry.blockId,
        lessonPlanId: entry.lessonPlanId,
        category: entry.category,
        subcategory: entry.subcategory,
        scopeLessonIds: entry.scopeLessonIds,
        startTime: entry.startTime,
        endTime: entry.endTime,
      },
    });
  }, []);

  const closeEditor = useCallback(() => setEditor((prev) => ({ ...prev, open: false })), []);

  const submitEditor = useCallback(
    async (values: BlockEditValues) => {
      const lessons = lessonsForPlan(values.lessonPlanId);
      if (editor.mode === "edit" && editor.initial) {
        await updateBlock(editor.initial.blockId, values, lessons);
      } else {
        await createManualBlock(values, dateISO, lessons);
      }
      emitLessonPlanRefresh();
      await load(dateISO);
    },
    [editor.mode, editor.initial, dateISO, lessonsForPlan, load],
  );

  const deleteEditorBlock = useCallback(async () => {
    if (!editor.initial) return;
    await deleteBlock(editor.initial.blockId);
    emitLessonPlanRefresh();
    await load(dateISO);
  }, [editor.initial, dateISO, load]);

  const confirmDeleteEntry = useCallback(
    (entry: DayBlock) => {
      Alert.alert("Delete block?", `${entry.label}: ${entry.title || entry.subjectTitle}`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (usingDemo) return;
            try {
              await deleteBlock(entry.blockId);
              emitLessonPlanRefresh();
              await load(dateISO);
            } catch (err: any) {
              Alert.alert("Could not delete", err?.message ?? "Please try again.");
            }
          },
        },
      ]);
    },
    [dateISO, load, usingDemo],
  );

  const navigateToDetail = useCallback(
    (entry: DayBlock) => {
      if (usingDemo) {
        Alert.alert("Sample calendar", "Open a real lesson plan to see block details.");
        return;
      }
      const subjectId = entry.subjectId || "";
      if (entry.category === "lesson") {
        if (!entry.lessonId) {
          Alert.alert("No detail page", "This lesson block isn't linked to a specific lesson yet.");
          return;
        }
        router.push({
          pathname: "/library/lesson_detail",
          params: { lessonId: entry.lessonId, subjectId },
        });
      } else if (entry.category === "performance_task") {
        router.push({
          pathname: "/library/pt_detail",
          params: { planEntryId: entry.blockId, subjectId },
        });
      } else {
        // written_work, exam, buffer all share the ww_detail layout.
        router.push({
          pathname: "/library/ww_detail",
          params: { planEntryId: entry.blockId, subjectId },
        });
      }
    },
    [usingDemo],
  );

  return (
    <View style={[styles.page, { backgroundColor: c.background }]}>
      <View style={styles.headerArea}>
        <Pressable onPress={() => router.back()} style={styles.modeRow} hitSlop={8}>
          <Ionicons name="chevron-back" size={15} color={c.mutedText} />
          <Text style={[styles.modeText, { color: c.mutedText }]}>Daily</Text>
        </Pressable>

        <View style={styles.titleRow}>
          <Text style={[styles.dateTitle, { color: c.text }]} numberOfLines={1}>
            {formatLongDate(dateISO)}
          </Text>
          <Pressable
            onPress={openSuspend}
            style={[
              styles.headerIconBtn,
              { backgroundColor: lockedPlans.size > 0 ? "#DC2626" : c.card, borderColor: c.border },
            ]}
            hitSlop={8}
          >
            <Ionicons
              name="pause"
              size={18}
              color={lockedPlans.size > 0 ? "#FFFFFF" : c.mutedText}
            />
          </Pressable>
          <Pressable
            onPress={openCreate}
            style={[styles.createBtn, { backgroundColor: c.tint }]}
            hitSlop={8}
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.weekWrap}>
          <Pressable onPress={() => selectDay(addDaysISO(dateISO, -1))} style={[styles.weekArrow, { left: -2 }]} hitSlop={10}>
            <Ionicons name="chevron-back" size={18} color={c.mutedText} />
          </Pressable>
          <Pressable onPress={() => selectDay(addDaysISO(dateISO, 1))} style={[styles.weekArrow, { right: -2 }]} hitSlop={10}>
            <Ionicons name="chevron-forward" size={18} color={c.mutedText} />
          </Pressable>
          <View style={styles.weekStrip}>
            <View style={styles.weekHeaderRow}>
              {weekDates.map((d, i) => (
                <Text
                  key={`h${i}`}
                  style={[styles.weekInitial, { color: d === dateISO ? c.tint : c.mutedText }]}
                >
                  {WEEKDAY_INITIALS[i]}
                </Text>
              ))}
            </View>
            <View style={styles.weekNumRow}>
              {weekDates.map((d, i) => {
                const selected = d === dateISO;
                return (
                  <Pressable key={`d${i}`} style={styles.weekNumCell} onPress={() => selectDay(d)}>
                    {selected ? (
                      <View style={[styles.daySelected, { backgroundColor: c.tint }]}>
                        <Text style={styles.daySelectedText}>{dayOfMonth(d)}</Text>
                      </View>
                    ) : (
                      <Text style={[styles.dayNumber, { color: c.mutedText }, d === today && styles.dayNumberToday]}>
                        {dayOfMonth(d)}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
        <View style={[styles.divider, { backgroundColor: c.border }]} />
      </View>

      {loading || !agenda ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.tint} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 96 }}
        >
          <View style={{ height: (endHour - startHour) * HOUR_H + 12, position: "relative" }}>
            {hours.map((h) => {
              const y = (h - startHour) * HOUR_H;
              return (
                <View key={h} style={[styles.hourLine, { top: y, borderTopColor: c.border }]}>
                  <Text style={[styles.hourLabel, { color: c.mutedText }]}>{hourLabel12(h)}</Text>
                </View>
              );
            })}

            {isToday && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60 ? (
              <View
                style={[styles.nowLine, { top: ((nowMinutes - startHour * 60) / 60) * HOUR_H }]}
                pointerEvents="none"
              >
                <View style={styles.nowDot} />
                <View style={styles.nowBar} />
              </View>
            ) : null}

            {positioned.length === 0 ? (
              <Text style={[styles.emptyDay, { color: c.mutedText }]}>Nothing scheduled this day.</Text>
            ) : null}

            {positioned.map(({ entry, top, height, left, width }) => {
              const past = isToday && timeToMinutes(entry.endTime) < nowMinutes;
              return (
                <View
                  key={entry.blockId}
                  style={{
                    position: "absolute",
                    top,
                    left,
                    width,
                    minHeight: height,
                    borderRadius: 12,
                    overflow: "hidden",
                    opacity: past ? 0.55 : 1,
                  }}
                >
                  <ReanimatedSwipeable
                    friction={1.4}
                    rightThreshold={48}
                    overshootRight={false}
                    renderRightActions={() => (
                      <Pressable
                        onPress={() => confirmDeleteEntry(entry)}
                        style={styles.deleteAction}
                      >
                        <Ionicons name="trash" size={20} color="#FFFFFF" />
                        <Text style={styles.deleteActionText}>Delete</Text>
                      </Pressable>
                    )}
                  >
                    <Pressable
                      onPress={() => openEdit(entry)}
                      style={[
                        styles.card,
                        {
                          minHeight: height,
                          borderColor: borderFor(entry.category),
                          backgroundColor: entry.isSuspended ? "#F3F4F6" : c.card,
                        },
                      ]}
                    >
                      <View style={styles.cardText}>
                        <Text
                          style={[
                            styles.cardTitle,
                            { color: c.text, textDecorationLine: entry.isSuspended ? "line-through" : "none" },
                          ]}
                          numberOfLines={1}
                        >
                          {entry.label}
                          {entry.title ? `: ${entry.title}` : ""}
                        </Text>
                        <Text style={[styles.cardContext, { color: c.mutedText }]} numberOfLines={1}>
                          {entry.subjectTitle.toUpperCase()} · {entry.subtitle}
                        </Text>
                        {entry.isSuspended && entry.lockReason ? (
                          <View style={styles.lockBadgeRow}>
                            <Ionicons name="lock-closed" size={11} color="#B91C1C" />
                            <Text style={styles.lockBadgeText} numberOfLines={1}>
                              {entry.lockReason}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Pressable
                        onPress={() => navigateToDetail(entry)}
                        style={styles.detailBtn}
                        hitSlop={6}
                      >
                        <Ionicons name="arrow-up" size={14} color={c.mutedText} style={styles.detailIcon} />
                      </Pressable>
                    </Pressable>
                  </ReanimatedSwipeable>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      <BlockEditor
        visible={editor.open}
        mode={editor.mode}
        plans={agenda?.plans ?? []}
        existingEntries={entries}
        dateISO={dateISO}
        initial={editor.initial}
        readOnly={usingDemo}
        onClose={closeEditor}
        onSubmit={submitEditor}
        onDelete={editor.mode === "edit" ? deleteEditorBlock : undefined}
      />

      <Modal visible={suspend.open} animationType="slide" onRequestClose={closeSuspend} transparent>
        <View style={styles.suspendBackdrop}>
          <View style={[styles.suspendSheet, { backgroundColor: c.card }]}>
            <View style={styles.suspendHeader}>
              <Pressable onPress={closeSuspend} hitSlop={10}>
                <Ionicons name="close" size={22} color={c.mutedText} />
              </Pressable>
              <Text style={[styles.suspendTitle, { color: c.text }]}>Suspend lesson plans</Text>
              <View style={{ width: 22 }} />
            </View>
            <Text style={[styles.suspendHint, { color: c.mutedText }]}>
              All blocks in the selected plans will be marked locked, and the reason will show on every card.
            </Text>

            <ScrollView style={styles.suspendList} contentContainerStyle={{ paddingBottom: 8 }}>
              {(agenda?.plans ?? []).map((plan) => {
                const selected = suspend.selectedPlanIds.has(plan.lessonPlanId);
                const locked = lockedPlans.has(plan.lessonPlanId);
                return (
                  <Pressable
                    key={plan.lessonPlanId}
                    onPress={() => togglePlanInSuspend(plan.lessonPlanId)}
                    style={[styles.suspendRow, { borderColor: c.border }]}
                  >
                    <View
                      style={[
                        styles.suspendCheckbox,
                        {
                          backgroundColor: selected ? plan.color : "transparent",
                          borderColor: selected ? plan.color : c.border,
                        },
                      ]}
                    >
                      {selected ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                    </View>
                    <View style={[styles.planDot, { backgroundColor: plan.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.suspendRowTitle, { color: c.text }]} numberOfLines={1}>
                        {plan.subjectTitle}
                      </Text>
                      <Text style={[styles.suspendRowSub, { color: c.mutedText }]} numberOfLines={1}>
                        {plan.subtitle}
                      </Text>
                    </View>
                    {locked ? (
                      <View style={styles.suspendLockedTag}>
                        <Ionicons name="lock-closed" size={11} color="#B91C1C" />
                        <Text style={styles.suspendLockedText}>Locked</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
              {(agenda?.plans ?? []).length === 0 ? (
                <Text style={[styles.suspendHint, { color: c.mutedText, padding: Spacing.lg }]}>
                  No lesson plans to suspend.
                </Text>
              ) : null}
            </ScrollView>

            <Text style={[styles.suspendLabel, { color: c.mutedText }]}>Reason</Text>
            <TextInput
              style={[styles.suspendInput, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
              placeholder="e.g. Typhoon class suspension"
              placeholderTextColor={c.mutedText}
              value={suspend.reason}
              onChangeText={(text) => setSuspend((prev) => ({ ...prev, reason: text }))}
              multiline
            />

            <Pressable
              onPress={submitSuspend}
              disabled={suspend.busy}
              style={[styles.suspendBtn, { backgroundColor: "#DC2626", opacity: suspend.busy ? 0.5 : 1 }]}
            >
              {suspend.busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.suspendBtnText}>
                  {Array.from(suspend.selectedPlanIds).some((id) => lockedPlans.has(id))
                    ? "Update / unsuspend"
                    : "Suspend selected plans"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  headerArea: {
    paddingHorizontal: PAGE_PADDING_H + 2,
    paddingTop: 10,
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  modeText: {
    fontSize: 13,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginTop: 2,
  },
  dateTitle: {
    flex: 1,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
  },
  createBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  weekWrap: {
    position: "relative",
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  weekArrow: {
    position: "absolute",
    top: 22,
    width: 22,
    alignItems: "center",
    zIndex: 2,
  },
  weekStrip: {
    paddingHorizontal: 22,
  },
  weekHeaderRow: {
    flexDirection: "row",
  },
  weekInitial: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "500",
  },
  weekNumRow: {
    flexDirection: "row",
    marginTop: 4,
  },
  weekNumCell: {
    flex: 1,
    alignItems: "center",
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 4,
  },
  dayNumberToday: {
    fontWeight: "700",
  },
  daySelected: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  daySelectedText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    marginTop: Spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  hourLine: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
  },
  hourLabel: {
    position: "absolute",
    top: -7,
    left: 0,
    width: GUTTER_W - 6,
    textAlign: "right",
    fontSize: 11,
  },
  nowLine: {
    position: "absolute",
    left: GUTTER_W - 6,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  nowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  nowBar: {
    flex: 1,
    height: 1.5,
    backgroundColor: "#EF4444",
  },
  emptyDay: {
    position: "absolute",
    top: HOUR_H,
    left: GUTTER_W + 8,
    fontSize: 13,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    flexDirection: "row",
    alignItems: "stretch",
    gap: Spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardText: {
    flex: 1,
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  cardContext: {
    fontSize: 12,
    marginTop: 2,
    fontStyle: "italic",
  },
  lockBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  lockBadgeText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: "#B91C1C",
  },
  detailBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  detailIcon: {
    transform: [{ rotate: "45deg" }],
  },
  deleteAction: {
    width: DELETE_ACTION_W,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  deleteActionText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  suspendBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  suspendSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: "85%",
  },
  suspendHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  suspendTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  suspendHint: {
    fontSize: 12,
    marginBottom: Spacing.md,
  },
  suspendList: {
    maxHeight: 280,
    marginBottom: Spacing.md,
  },
  suspendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  suspendCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  planDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  suspendRowTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  suspendRowSub: {
    fontSize: 12,
    marginTop: 1,
  },
  suspendLockedTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "#FEE2E2",
  },
  suspendLockedText: {
    color: "#B91C1C",
    fontSize: 10,
    fontWeight: "700",
  },
  suspendLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  suspendInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    minHeight: 64,
    marginBottom: Spacing.md,
  },
  suspendBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  suspendBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
