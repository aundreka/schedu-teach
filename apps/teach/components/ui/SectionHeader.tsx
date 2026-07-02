import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../../context/theme";
import { Spacing, Typography } from "../../constants/fonts";

type Props = {
  title: string;
  /** Optional inline action, e.g. "Edit" / "See all". */
  actionLabel?: string;
  onAction?: () => void;
  /** Uppercase kicker style (default) or sentence-case h3. */
  variant?: "kicker" | "title";
};

/**
 * Groups content with typography instead of nested boxes. The standard way to
 * introduce a section inside a screen or Card.
 */
export default function SectionHeader({ title, actionLabel, onAction, variant = "kicker" }: Props) {
  const { colors: c } = useAppTheme();
  return (
    <View style={styles.row}>
      <Text
        accessibilityRole="header"
        style={
          variant === "kicker"
            ? [Typography.label, styles.kicker, { color: c.faintText }]
            : [Typography.h3, { color: c.text }]
        }
      >
        {variant === "kicker" ? title.toUpperCase() : title}
      </Text>
      {!!actionLabel && (
        <Pressable accessibilityRole="button" accessibilityLabel={`${actionLabel}: ${title}`} onPress={onAction} hitSlop={8}>
          <Text style={[Typography.bodySm, { color: c.tint, fontWeight: "600" }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.xxl,
    marginBottom: Spacing.md,
  },
  kicker: { includeFontPadding: false },
});
