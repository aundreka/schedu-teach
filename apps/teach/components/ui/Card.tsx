import React from "react";
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { useAppTheme } from "../../context/theme";
import { Radius, Spacing } from "../../constants/fonts";

type Props = ViewProps & {
  /**
   * "elevated" is the ONE level of surface elevation in the app. Never nest
   * an elevated Card inside another — use "flat" (surfaceAlt fill, no border)
   * or plain Views + SectionHeader/hairlines for inner grouping.
   */
  variant?: "elevated" | "flat";
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function Card({ variant = "elevated", padded = true, style, children, ...rest }: Props) {
  const { colors: c, scheme } = useAppTheme();
  return (
    <View
      {...rest}
      style={[
        styles.base,
        padded && styles.padded,
        variant === "elevated"
          ? {
              backgroundColor: c.card,
              borderColor: c.border,
              borderWidth: StyleSheet.hairlineWidth,
              shadowColor: c.shadow,
              shadowOpacity: scheme === "dark" ? 0.4 : 0.06,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 2,
            }
          : { backgroundColor: c.surfaceAlt },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: Radius.lg },
  padded: { padding: Spacing.lg },
});
