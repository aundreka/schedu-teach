import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useAppTheme } from "../context/theme";
import { Radius, Spacing, Typography } from "../constants/fonts";

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Props = {
  visible: boolean;
  /** One short line, e.g. "Plan generated!" */
  message: string;
  /** Called after the moment finishes (auto, ~1.6s). */
  onDone: () => void;
};

const CHECK_LENGTH = 60;
const BURST = Array.from({ length: 6 }, (_, i) => (i * Math.PI * 2) / 6);

/**
 * The success beat for big moments (first plan generated, activity created,
 * plan completed). Used sparingly — everyday saves get a Toast instead.
 */
export default function SuccessMoment({ visible, message, onDone }: Props) {
  const { colors: c } = useAppTheme();
  const reduced = useReducedMotion();

  const circle = useSharedValue(0);
  const draw = useSharedValue(0);
  const burst = useSharedValue(0);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    if (reduced) {
      circle.value = 1;
      draw.value = 1;
      fade.value = 1;
      const t = setTimeout(onDone, 1200);
      return () => clearTimeout(t);
    }
    fade.value = withTiming(1, { duration: 140 });
    circle.value = withSpring(1, { damping: 12, stiffness: 220, reduceMotion: ReduceMotion.System });
    draw.value = withDelay(160, withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) }));
    burst.value = withDelay(220, withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) }));
    fade.value = withDelay(
      1350,
      withTiming(0, { duration: 220 }, (finished) => {
        if (finished) runOnJS(onDone)();
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduced]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: circle.value }],
  }));
  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_LENGTH * (1 - draw.value),
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: c.backdrop }, overlayStyle]}
      pointerEvents="auto"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
    >
      <View style={styles.center}>
        <View style={styles.burstWrap}>
          {BURST.map((angle, i) => (
            <BurstDot key={i} angle={angle} progress={burst} color={i % 2 === 0 ? c.tint : c.warning} />
          ))}
          <Animated.View style={[styles.circle, { backgroundColor: c.tint }, circleStyle]}>
            <Svg width={54} height={54} viewBox="0 0 54 54">
              <AnimatedPath
                d="M14 28 l9 9 l17 -18"
                stroke={c.onTint}
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                strokeDasharray={`${CHECK_LENGTH}`}
                animatedProps={checkProps}
              />
            </Svg>
          </Animated.View>
        </View>
        <Text style={[Typography.h2, styles.message, { color: "#FFFFFF" }]}>{message}</Text>
      </View>
    </Animated.View>
  );
}

function BurstDot({
  angle,
  progress,
  color,
}: {
  angle: number;
  progress: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const dist = 56 * progress.value;
    return {
      opacity: 1 - progress.value,
      transform: [
        { translateX: Math.cos(angle) * dist },
        { translateY: Math.sin(angle) * dist },
        { scale: 1 - progress.value * 0.4 },
      ],
    };
  });
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    elevation: 24,
  },
  center: { alignItems: "center", gap: Spacing.lg },
  burstWrap: { alignItems: "center", justifyContent: "center" },
  circle: {
    width: 88,
    height: 88,
    borderRadius: Radius.round,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    position: "absolute",
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  message: { textAlign: "center", maxWidth: 260 },
});
