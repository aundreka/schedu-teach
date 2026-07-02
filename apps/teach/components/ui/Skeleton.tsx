import React, { useEffect } from "react";
import { type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useAppTheme } from "../../context/theme";
import { Radius } from "../../constants/fonts";

type Props = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** Shimmering placeholder block. Compose a few to sketch the loading layout. */
export default function Skeleton({ width = "100%", height = 16, radius = Radius.sm, style }: Props) {
  const { colors: c } = useAppTheme();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0.45);

  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 800, reduceMotion: ReduceMotion.System }),
      -1,
      true
    );
    return () => cancelAnimation(pulse);
  }, [pulse, reduced]);

  const aStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: c.surfaceAlt }, aStyle, style]}
    />
  );
}
