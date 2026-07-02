// components/Toast.tsx
//
// Auto-dismissing floating notification. Slides up from the bottom, lingers,
// then fades out. Replaces Alert.alert for non-critical success/warning messages.

import { useEffect } from "react";
import { AccessibilityInfo, StyleSheet, Text } from "react-native";
import Animated, {
  FadeInUp,
  FadeOutDown,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/theme";

export type ToastVariant = "success" | "warning" | "error" | "info";

type Props = {
  visible: boolean;
  message: string;
  variant?: ToastVariant;
  onHide: () => void;
  /** Auto-dismiss after N ms. Default 2600. */
  duration?: number;
};

const ICONS: Record<ToastVariant, keyof typeof Ionicons.glyphMap> = {
  success: "checkmark-circle",
  warning: "warning",
  error: "close-circle",
  info: "information-circle",
};

export default function Toast({
  visible,
  message,
  variant = "success",
  onHide,
  duration = 2600,
}: Props) {
  const { colors: c } = useAppTheme();
  const bgByVariant: Record<ToastVariant, string> = {
    success: c.tintDeep,
    warning: c.warning,
    error: c.danger,
    info: c.info,
  };
  const palette = { bg: bgByVariant[variant], text: "#FFFFFF", icon: ICONS[variant] };

  useEffect(() => {
    if (!visible) return;
    // Announce to screen readers (works on iOS where accessibilityLiveRegion
    // isn't honored; Android also gets the live region on the view below).
    if (message) AccessibilityInfo.announceForAccessibility(message);
    const timer = setTimeout(onHide, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onHide, message]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(220).springify()}
      exiting={FadeOutDown.duration(180)}
      style={[styles.container, { backgroundColor: palette.bg }]}
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
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
    shadowColor: "#000000",
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
