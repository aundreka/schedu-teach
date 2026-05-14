// components/calendar/subject-pill.tsx
//
// The white "subject" pill in the calendar toolbar: a caret + the subject code
// and "<grade> - <section>" subtitle, right-aligned. Tapping it opens a sheet
// to switch between the teacher's lesson plans.

import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing, Typography } from "../../constants/fonts";
import type { PlanSummary } from "./schedule";

export function normalizeYear(year: string | null): string {
  const value = (year ?? "").trim();
  if (!value) return "";
  if (/^grade\b/i.test(value)) return value;
  if (/^\d+$/.test(value)) return `Grade ${value}`;
  return value;
}

export function planSubtitle(year: string | null, section: string): string {
  return [normalizeYear(year), section].filter(Boolean).join(" - ");
}

type Props = {
  subjectCode: string;
  subjectYear: string | null;
  sectionName: string;
  plans: PlanSummary[];
  selectedPlanId: string | null;
  onSelect: (planId: string) => void;
  surface: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
};

export default function SubjectPill({
  subjectCode,
  subjectYear,
  sectionName,
  plans,
  selectedPlanId,
  onSelect,
  surface,
  textColor,
  mutedColor,
  borderColor,
}: Props) {
  const [open, setOpen] = useState(false);
  const subtitle = planSubtitle(subjectYear, sectionName);
  const pickable = plans.length > 0;

  return (
    <>
      <Pressable
        style={[styles.pill, { backgroundColor: surface }]}
        onPress={() => pickable && setOpen(true)}
      >
        <Ionicons name="caret-down" size={13} color={mutedColor} style={styles.caret} />
        <View style={styles.pillText}>
          <Text style={[styles.code, { color: textColor }]} numberOfLines={1}>
            {subjectCode || "Select a plan"}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: mutedColor }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: surface, borderColor }]}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={[styles.sheetTitle, { color: textColor }]}>Lesson plans</Text>
            <FlatList
              data={plans}
              keyExtractor={(plan) => plan.lessonPlanId}
              style={styles.list}
              renderItem={({ item }) => {
                const active = item.lessonPlanId === selectedPlanId;
                const itemSubtitle = planSubtitle(item.subjectYear, item.sectionName);
                return (
                  <Pressable
                    style={[styles.row, { borderBottomColor: borderColor }]}
                    onPress={() => {
                      setOpen(false);
                      onSelect(item.lessonPlanId);
                    }}
                  >
                    <View style={styles.rowText}>
                      <Text style={[styles.rowCode, { color: textColor }]} numberOfLines={1}>
                        {item.subjectCode || item.title}
                      </Text>
                      <Text style={[styles.rowSubtitle, { color: mutedColor }]} numberOfLines={1}>
                        {[itemSubtitle, item.title].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    {active ? <Ionicons name="checkmark" size={18} color="#22C55E" /> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 178,
    maxWidth: 240,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 3,
  },
  caret: {
    marginRight: 10,
  },
  pillText: {
    flex: 1,
    alignItems: "flex-end",
  },
  code: {
    fontSize: 15,
    fontWeight: "700",
    fontStyle: "italic",
    lineHeight: 19,
  },
  subtitle: {
    fontSize: 11,
    lineHeight: 14,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.18)",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  sheet: {
    borderWidth: 1,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  sheetTitle: {
    ...Typography.h3,
    marginBottom: Spacing.sm,
  },
  list: {
    maxHeight: 320,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
  },
  rowCode: {
    ...Typography.body,
    fontWeight: "600",
  },
  rowSubtitle: {
    ...Typography.caption,
    marginTop: 1,
  },
});
