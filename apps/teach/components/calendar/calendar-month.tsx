// components/calendar/calendar-month.tsx
//
// A single month rendered as a Sunday-first grid. Multi-day blocks span
// columns; a split block (e.g. a project that runs across several class days
// with a gap) renders one bar per contiguous run. Bars are packed into the
// fewest lanes (first-fit by start column), so a day with a single block lines
// up with its neighbours on the top lane and bars only drop to a lower lane
// when they collide.

import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../context/theme";
import CalendarBlockBar from "./calendar-block-bar";
import { dayOfMonth, getMonthMatrix, monthKeyOf, type ISODate } from "./dates";
import type { ScheduleBlock } from "./schedule";
import { MONTH_NAMES, WEEKDAY_INITIALS } from "./theme";

const WEEKDAY_HEADER_H = 22;
const DATE_BAND_H = 22; // day-number strip at the top of a week row
const BAR_H = 38;
const BAR_GAP = 3;
const ROW_BOTTOM_PAD = 8;
const ROW_MIN_H = 92;
const BAR_INSET = 2; // horizontal breathing room on each side of a bar

type Props = {
  year: number;
  month0: number;
  width: number;
  height: number;
  blocks: ScheduleBlock[];
  today: ISODate;
  /** ISO date strings that have at least one suspended slot */
  suspendedDates?: Set<string>;
  colors: {
    text: string;
    muted: string;
    faint: string;
    border: string;
    todayBg: string;
    todayText: string;
  };
  onSelectDay?: (date: ISODate) => void;
};

type Segment = {
  block: ScheduleBlock;
  startCol: number;
  endCol: number;
  lane: number;
};

type Week = {
  days: ISODate[];
  segments: Segment[];
  height: number;
};

function buildWeek(days: ISODate[], blocks: ScheduleBlock[]): Week {
  const colByDate = new Map<string, number>();
  days.forEach((d, i) => colByDate.set(d, i));

  // One raw segment per maximal run of consecutive columns the block touches.
  const raw: { block: ScheduleBlock; startCol: number; endCol: number }[] = [];
  for (const block of blocks) {
    const cols = block.dates
      .map((d) => colByDate.get(d))
      .filter((c): c is number => c != null)
      .sort((a, b) => a - b);
    if (cols.length === 0) continue;

    let runStart = cols[0];
    let prev = cols[0];
    for (let i = 1; i < cols.length; i += 1) {
      if (cols[i] === prev + 1) {
        prev = cols[i];
        continue;
      }
      raw.push({ block, startCol: runStart, endCol: prev });
      runStart = cols[i];
      prev = cols[i];
    }
    raw.push({ block, startCol: runStart, endCol: prev });
  }

  // Greedy first-fit lane packing. Process bars left to right (longer runs win
  // ties on the same start column); each bar takes the topmost lane that's free
  // at its start column. A bar that collides with nothing stays on lane 0, so
  // single-block days line up across the row. `blocks` arrives sorted by date
  // then `order_no`, and the sort below is stable, so colliding same-day bars
  // stack in `order_no` order.
  raw.sort((a, b) => a.startCol - b.startCol || b.endCol - a.endCol);
  const laneEnds: number[] = []; // last endCol occupying each lane
  const segments: Segment[] = [];
  for (const seg of raw) {
    let lane = laneEnds.findIndex((end) => end < seg.startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(seg.endCol);
    } else {
      laneEnds[lane] = seg.endCol;
    }
    segments.push({ ...seg, lane });
  }

  const laneCount = laneEnds.length;
  const height = Math.max(ROW_MIN_H, DATE_BAND_H + laneCount * (BAR_H + BAR_GAP) + ROW_BOTTOM_PAD);
  return { days, segments, height };
}

