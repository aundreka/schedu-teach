// components/calendar/calendar-toolbar.tsx
//
// Top strip of the calendar screen: the "Monthly / <Month>" label on the left,
// the subject pill in the middle, and an overflow button on the right.

import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Spacing } from "../../constants/fonts";
import SubjectPill from "./subject-pill";
import type { PlanSummary, ScheduleData } from "./schedule";

type Props = {
  monthLabel: string;
  schedule: ScheduleData;
  plans: PlanSummary[];
  onSelectPlan: (planId: string) => void;
  onOverflow: () => void;
  onSwitchToDaily?: () => void;
  textColor: string;
  mutedColor: string;
  pillSurface: string;
  borderColor: string;
};

export default function CalendarToolbar({
  monthLabel,
  schedule,
  plans,
  onSelectPlan,
  onOverflow,
  onSwitchToDaily,
  textColor,
  mutedColor,
  pillSurface,
  borderColor,
}: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Pressable onPress={onSwitchToDaily} disabled={!onSwitchToDaily} hitSlop={6} style={styles.modeRow}>
          <Text style={[styles.mode, { color: mutedColor }]}>Monthly</Text>
          {onSwitchToDaily ? (
            <Ionicons name="swap-vertical" size={12} color={mutedColor} style={styles.modeIcon} />
          ) : null}
        </Pressable>
        <Text style={[styles.month, { color: textColor }]} numberOfLines={1}>
          {monthLabel}
        </Text>
      </View>

      <SubjectPill
        subjectCode={schedule.subjectCode}
        subjectYear={schedule.subjectYear}
        sectionName={schedule.sectionName}
        plans={plans}
        selectedPlanId={schedule.planId}
        onSelect={onSelectPlan}
        surface={pillSurface}
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      />

      <Pressable onPress={onOverflow} style={styles.overflow} hitSlop={10}>
        <Ionicons name="ellipsis-horizontal" size={22} color={mutedColor} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  left: {
    minWidth: 84,
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  mode: {
    fontSize: 13,
    fontWeight: "400",
  },
  modeIcon: {
    marginLeft: 3,
  },
  month: {
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "700",
  },
  overflow: {
    paddingTop: 6,
    paddingLeft: 4,
    minWidth: 28,
    alignItems: "flex-end",
  },
});
