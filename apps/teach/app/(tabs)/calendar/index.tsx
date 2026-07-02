// app/(tabs)/calendar/index.tsx
//
// Teacher's planning calendar — a month grid of the schedule produced by the
// scheduler in `algorithm/` (slots + blocks tables) for the currently selected
// lesson plan. The pieces are kept in `components/calendar/` so an admin
// variant of this screen can reuse them.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import {
  CalendarMonth,
  CalendarToolbar,
  listLessonPlans,
  loadPlanSchedule,
  monthName,
  monthsBetween,
  todayISO,
  type PlanSummary,
  type ScheduleData,
  type YearMonth,
} from "../../../components/calendar";
import { EmptyState, ErrorState } from "../../../components/ui";
import { PlanSeed } from "../../../components/illustrations";
import PopulateSheet from "../../../components/calendar/populate-sheet";
import { useAppTheme } from "../../../context/theme";
import { subscribeToLessonPlanRefresh } from "../../../lib/lesson-plan-refresh";
import { supabase } from "../../../lib/supabase";
import type { VacancyReport } from "../../../algorithm/00_types";

const PAGE_PADDING_H = 12;

// Within a single day, bars stack in this order: exam, then lesson, then
// written work (quizzes included), then performance task, then buffer.
const CATEGORY_DISPLAY_RANK: Record<string, number> = {
  exam: 0,
  lesson: 1,
  written_work: 2,
  performance_task: 3,
  buffer: 4,
};

function monthIndexFor(months: YearMonth[], iso: string): number {
  const [y, m] = iso.split("-").map(Number);
  const found = months.findIndex((ym) => ym.year === y && ym.month0 === m - 1);
  return found >= 0 ? found : 0;
}

