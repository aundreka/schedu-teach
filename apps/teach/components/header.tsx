import React from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAppTheme } from "../context/theme";
import { useSubscriptionContext } from "../context/subscription";
import type { SubscriptionTier } from "../hooks/useSubscription";

function TierBadge({ tier }: { tier: SubscriptionTier }) {
  const { colors: c } = useAppTheme();
  const label = tier === "free" ? "FREE" : tier === "tier1" ? "PRO" : "MAX";
  const bg    = tier === "free" ? c.border : tier === "tier1" ? "#FFF3CD" : "#E8F5E9";
  const color = tier === "free" ? c.mutedText : tier === "tier1" ? "#B45309" : c.tint;
  return (
    <View style={[badgeStyles.pill, { backgroundColor: bg }]}>
      <Text style={[badgeStyles.label, { color }]}>{label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  pill:  { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  label: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
});

export default function AppHeader() {
  const { colors: c } = useAppTheme();
  const insets = useSafeAreaInsets();
  const sub = useSubscriptionContext();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 10, backgroundColor: c.card }]}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Image source={require("../assets/images/icon.png")} style={styles.logo} />
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text style={[styles.brandGray, { color: c.mutedText }]}>SCH</Text>
            <Text style={[styles.brandGreen, { color: c.tint }]}>EDU</Text>
          </View>
        </View>

        <View style={styles.right}>
          <Pressable onPress={() => router.push("/profile/subscription")} style={styles.badgeBtn}>
            <TierBadge tier={sub.tier} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/profile")}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Profile"
          >
            <Ionicons name="person-outline" size={22} color={c.mutedText} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: c.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  row: {
    height: 44,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  left:      { flexDirection: "row", alignItems: "center", gap: 10 },
  right:     { flexDirection: "row", alignItems: "center", gap: 4 },
  logo:      { width: 28, height: 28, resizeMode: "contain" },
  badgeBtn:  { paddingHorizontal: 4, paddingVertical: 6 },
  iconBtn:   { paddingHorizontal: 8, paddingVertical: 6 },
  divider:   { height: 1 },
  brandGray:  { fontSize: 22, letterSpacing: 1, fontWeight: "600" },
  brandGreen: { fontSize: 22, letterSpacing: 1, fontWeight: "700" },
});
