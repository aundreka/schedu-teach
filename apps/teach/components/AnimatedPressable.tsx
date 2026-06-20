import React from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

type Props = PressableProps & {
  /** Style applied to the outer Pressable (layout, margin, etc.) */
  style?: StyleProp<ViewStyle>;
  /** Style applied to the inner Animated.View (flex, padding, border, background, etc.) */
  animatedStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

const SPRING_CONFIG = {
  damping: 18,
  stiffness: 260,
  mass: 0.6,
};

export default function AnimatedPressable({
  style,
  animatedStyle,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const scale = useSharedValue(1);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      style={style}
      onPressIn={(e) => {
        scale.value = withSpring(0.96, SPRING_CONFIG);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, SPRING_CONFIG);
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[aStyle, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
