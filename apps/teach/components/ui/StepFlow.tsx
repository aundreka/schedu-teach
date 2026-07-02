import React, { useRef } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated from "react-native-reanimated";
import { useAppTheme } from "../../context/theme";
import { Spacing, Typography } from "../../constants/fonts";
import { springs, stepMotion } from "../../lib/motion";
import Button from "./Button";
import { useAnimatedStyle, useDerivedValue, withSpring } from "react-native-reanimated";

export type StepDef = {
  key: string;
  /** Big question shown at the top of the step, e.g. "What subject?" */
  title: string;
  subtitle?: string;
};

type Props = {
  steps: StepDef[];
  /** Controlled current step index. */
  index: number;
  /** Back affordance: previous step, or dismiss on the first step. */
  onBack: () => void;
  backLabelOnFirst?: string;
  nextLabel?: string;
  onNext?: () => void;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  /** Extra footer content rendered above the primary button (e.g. skip link). */
  footerExtra?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

function ProgressTrack({ count, index }: { count: number; index: number }) {
  const { colors: c } = useAppTheme();
  const progress = useDerivedValue(() => withSpring((index + 1) / count, springs.detail), [index, count]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${index + 1} of ${count}`}
      accessibilityValue={{ min: 1, max: count, now: index + 1 }}
      style={[styles.track, { backgroundColor: c.surfaceAlt }]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: c.tint }, fillStyle]} />
    </View>
  );
}

/**
 * The guided-funnel chrome: one decision per step, progress at the top,
 * direction-aware slide transitions, one primary action at the bottom.
 * Controlled — the screen owns the step index and per-step content.
 */
export default function StepFlow({
  steps,
  index,
  onBack,
  backLabelOnFirst = "Cancel",
  nextLabel = "Continue",
  onNext,
  nextDisabled = false,
  nextLoading = false,
  footerExtra,
  children,
  style,
}: Props) {
  const { colors: c } = useAppTheme();
  const prevIndex = useRef(index);
  const goingBack = index < prevIndex.current;
  prevIndex.current = index;

  const step = steps[index];
  const first = index === 0;

  return (
    <View style={[styles.root, style]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={first ? backLabelOnFirst : "Back to previous step"}
          onPress={onBack}
          hitSlop={10}
          style={styles.back}
        >
          {first ? (
            <Text style={[Typography.bodySm, { color: c.mutedText, fontWeight: "500" }]}>{backLabelOnFirst}</Text>
          ) : (
            <Ionicons name="chevron-back" size={22} color={c.text} />
          )}
        </Pressable>
        <ProgressTrack count={steps.length} index={index} />
        <View style={styles.back} />
      </View>

      <Animated.View
        key={step.key}
        entering={goingBack ? stepMotion.enterBack : stepMotion.enterForward}
        exiting={goingBack ? stepMotion.exitBack : stepMotion.exitForward}
        style={styles.body}
      >
        <Text accessibilityRole="header" style={[Typography.h1, { color: c.text }]}>
          {step.title}
        </Text>
        {!!step.subtitle && (
          <Text style={[Typography.bodySm, styles.subtitle, { color: c.mutedText }]}>{step.subtitle}</Text>
        )}
        <View style={styles.content}>{children}</View>
      </Animated.View>

      <View style={styles.footer}>
        {footerExtra}
        {!!onNext && (
          <Button
            title={nextLabel}
            onPress={onNext}
            disabled={nextDisabled}
            loading={nextLoading}
            size="lg"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  back: { minWidth: 48, alignItems: "flex-start" },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2 },
  body: { flex: 1, paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg },
  subtitle: { marginTop: Spacing.xs },
  content: { flex: 1, marginTop: Spacing.xl },
  footer: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl, gap: Spacing.sm },
});
