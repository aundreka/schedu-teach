import React from "react";
import { StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AnimatedPressable from "../AnimatedPressable";
import { useAppTheme } from "../../context/theme";
import { Radius, Spacing, Typography } from "../../constants/fonts";
import type { CategoryKey } from "../../constants/colors";

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Colors the chip from the session-category ramp instead of the brand tint. */
  category?: CategoryKey;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Selectable pill — filters, day toggles, category pickers. */
export default function Chip({ label, selected = false, onPress, category, icon, disabled, style }: Props) {
  const { colors: c } = useAppTheme();
  const tone = category ? c.category[category] : { base: c.tint, soft: c.tintSoft, onSoft: c.tintDeep, border: c.tint };

  const bg = selected ? tone.soft : c.surfaceAlt;
  const fg = selected ? tone.onSoft : c.mutedText;
  const border = selected ? tone.border : "transparent";

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: !!disabled }}
      animatedStyle={[styles.base, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : 1 }]}
    >
      {icon ? <Ionicons name={icon} size={14} color={fg} /> : null}
      <Text style={[Typography.bodySm, styles.label, { color: fg }]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radius.round,
    borderWidth: 1.5,
  },
  label: { fontWeight: "600" },
});
