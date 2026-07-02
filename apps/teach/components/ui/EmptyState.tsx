import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { useAppTheme } from "../../context/theme";
import { Spacing, Typography } from "../../constants/fonts";
import { enterUp } from "../../lib/motion";
import Button from "./Button";

type Props = {
  /** Spot illustration from components/illustrations. */
  illustration?: React.ReactNode;
  title: string;
  body?: string;
  ctaLabel?: string;
  onCta?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** The standard empty state: illustration + title + body + one CTA. */
export default function EmptyState({ illustration, title, body, ctaLabel, onCta, style }: Props) {
  const { colors: c } = useAppTheme();
  return (
    <Animated.View entering={enterUp()} style={[styles.wrap, style]}>
      {illustration}
      <Text accessibilityRole="header" style={[Typography.h3, styles.title, { color: c.text }]}>
        {title}
      </Text>
      {!!body && <Text style={[Typography.bodySm, styles.body, { color: c.mutedText }]}>{body}</Text>}
      {!!ctaLabel && !!onCta && <Button title={ctaLabel} onPress={onCta} style={styles.cta} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xxl,
  },
  title: { textAlign: "center", marginTop: Spacing.sm },
  body: { textAlign: "center", marginTop: Spacing.xs, maxWidth: 280, lineHeight: 19 },
  cta: { marginTop: Spacing.xl, alignSelf: "center", minWidth: 180 },
});
