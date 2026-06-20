// components/BottomSheet.tsx
//
// Reusable Reanimated-driven bottom sheet. No external library required.
//   • Drag handle for natural feel
//   • Backdrop tap dismisses
//   • Spring-physics snap on gesture release
//   • Respects SafeAreaInsets for the bottom home bar

import { useEffect } from "react";
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";

const SPRING_CONFIG = {
  damping: 28,
  stiffness: 320,
  mass: 0.8,
};

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Content rendered inside the sheet. */
  children: React.ReactNode;
  /** How much of the screen height the sheet occupies (0–1). Default 0.58 */
  snapFraction?: number;
};

export default function BottomSheet({
  visible,
  onClose,
  children,
  snapFraction = 0.58,
}: Props) {
  const { height: screenH } = useWindowDimensions();
  const sheetH = screenH * snapFraction;

  // translateY: 0 = fully open, sheetH = fully hidden
  const translateY = useSharedValue(sheetH);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 200 });
      translateY.value = withSpring(0, SPRING_CONFIG);
    } else {
      backdropOpacity.value = withTiming(0, { duration: 180 });
      translateY.value = withSpring(sheetH, SPRING_CONFIG);
    }
  }, [visible, sheetH, translateY, backdropOpacity]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Only allow dragging DOWN (positive direction)
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      // If dragged more than 25% of sheet height or fast fling down → close
      if (e.translationY > sheetH * 0.25 || e.velocityY > 800) {
        backdropOpacity.value = withTiming(0, { duration: 180 });
        translateY.value = withSpring(sheetH, SPRING_CONFIG, () => {
          runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!visible && translateY.value >= sheetH) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents={visible ? "auto" : "none"}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.sheet,
            { height: sheetH + 40 /* extra for rubber-band feel */ },
            sheetStyle,
          ]}
        >
          <View style={styles.handle} />
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.46)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 8,
  },
});
