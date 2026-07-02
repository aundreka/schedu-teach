import React from "react";
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AnimatedPressable from "../AnimatedPressable";
import { useAppTheme } from "../../context/theme";
import { Radius, Spacing, Typography } from "../../constants/fonts";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type Props = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Layout style for the outer pressable (margins, alignSelf, flex). */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

const HEIGHTS: Record<Size, number> = { sm: 36, md: 46, lg: 52 };

export default function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  style,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const { colors: c } = useAppTheme();
  const blocked = disabled || loading;

  const palette = (() => {
    switch (variant) {
      case "primary":
        return { bg: c.tint, fg: c.onTint, border: "transparent" };
      case "secondary":
        return { bg: c.surfaceAlt, fg: c.text, border: "transparent" };
      case "ghost":
        return { bg: "transparent", fg: c.tint, border: c.border };
      case "danger":
        return { bg: c.dangerSoft, fg: c.danger, border: "transparent" };
    }
  })();

  const textStyle = size === "sm" ? Typography.bodySm : Typography.bodyMedium;

  return (
    <AnimatedPressable
      onPress={blocked ? undefined : onPress}
      disabled={blocked}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: blocked, busy: loading }}
      animatedStyle={[
        styles.base,
        {
          height: HEIGHTS[size],
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: variant === "ghost" ? StyleSheet.hairlineWidth * 2 : 0,
          opacity: blocked && !loading ? 0.5 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={size === "sm" ? 15 : 18} color={palette.fg} /> : null}
          <Text style={[textStyle, styles.title, { color: palette.fg }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  title: { fontWeight: "600" },
});
