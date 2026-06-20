import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/theme";
import { getLocalePricing, startCheckout } from "../lib/pricing";

export type QuotaType = "lesson_plan" | "subject" | "ai";

type Props = {
  visible: boolean;
  onClose: () => void;
  quotaType: QuotaType;
  regionCode?: string | null;
};

const QUOTA_LABELS: Record<QuotaType, string> = {
  lesson_plan: "lesson plan",
  subject:     "subject",
  ai:          "AI generation",
};

const TIER_ROWS = [
  { label: "Lesson plans", free: "2 lifetime", pro: "10",      max: "20"      },
  { label: "Subjects",     free: "2 total",    pro: "10",      max: "20"      },
  { label: "AI / day",     free: "1",          pro: "5",       max: "20"      },
];

export default function PaywallModal({ visible, onClose, quotaType, regionCode }: Props) {
  const { colors: c } = useAppTheme();
  const pricing = getLocalePricing(regionCode);
  const [loading, setLoading] = useState<"tier1" | "tier2" | null>(null);

  async function handleUpgrade(tier: "tier1" | "tier2") {
    setLoading(tier);
    await startCheckout(tier, regionCode);
    setLoading(null);
    // Modal stays open; AppState listener in _layout.tsx calls refetch() when user returns.
  }

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose} />

      <View style={[styles.sheet, { backgroundColor: c.card, borderColor: c.border }]}>
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: c.border }]} />

        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.lockCircle, { backgroundColor: c.background }]}>
            <Ionicons name="lock-closed" size={22} color={c.tint} />
          </View>
          <Text style={[styles.title, { color: c.text }]}>
            {"You've reached your "}{QUOTA_LABELS[quotaType]}{" limit"}
          </Text>
          <Text style={[styles.subtitle, { color: c.mutedText }]}>
            Upgrade to continue creating more
          </Text>
        </View>

        {/* Tier comparison table */}
        <View style={[styles.table, { borderColor: c.border }]}>
          {/* Column headers */}
          <View style={[styles.tableRow, styles.tableHeader, { borderBottomColor: c.border }]}>
            <Text style={[styles.tableFeature, { color: c.mutedText }]}>Feature</Text>
            <Text style={[styles.tableCell, { color: c.mutedText }]}>Free</Text>
            <Text style={[styles.tableCell, styles.proCol, { color: c.tint }]}>PRO</Text>
            <Text style={[styles.tableCell, styles.maxCol, { color: "#B45309" }]}>MAX</Text>
          </View>

          {TIER_ROWS.map((row) => (
            <View
              key={row.label}
              style={[styles.tableRow, { borderBottomColor: c.border }]}
            >
              <Text style={[styles.tableFeature, { color: c.text }]}>{row.label}</Text>
              <Text style={[styles.tableCell, { color: c.mutedText }]}>{row.free}</Text>
              <Text style={[styles.tableCell, styles.proCol, { color: c.text }]}>{row.pro}</Text>
              <Text style={[styles.tableCell, styles.maxCol, { color: c.text }]}>{row.max}</Text>
            </View>
          ))}
        </View>

        {/* CTAs */}
        <View style={styles.buttons}>
          <Pressable
            onPress={() => handleUpgrade("tier1")}
            disabled={loading !== null}
            style={[styles.proBtn, { borderColor: c.tint, opacity: loading ? 0.7 : 1 }]}
          >
            {loading === "tier1" ? (
              <ActivityIndicator size="small" color={c.tint} />
            ) : (
              <>
                <Text style={[styles.btnLabel, { color: c.tint }]}>Upgrade to PRO</Text>
                <Text style={[styles.btnPrice, { color: c.tint }]}>{pricing.tier1Price}/mo</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={() => handleUpgrade("tier2")}
            disabled={loading !== null}
            style={[styles.maxBtn, { backgroundColor: "#B45309", opacity: loading ? 0.7 : 1 }]}
          >
            {loading === "tier2" ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={[styles.btnLabel, { color: "#fff" }]}>Upgrade to MAX</Text>
                <Text style={[styles.btnPrice, { color: "#fff" }]}>{pricing.tier2Price}/mo</Text>
              </>
            )}
          </Pressable>
        </View>

        <Pressable onPress={onClose} style={styles.dismissRow}>
          <Text style={[styles.dismiss, { color: c.mutedText }]}>Maybe later</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
    gap: 6,
  },
  lockCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    textAlign: "center",
  },
  table: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  tableHeader: {
    paddingVertical: 8,
  },
  tableFeature: {
    flex: 2,
    fontSize: 12,
    fontWeight: "500",
  },
  tableCell: {
    flex: 1.5,
    fontSize: 12,
    textAlign: "center",
  },
  proCol: {
    fontWeight: "600",
  },
  maxCol: {
    fontWeight: "600",
  },
  buttons: {
    gap: 10,
    marginBottom: 12,
  },
  proBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  maxBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  btnLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  btnPrice: {
    fontSize: 13,
    fontWeight: "600",
  },
  dismissRow: {
    alignItems: "center",
    paddingVertical: 4,
  },
  dismiss: {
    fontSize: 13,
  },
});
