import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/theme";
import { Radius, Spacing, Typography } from "../constants/fonts";

/**
 * A picture of the teaching week: one column per weekday, session blocks
 * positioned by time. Lecture slots use the lesson tone, laboratory slots the
 * performance-task tone with a flask mark. Renders from plan_entries rows.
 */

export type WeeklyEntry = {
  id: string;
  /** Weekday name, e.g. "monday" (case-insensitive). */
  day: string | null;
  /** "HH:MM" or "HH:MM:SS". */
  startTime: string | null;
  endTime: string | null;
  /** "lecture" | "laboratory" (anything else treated as lecture). */
  meetingType?: string | null;
};

type Props = {
  entries: WeeklyEntry[];
  onPressEntry?: (id: string) => void;
  height?: number;
};

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_INITIAL: Record<string, string> = {
  monday: "M",
  tuesday: "T",
  wednesday: "W",
  thursday: "Th",
  friday: "F",
  saturday: "Sa",
  sunday: "Su",
};

function toMinutes(t: string | null): number | null {
  const m = String(t ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function fmt(t: string | null): string {
  const mins = toMinutes(t);
  if (mins == null) return "";
  const h24 = Math.floor(mins / 60);
  const h = ((h24 + 11) % 12) + 1;
  const mm = mins % 60;
  return mm === 0 ? `${h}` : `${h}:${String(mm).padStart(2, "0")}`;
}

export default function WeeklySchedule({ entries, onPressEntry, height = 168 }: Props) {
  const { colors: c } = useAppTheme();

  const { days, range } = useMemo(() => {
    const present = new Set(
      entries.map((e) => String(e.day ?? "").trim().toLowerCase()).filter((d) => DAY_ORDER.includes(d))
    );
    // Always show Mon–Fri as the base week; extend for weekend sessions.
    const shown = DAY_ORDER.filter((d, i) => i < 5 || present.has(d));

    let min = Infinity;
    let max = -Infinity;
    for (const e of entries) {
      const s = toMinutes(e.startTime);
      const t = toMinutes(e.endTime);
      if (s != null) min = Math.min(min, s);
      if (t != null) max = Math.max(max, t);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      min = 7 * 60;
      max = 17 * 60;
    }
    // pad by 30min each side, floor/ceil to the hour
    min = Math.floor((min - 30) / 60) * 60;
    max = Math.ceil((max + 30) / 60) * 60;
    return { days: shown, range: { min, max } };
  }, [entries]);

  const span = range.max - range.min;
  const yOf = (mins: number) => ((mins - range.min) / span) * height;

  const byDay = useMemo(() => {
    const map = new Map<string, WeeklyEntry[]>();
    for (const e of entries) {
      const d = String(e.day ?? "").trim().toLowerCase();
      if (!DAY_ORDER.includes(d)) continue;
      const list = map.get(d);
      if (list) list.push(e);
      else map.set(d, [e]);
    }
    return map;
  }, [entries]);

  const todayKey = DAY_ORDER[(new Date().getDay() + 6) % 7];

  return (
    <View accessibilityRole="image" accessibilityLabel="Weekly schedule">
      <View style={styles.headerRow}>
        {days.map((d) => {
          const isToday = d === todayKey;
          return (
            <Text
              key={d}
              style={[
                Typography.label,
                styles.dayInitial,
                { color: isToday ? c.tint : c.faintText },
              ]}
            >
              {DAY_INITIAL[d]}
            </Text>
          );
        })}
      </View>
      <View style={[styles.grid, { height, borderColor: c.hairline }]}>
        {/* hour hairlines */}
        {Array.from({ length: Math.max(0, span / 60 - 1) }, (_, i) => (
          <View
            key={i}
            pointerEvents="none"
            style={[styles.hairline, { top: yOf(range.min + (i + 1) * 60), backgroundColor: c.hairline }]}
          />
        ))}
        {days.map((d) => {
          const list = (byDay.get(d) ?? []).slice().sort(
            (a, b) => (toMinutes(a.startTime) ?? 0) - (toMinutes(b.startTime) ?? 0)
          );
          return (
            <View key={d} style={styles.col}>
              {list.map((e) => {
                const s = toMinutes(e.startTime);
                const t = toMinutes(e.endTime);
                if (s == null || t == null || t <= s) return null;
                const lab = String(e.meetingType ?? "").toLowerCase() === "laboratory";
                const tone = lab ? c.category.performanceTask : c.category.lesson;
                const top = yOf(s);
                const blockH = Math.max(26, yOf(t) - top);
                const label = `${fmt(e.startTime)}–${fmt(e.endTime)}`;
                const body = (
                  <>
                    {lab && blockH >= 34 ? (
                      <Ionicons name="flask-outline" size={11} color={tone.onSoft} />
                    ) : null}
                    <Text style={[styles.blockText, { color: tone.onSoft }]} numberOfLines={1}>
                      {label}
                    </Text>
                  </>
                );
                const blockStyle = [
                  styles.block,
                  {
                    top,
                    height: blockH,
                    backgroundColor: tone.soft,
                    borderLeftColor: tone.base,
                  },
                ];
                return onPressEntry ? (
                  <Pressable
                    key={e.id}
                    onPress={() => onPressEntry(e.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${DAY_INITIAL[d]} ${label}${lab ? ", laboratory" : ""}`}
                    style={blockStyle}
                  >
                    {body}
                  </Pressable>
                ) : (
                  <View key={e.id} style={blockStyle}>
                    {body}
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    marginBottom: Spacing.xs,
  },
  dayInitial: {
    flex: 1,
    textAlign: "center",
  },
  grid: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hairline: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  col: {
    flex: 1,
    position: "relative",
    marginHorizontal: 2,
  },
  block: {
    position: "absolute",
    left: 0,
    right: 0,
    borderRadius: Radius.sm,
    borderLeftWidth: 3,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  blockText: {
    fontSize: 10,
    fontWeight: "600",
  },
});
