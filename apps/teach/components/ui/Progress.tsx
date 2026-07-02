import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useAppTheme } from "../../context/theme";
import { Radius, Typography } from "../../constants/fonts";

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

type BarProps = {
  /** 0–1 */
  value: number;
  /** Turns the fill red when the quota is exceeded. */
  danger?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function ProgressBar({ value, danger = false, height = 6, style, accessibilityLabel }: BarProps) {
  const { colors: c } = useAppTheme();
  const pct = Math.round(clamp01(value) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: c.surfaceAlt }, style]}
    >
      <View
        style={{
          width: `${pct}%`,
          height,
          borderRadius: height / 2,
          backgroundColor: danger ? c.danger : c.tint,
        }}
      />
    </View>
  );
}

type RingProps = {
  /** 0–1 */
  value: number;
  size?: number;
  strokeWidth?: number;
  /** Center label, e.g. "W4" or "42%". */
  label?: string;
  sublabel?: string;
  danger?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function ProgressRing({
  value,
  size = 64,
  strokeWidth = 6,
  label,
  sublabel,
  danger = false,
  style,
  accessibilityLabel,
}: RingProps) {
  const { colors: c } = useAppTheme();
  const pct = clamp01(value);
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={[{ width: size, height: size }, styles.ringWrap, style]}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.surfaceAlt} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={danger ? c.danger : c.tint}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={circumference * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        {!!label && <Text style={[Typography.bodySm, { color: c.text, fontWeight: "700" }]}>{label}</Text>}
        {!!sublabel && <Text style={[Typography.label, { color: c.faintText }]}>{sublabel}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: "hidden", borderRadius: Radius.round },
  ringWrap: { alignItems: "center", justifyContent: "center" },
  ringCenter: { position: "absolute", alignItems: "center" },
});
