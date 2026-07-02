import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useAppTheme } from "../../context/theme";
import { Radius, Typography } from "../../constants/fonts";
import type { CategoryKey } from "../../constants/colors";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "pro" | "max";

type Props = {
  label: string;
  tone?: Tone;
  /** Session-category coloring; overrides tone. */
  category?: CategoryKey;
  style?: StyleProp<ViewStyle>;
};

/** Non-interactive status pill — tiers, plan status, session types. */
export default function Badge({ label, tone = "neutral", category, style }: Props) {
  const { colors: c } = useAppTheme();

  const palette = (() => {
    if (category) {
      const t = c.category[category];
      return { bg: t.soft, fg: t.onSoft };
    }
    switch (tone) {
      case "success":
        return { bg: c.tintSoft, fg: c.tintDeep };
      case "warning":
        return { bg: c.warningSoft, fg: c.warning };
      case "danger":
        return { bg: c.dangerSoft, fg: c.danger };
      case "info":
        return { bg: c.infoSoft, fg: c.info };
      case "pro":
        return { bg: c.tierProBg, fg: c.tierProFg };
      case "max":
        return { bg: c.tierMaxBg, fg: c.tierMaxFg };
      default:
        return { bg: c.surfaceAlt, fg: c.mutedText };
    }
  })();

  return (
    <View accessibilityRole="text" style={[styles.base, { backgroundColor: palette.bg }, style]}>
      <Text style={[Typography.label, styles.label, { color: palette.fg }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.round,
  },
  label: { includeFontPadding: false },
});