// Animated date cell with press scale and suspended tint
function DateCell({
  date,
  colW,
  weekH,
  inMonth,
  isToday,
  isSuspended,
  colors,
  onPress,
}: {
  date: ISODate;
  colW: number;
  weekH: number;
  inMonth: boolean;
  isToday: boolean;
  isSuspended: boolean;
  colors: Props["colors"];
  onPress: () => void;
}) {
  const { colors: c } = useAppTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const [, monthStr] = date.split("-");
  const monthName = MONTH_NAMES[Number(monthStr) - 1] ?? "";
  const accessibilityLabel = `${monthName} ${dayOfMonth(date)}${isSuspended ? ", suspended" : ""}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.dateCell,
        { width: colW, height: weekH },
        isSuspended && { backgroundColor: c.warningSoft },
      ]}
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.92, { damping: 12, stiffness: 280 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 14, stiffness: 260 }); }}
    >
      <Animated.View style={animStyle}>
        {isToday ? (
          <View style={[styles.todayPill, { backgroundColor: colors.todayBg }]}>
            <Text style={[styles.todayPillText, { color: colors.todayText }]}>
              {dayOfMonth(date)}
            </Text>
          </View>
        ) : (
          <Text style={[styles.dateText, { color: inMonth ? colors.muted : colors.faint }]}>
            {dayOfMonth(date)}
          </Text>
        )}
        {isSuspended ? (
          <Ionicons
            name="moon"
            size={8}
            color={c.warning}
            style={styles.suspendedIcon}
          />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

export default function CalendarMonth({ year, month0, width, height, blocks, today, suspendedDates, colors, onSelectDay }: Props) {
  const colW = width / 7;
  const monthKey = `${year}-${String(month0 + 1).padStart(2, "0")}`;

  const weeks = useMemo<Week[]>(() => {
    const matrix = getMonthMatrix(year, month0);
    const built = matrix.map((days) => buildWeek(days, blocks));
    // Drop trailing rows that belong entirely to the next month and carry no
    // blocks, so the grid stays compact like the mock.
    let last = built.length - 1;
    while (last > 0) {
      const w = built[last];
      const ownsADay = w.days.some((d) => monthKeyOf(d) === monthKey);
      if (w.segments.length > 0 || ownsADay) break;
      last -= 1;
    }
    return built.slice(0, last + 1);
  }, [year, month0, blocks, monthKey]);

  return (
    <ScrollView
      style={{ width, height }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={[styles.weekdayRow, { height: WEEKDAY_HEADER_H }]}>
        {WEEKDAY_INITIALS.map((initial, i) => (
          <Text key={i} style={[styles.weekdayText, { width: colW, color: colors.muted }]}>
            {initial}
          </Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View
          key={wi}
          style={[styles.weekRow, { height: week.height, borderTopColor: colors.border }]}
        >
          <View style={styles.dateBand}>
            {week.days.map((d, col) => {
              const inMonth = monthKeyOf(d) === monthKey;
              const isToday = d === today;
              const isSuspended = suspendedDates?.has(d) ?? false;
              return (
                <DateCell
                  key={col}
                  date={d}
                  colW={colW}
                  weekH={week.height}
                  inMonth={inMonth}
                  isToday={isToday}
                  isSuspended={isSuspended}
                  colors={colors}
                  onPress={() => onSelectDay?.(d)}
                />
              );
            })}
          </View>

          {week.segments.map((seg, si) => (
            <CalendarBlockBar
              key={`${seg.block.id}-${seg.startCol}-${si}`}
              category={seg.block.category}
              prefix={seg.block.prefix}
              title={seg.block.title}
              left={seg.startCol * colW + BAR_INSET}
              top={DATE_BAND_H + seg.lane * (BAR_H + BAR_GAP)}
              width={(seg.endCol - seg.startCol + 1) * colW - BAR_INSET * 2}
              height={BAR_H}
              isSuspended={seg.block.isSuspended}
              lockReason={seg.block.lockReason}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 28,
  },
  weekdayRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  weekdayText: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "500",
  },
  weekRow: {
    borderTopWidth: 1,
    position: "relative",
  },
  dateBand: {
    flexDirection: "row",
  },
  dateCell: {
    alignItems: "flex-start",
    paddingLeft: 6,
    paddingTop: 4,
  },
  dateText: {
    fontSize: 12,
    fontWeight: "500",
  },
  todayPill: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  todayPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  suspendedIcon: {
    marginTop: 1,
    marginLeft: 3,
  },
});
