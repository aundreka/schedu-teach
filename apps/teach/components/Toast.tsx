// components/Toast.tsx
//
// Auto-dismissing floating notification. Slides up from the bottom, lingers,
// then fades out. Replaces Alert.alert for non-critical success/warning messages.

import { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  FadeInUp,
  FadeOutDown,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

export type ToastVariant = "success" | "warning" | "error" | "info";

type Props = {
  visible: boolean;
  message: string;
  variant?: ToastVariant;
  onHide: () => void;
  /** Auto-dismiss after N ms. Default 2600. */
  duration?: number;
};

const PALETTE: Record<ToastVariant, { bg: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  success: { bg: "#10B981", text: "#FFFFFF", icon: "checkmark-circle" },
  warning: { bg: "#F59E0B", text: "#FFFFFF", icon: "warning" },
  error: { bg: "#EF4444", text: "#FFFFFF", icon: "close-circle" },
  info: { bg: "#3B82F6", text: "#FFFFFF", icon: "information-circle" },
};

export default function Toast({
  visible,
  message,
  variant = "success",
  onHide,
  duration = 2600,
}: Props) {
  const palette = PALETTE[variant];

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onHide, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onHide]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(220).springify()}
      exiting={FadeOutDown.duration(180)}
      style={[styles.container, { backgroundColor: palette.bg }]}
      pointerEvents="none"
    >
      <Ionicons name={palette.icon} size={18} color={palette.text} />
      <Text style={[styles.text, { color: palette.text }]} numberOfLines={2}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 9999,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
});
