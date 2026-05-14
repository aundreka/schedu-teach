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
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  CalendarMonth,
  CalendarToolbar,
  DEMO_PLAN_ID,
  DEMO_PLAN_SUMMARY,
  DEMO_SCHEDULE,
  listLessonPlans,
  loadPlanSchedule,
  monthName,
  monthsBetween,
  todayISO,
  type PlanSummary,
  type ScheduleData,
  type YearMonth,
} from "../../../components/calendar";
import { useAppTheme } from "../../../context/theme";
import { subscribeToLessonPlanRefresh } from "../../../lib/lesson-plan-refresh";
import { supabase } from "../../../lib/supabase";

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
  const { colors: c, scheme } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.max(280, windowWidth - PAGE_PADDING_H * 2);

  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([DEMO_PLAN_SUMMARY]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [monthIndex, setMonthIndex] = useState(0);
  const [gridHeight, setGridHeight] = useState(0);

  const listRef = useRef<FlatList<YearMonth>>(null);
  const today = useMemo(() => todayISO(), []);
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const load = useCallback(async (planId?: string) => {
    setLoading(true);
    try {
      let realPlans: PlanSummary[] = [];
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) realPlans = await listLessonPlans(user.id);
      } catch {
        realPlans = [];
      }
      setPlans([...realPlans, DEMO_PLAN_SUMMARY]);

      const target = planId ?? realPlans[0]?.lessonPlanId ?? DEMO_PLAN_ID;
      if (target === DEMO_PLAN_ID) {
        setSchedule(DEMO_SCHEDULE);
        setSelectedPlanId(DEMO_PLAN_ID);
      } else {
        try {
          const data = await loadPlanSchedule(target);
          setSchedule(data);
          setSelectedPlanId(target);
        } catch {
          setSchedule(DEMO_SCHEDULE);
          setSelectedPlanId(DEMO_PLAN_ID);
        }
      }
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
      faint: scheme === "dark" ? "#3A4350" : "#C8CCD3",
      border: c.border,
      todayBg: c.tint,
      todayText: "#FFFFFF",
    }),
    [c.text, c.mutedText, c.border, c.tint, scheme],
  );

  const pillSurface = scheme === "dark" ? c.card : "#FFFFFF";

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
      {loading || !schedule ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.tint} />
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

          {schedule.blocks.length === 0 && schedule.planId !== DEMO_PLAN_ID ? (
            <Text style={[styles.emptyHint, { color: c.mutedText }]}>
              No scheduled sessions for this plan yet.
            </Text>
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
  list: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
