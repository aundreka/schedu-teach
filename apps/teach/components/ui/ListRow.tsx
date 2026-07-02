import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AnimatedPressable from "../AnimatedPressable";
import { useAppTheme } from "../../context/theme";
import { Spacing, Typography } from "../../constants/fonts";

type Props = {
  title: string;
  subtitle?: string;
  /** Right-aligned value text (e.g. a setting's current value). */
  value?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onPress?: () => void;
  chevron?: boolean;
  /** Custom right-side element; replaces value/chevron. */
  right?: React.ReactNode;
  /** Hairline divider below the row (default true). */
  divider?: boolean;
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** Flat settings/list row — grouping via hairlines, not nested cards. */
export default function ListRow({
  title,
  subtitle,
  value,
  icon,
  iconColor,
  onPress,
  chevron = !!onPress,
  right,
  divider = true,
  destructive = false,
  style,
  accessibilityLabel,
}: Props) {
  const { colors: c } = useAppTheme();
  const fg = destructive ? c.danger : c.text;

  const content = (
    <>
      <View style={styles.left}>
        {icon ? (
          <View style={[styles.iconWrap, { backgroundColor: c.surfaceAlt }]}>
            <Ionicons name={icon} size={17} color={iconColor ?? (destructive ? c.danger : c.mutedText)} />
          </View>
        ) : null}
        <View style={styles.texts}>
          <Text style={[Typography.body, { color: fg, fontWeight: "500" }]} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={[Typography.caption, { color: c.mutedText }]} numberOfLines={2}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {right ?? (
        <View style={styles.right}>
          {!!value && (
            <Text style={[Typography.bodySm, { color: c.mutedText }]} numberOfLines={1}>
              {value}
            </Text>
          )}
          {chevron && <Ionicons name="chevron-forward" size={16} color={c.faintText} />}
        </View>
      )}
    </>
  );

  const rowStyle = [styles.row, divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline }];

  if (!onPress) {
    return <View style={[rowStyle, style]}>{content}</View>;
  }
  return (
    <AnimatedPressable
      onPress={onPress}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      animatedStyle={rowStyle as StyleProp<ViewStyle>}
    >
      {content}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    minHeight: 52,
  },
  left: { flexDirection: "row", alignItems: "center", gap: Spacing.md, flex: 1 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: { flex: 1, gap: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: 6 },
});