export default function CalendarScreen() {
  const { colors: c } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.max(280, windowWidth - PAGE_PADDING_H * 2);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [monthIndex, setMonthIndex] = useState(0);
  const [gridHeight, setGridHeight] = useState(0);
  const [vacancies, setVacancies] = useState<VacancyReport[]>([]);
  const [populateOpen, setPopulateOpen] = useState(false);

  const listRef = useRef<FlatList<YearMonth>>(null);
  const today = useMemo(() => todayISO(), []);
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const load = useCallback(async (planId?: string) => {
    setLoading(true);
    setLoadError(false);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const realPlans = user ? await listLessonPlans(user.id) : [];
      setPlans(realPlans);

      const target = planId ?? realPlans[0]?.lessonPlanId ?? null;
      if (!target) {
        // Honest first-run state — no fabricated sample schedule.
        setSchedule(null);
        setSelectedPlanId(null);
        return;
      }
      const data = await loadPlanSchedule(target);
      setSchedule(data);
      setSelectedPlanId(target);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return subscribeToLessonPlanRefresh(() => {
      load(selectedPlanId ?? undefined);
    });
  }, [load, selectedPlanId]);

  const months = useMemo<YearMonth[]>(
    () => (schedule ? monthsBetween(schedule.startDate, schedule.endDate) : []),
    [schedule],
  );

  // Same-day bars ordered exam > lesson > written work > performance task >
  // buffer (then by the saved order_no). The month grid's lane packing is a
  // stable sort, so this order carries through to the rendered stack.
  const orderedBlocks = useMemo(() => {
    if (!schedule) return [];
    return schedule.blocks.slice().sort((a, b) => {
      const dateA = a.dates[0] ?? "";
      const dateB = b.dates[0] ?? "";
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const rankA = CATEGORY_DISPLAY_RANK[a.category] ?? 5;
      const rankB = CATEGORY_DISPLAY_RANK[b.category] ?? 5;
      if (rankA !== rankB) return rankA - rankB;
      return a.orderNo - b.orderNo;
    });
  }, [schedule]);

  const initialMonth = useMemo(() => {
    if (months.length === 0) return 0;
    return Math.min(Math.max(0, monthIndexFor(months, today)), months.length - 1);
  }, [months, today]);

  useEffect(() => {
    setMonthIndex(initialMonth);
  }, [initialMonth]);

  const currentYm = months[monthIndex] ?? months[0];
  const monthLabel = currentYm
    ? currentYm.year === currentYear
      ? monthName(currentYm.month0)
      : `${monthName(currentYm.month0)} ${currentYm.year}`
    : "";

  const gridColors = useMemo(
    () => ({
      text: c.text,
      muted: c.mutedText,
      // Out-of-month day numbers stay subtle in both schemes.
      faint: c.hairline,
      border: c.border,
      todayBg: c.tint,
      todayText: c.onTint,
    }),
    [c.text, c.mutedText, c.hairline, c.border, c.tint, c.onTint],
  );

  const pillSurface = c.card;

  const onOverflow = useCallback(() => {
    Alert.alert(schedule?.title ?? "Calendar", undefined, [
      { text: "Refresh", onPress: () => load(selectedPlanId ?? undefined) },
      { text: "Close", style: "cancel" },
    ]);
  }, [load, schedule?.title, selectedPlanId]);

  const onSelectPlan = useCallback(
    (planId: string) => {
      load(planId);
    },
    [load],
  );

  return (
    <View style={[styles.page, { backgroundColor: c.background }]}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.tint} />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <ErrorState title="Couldn't load your calendar" onRetry={() => load(selectedPlanId ?? undefined)} />
        </View>
      ) : !schedule ? (
        <View style={styles.center}>
          <EmptyState
            illustration={<PlanSeed size={220} />}
            title="Your school year, visualized"
            body="Create a lesson plan and schEDU lays out every session, quiz and exam on this calendar."
            ctaLabel="Create your first plan"
            onCta={() => router.push("/(tabs)/create/lessonplan")}
          />
        </View>
      ) : (
        <>
          <View style={styles.toolbarWrap}>
            <CalendarToolbar
              monthLabel={monthLabel}
              schedule={schedule}
              plans={plans}
              onSelectPlan={onSelectPlan}
              onOverflow={onOverflow}
              onSwitchToDaily={() => router.push("/(tabs)/calendar/daily")}
              textColor={c.text}
              mutedColor={c.mutedText}
              pillSurface={pillSurface}
              borderColor={c.border}
            />
          </View>

          {schedule.blocks.length === 0 ? (
            <Text style={[styles.emptyHint, { color: c.mutedText }]}>
              No scheduled sessions for this plan yet.
            </Text>
          ) : null}

          {vacancies.length > 0 && selectedPlanId ? (
            <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp.duration(200)}>
              <Pressable
                onPress={() => setPopulateOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Fill open session slots"
                style={[styles.vacancyBanner, { backgroundColor: c.infoSoft }]}
              >
                <Ionicons name="sparkles" size={15} color={c.info} />
                <Text style={[styles.vacancyBannerText, { color: c.info }]}>
                  {vacancies.reduce((s, r) => s + r.excess_slots, 0)} open session slot
                  {vacancies.reduce((s, r) => s + r.excess_slots, 0) !== 1 ? "s" : ""} — tap to fill
                </Text>
                <Ionicons name="chevron-forward" size={14} color={c.info} />
              </Pressable>
            </Animated.View>
          ) : null}

          <View
            style={styles.list}
            onLayout={(event) => setGridHeight(Math.round(event.nativeEvent.layout.height))}
          >
            {gridHeight > 0 ? (
              <FlatList
                key={schedule.planId ?? "none"}
                ref={listRef}
                data={months}
                keyExtractor={(ym) => `${ym.year}-${ym.month0}`}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={initialMonth}
                getItemLayout={(_, index) => ({
                  length: contentWidth,
                  offset: contentWidth * index,
                  index,
                })}
                onMomentumScrollEnd={(event) => {
                  const idx = Math.round(event.nativeEvent.contentOffset.x / contentWidth);
                  if (idx !== monthIndex) {
                    setMonthIndex(Math.min(Math.max(0, idx), months.length - 1));
                  }
                }}
                renderItem={({ item }) => (
                  <View style={{ width: contentWidth, height: gridHeight }}>
                    <CalendarMonth
                      year={item.year}
                      month0={item.month0}
                      width={contentWidth}
                      height={gridHeight}
                      blocks={orderedBlocks}
                      today={today}
                      colors={gridColors}
                      onSelectDay={(date) =>
                        router.push({ pathname: "/(tabs)/calendar/daily", params: { date } })
                      }
                    />
                  </View>
                )}
              />
            ) : null}
          </View>
        </>
      )}
      <PopulateSheet
        visible={populateOpen}
        planId={selectedPlanId}
        vacancies={vacancies}
        onClose={() => setPopulateOpen(false)}
        onDone={() => {
          setVacancies([]);
          load(selectedPlanId ?? undefined);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: PAGE_PADDING_H,
    paddingTop: 10,
  },
  toolbarWrap: {
    marginBottom: 10,
  },
  emptyHint: {
    fontSize: 12,
    marginBottom: 4,
  },
  vacancyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  vacancyBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  list: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
