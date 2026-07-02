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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import * as Haptics from "expo-haptics";
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
  deleteBlock,
  formatLongDate,
  hourLabel12,
  loadDayAgenda,
  timeToMinutes,
  todayISO,
  updateBlock,
  WEEKDAY_INITIALS,
  weekOf,
} from "../../../components/calendar";
import type { VacancyReport } from "../../../algorithm/00_types";
import SuspendSheet from "../../../components/calendar/suspend-sheet";
import PopulateSheet from "../../../components/calendar/populate-sheet";
import BlockActionSheet from "../../../components/calendar/block-action-sheet";
import Toast from "../../../components/Toast";
import { EmptyState, ErrorState } from "../../../components/ui";
import { PlanSeed } from "../../../components/illustrations";
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

type BlockActionState = {
  open: boolean;
  blockId: string;
  blockKey: string;
  title: string;
  label: string;
  category: string;
  lessonPlanId: string;
};

type PositionedEntry = { entry: DayBlock; top: number; height: number; left: number; width: number };

// Text/icon color on the saturated danger swipe action — fixed light value for
// contrast in both themes.
const ON_DANGER = "#FFFFFF";

export default function DailyCalendarScreen() {
  const { colors: c, scheme } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.max(280, windowWidth - PAGE_PADDING_H * 2);

  const params = useLocalSearchParams<{ date?: string }>();
  const today = useMemo(() => todayISO(), []);
  const initialDate = typeof params.date === "string" && params.date ? params.date : today;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [agenda, setAgenda] = useState<DayAgenda | null>(null);
  const [dateISO, setDateISO] = useState(initialDate);
  const [editor, setEditor] = useState<EditorState>({ open: false, mode: "create", initial: null });
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [populateOpen, setPopulateOpen] = useState(false);
  const [populateVacancies, setPopulateVacancies] = useState<VacancyReport[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [blockAction, setBlockAction] = useState<BlockActionState>({
    open: false, blockId: "", blockKey: "", title: "", label: "", category: "lesson", lessonPlanId: "",
  });
  const [toast, setToast] = useState<{ visible: boolean; message: string; variant: "success" | "warning" | "error" }>({
    visible: false, message: "", variant: "success",
  });
  const showToast = useCallback((message: string, variant: "success" | "warning" | "error" = "success") => {
    setToast({ visible: true, message, variant });
  }, []);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;
      const result = userId ? await loadDayAgenda(userId, date) : null;
      setAgenda(result);
      setDateISO(date);
      // Use first plan for suspend/populate operations
      setActivePlanId(result?.plans[0]?.lessonPlanId ?? null);
    } catch {
      setLoadError(true);
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
      load(date);
    },
    [load],
  );

  const weekDates = useMemo(() => weekOf(dateISO), [dateISO]);

  const entries = useMemo<DayBlock[]>(() => agenda?.entries ?? [], [agenda]);

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

  const openSuspend = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSuspendOpen(true);
  }, []);

  const onSuspendDone = useCallback((displacedCount: number, vacancyCount: number) => {
    if (displacedCount > 0) {
      showToast(`${displacedCount} pinned block${displacedCount > 1 ? "s" : ""} need re-pinning.`, "warning");
    } else {
      showToast("Schedule compressed.");
    }
    if (vacancyCount > 0) {
      setPopulateVacancies([]); // vacancies shown via banner in index screen
    }
    load(dateISO);
  }, [dateISO, load, showToast]);

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
      // Requirement blocks → show action sheet with 3 options
      if (
        entry.category === "written_work" ||
        entry.category === "performance_task" ||
        entry.category === "exam"
      ) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setBlockAction({
          open: true,
          blockId: entry.blockId,
          blockKey: entry.groupId,
          title: entry.title || "",
          label: entry.label,
          category: entry.category,
          lessonPlanId: entry.lessonPlanId,
        });
        return;
      }
      // Lesson / buffer blocks → direct delete with simple confirmation
      Alert.alert("Delete block?", `${entry.label}: ${entry.title || entry.subjectTitle}`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
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
    [dateISO, load],
  );

  const navigateToDetail = useCallback(
    (entry: DayBlock) => {
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
    [],
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
            style={[styles.headerIconBtn, { backgroundColor: c.card, borderColor: c.border }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Suspend day"
          >
            <Ionicons name="moon" size={16} color={c.warning} />
          </Pressable>
          <Pressable
            onPress={openCreate}
            style={[styles.createBtn, { backgroundColor: c.tint, shadowColor: c.shadow }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Create block"
          >
            <Ionicons name="add" size={22} color={c.onTint} />
          </Pressable>
        </View>

        <View style={styles.weekWrap}>
          <Pressable onPress={() => selectDay(addDaysISO(dateISO, -1))} style={[styles.weekArrow, { left: -2 }]} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous day">
            <Ionicons name="chevron-back" size={18} color={c.mutedText} />
          </Pressable>
          <Pressable onPress={() => selectDay(addDaysISO(dateISO, 1))} style={[styles.weekArrow, { right: -2 }]} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next day">
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
                        <Text style={[styles.daySelectedText, { color: c.onTint }]}>{dayOfMonth(d)}</Text>
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

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.tint} />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <ErrorState title="Couldn't load this day" onRetry={() => load(dateISO)} />
        </View>
      ) : !agenda || agenda.plans.length === 0 ? (
        <View style={styles.center}>
          <EmptyState
            illustration={<PlanSeed size={190} />}
            title="No plans yet"
            body="Create a lesson plan to see your day-by-day schedule here."
            ctaLabel="Create your first plan"
            onCta={() => router.push("/(tabs)/create/lessonplan")}
          />
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
                <View style={[styles.nowDot, { backgroundColor: c.danger }]} />
                <View style={[styles.nowBar, { backgroundColor: c.danger }]} />
              </View>
            ) : null}

            {positioned.length === 0 ? (
              <Text style={[styles.emptyDay, { color: c.mutedText }]}>Nothing scheduled this day.</Text>
            ) : null}

            {positioned.map(({ entry, top, height, left, width }, index) => {
              const past = isToday && timeToMinutes(entry.endTime) < nowMinutes;
              return (
                <Animated.View
                  key={entry.blockId}
                  entering={FadeInDown.delay(index * 38).springify()}
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
                        style={[styles.deleteAction, { backgroundColor: c.danger }]}
                        accessibilityRole="button"
                        accessibilityLabel="Delete block"
                      >
                        <Ionicons name="trash" size={20} color={ON_DANGER} />
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
                          borderColor: borderFor(entry.category, scheme),
                          backgroundColor: entry.isSuspended ? c.surfaceAlt : c.card,
                          shadowColor: c.shadow,
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
                            <Ionicons name="lock-closed" size={11} color={c.danger} />
                            <Text style={[styles.lockBadgeText, { color: c.danger }]} numberOfLines={1}>
                              {entry.lockReason}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Pressable
                        onPress={() => navigateToDetail(entry)}
                        style={styles.detailBtn}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel="Open details"
                      >
                        <Ionicons name="arrow-up" size={14} color={c.mutedText} style={styles.detailIcon} />
                      </Pressable>
                    </Pressable>
                  </ReanimatedSwipeable>
                </Animated.View>
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
        onClose={closeEditor}
        onSubmit={submitEditor}
        onDelete={editor.mode === "edit" ? deleteEditorBlock : undefined}
      />

      <SuspendSheet
        visible={suspendOpen}
        planId={activePlanId}
        dateISO={dateISO}
        onClose={() => setSuspendOpen(false)}
        onDone={onSuspendDone}
      />

      <PopulateSheet
        visible={populateOpen}
        planId={activePlanId}
        vacancies={populateVacancies}
        onClose={() => setPopulateOpen(false)}
        onDone={() => load(dateISO)}
      />

      <BlockActionSheet
        visible={blockAction.open}
        blockId={blockAction.blockId}
        blockKey={blockAction.blockKey}
        title={blockAction.title}
        label={blockAction.label}
        category={blockAction.category as any}
        lessonPlanId={blockAction.lessonPlanId}
        onClose={() => setBlockAction((prev) => ({ ...prev, open: false }))}
        onDeleted={() => { showToast("Block removed and schedule rebalanced."); load(dateISO); }}
      />

      <Toast
        visible={toast.visible}
        message={toast.message}
        variant={toast.variant}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
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
  },
  nowBar: {
    flex: 1,
    height: 1.5,
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
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  deleteActionText: {
    color: ON_DANGER,
    fontSize: 11,
    fontWeight: "700",
  },
});
