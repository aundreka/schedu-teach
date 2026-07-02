// components/calendar/calendar-block-bar.tsx
//
// One coloured bar inside the month grid: a bold ordinal line ("L1:", "SW2:",
// "Q1:", "PRJ1:", "Prelim:") and the session title under it. Positioned
// absolutely by its parent week row.

import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { SessionCategory } from "../../algorithm/00_types";
import { useAppTheme } from "../../context/theme";
import { toneFor } from "./theme";

type Props = {
  category: SessionCategory;
  prefix: string;
  title: string;
  left: number;
  top: number;
  width: number;
  height: number;
  isSuspended?: boolean;
  lockReason?: string | null;
};

export default function CalendarBlockBar({
  category,
  prefix,
  title,
  left,
  top,
  width,
  height,
  isSuspended,
  lockReason,
}: Props) {
  const { scheme } = useAppTheme();
  const tone = toneFor(category, scheme);
  const displayTitle = isSuspended && lockReason ? lockReason : title;
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: tone.bg, left, top, width, height, opacity: isSuspended ? 0.7 : 1 },
      ]}
      pointerEvents="none"
    >
      <View style={styles.prefixRow}>
        {isSuspended ? <Ionicons name="lock-closed" size={9} color={tone.fg} /> : null}
        <Text style={[styles.prefix, { color: tone.fg }]} numberOfLines={1}>
          {prefix}
        </Text>
      </View>
      <Text
        style={[
          styles.title,
          {
            color: tone.fg,
            textDecorationLine: isSuspended && !lockReason ? "line-through" : "none",
          },
        ]}
        numberOfLines={2}
      >
        {displayTitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingTop: 3,
    overflow: "hidden",
  },
  prefixRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  prefix: {
    fontSize: 9.5,
    fontWeight: "700",
    lineHeight: 12,
  },
  title: {
    fontSize: 9,
    lineHeight: 11,
    marginTop: 1,
  },
});
