import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Localization from "expo-localization";
import { useAppTheme } from "../../context/theme";
import { useSubscriptionContext } from "../../context/subscription";
import { getLocalePricing, startCheckout, getBillingManageUrl } from "../../lib/pricing";
import { supabase } from "../../lib/supabase";
import type { SubscriptionTier } from "../../hooks/useSubscription";

type BillingEvent = {
  billing_event_id: string;
  event_type: string;
  tier: SubscriptionTier | null;
  amount_cents: number | null;
  currency: string | null;
  description: string | null;
  occurred_at: string;
};

const TIER_NAMES: Record<SubscriptionTier, string> = {
  free:  "Free Plan",
  tier1: "PRO Plan",
  tier2: "MAX Plan",
};

const TIER_SHORT: Record<SubscriptionTier, string> = {
  free:  "FREE",
  tier1: "PRO",
  tier2: "MAX",
};

function badgeColors(tier: SubscriptionTier, c: ReturnType<typeof useAppTheme>["colors"]) {
  if (tier === "tier1") return { bg: "#FFF3CD", text: "#B45309" };
  if (tier === "tier2") return { bg: "#E8F5E9", text: c.tint };
  return { bg: c.border, text: c.mutedText };
}

// ── Usage bar ────────────────────────────────────────────────────────────────

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const { colors: c } = useAppTheme();
  const pct = Math.min((used / Math.max(limit, 1)) * 100, 100);
  const overLimit = used >= limit;

  return (
    <View style={usageStyles.wrap}>
      <View style={usageStyles.row}>
        <Text style={[usageStyles.label, { color: c.text }]}>{label}</Text>
        <Text style={[usageStyles.count, { color: overLimit ? "#EF4444" : c.mutedText }]}>
          {used} / {limit}
        </Text>
      </View>
      <View style={[usageStyles.track, { backgroundColor: c.border }]}>
        <View
          style={[
            usageStyles.fill,
            { width: `${pct}%`, backgroundColor: overLimit ? "#EF4444" : c.tint },
          ]}
        />
      </View>
    </View>
  );
}

const usageStyles = StyleSheet.create({
  wrap:  { gap: 6 },
  row:   { flexDirection: "row", justifyContent: "space-between" },
  label: { fontSize: 13, fontWeight: "500" },
  count: { fontSize: 12 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill:  { height: 6, borderRadius: 3 },
});

// ── Tier card ────────────────────────────────────────────────────────────────

function TierCard({
  tier,
  currentTier,
  price,
  onUpgrade,
  upgrading,
}: {
  tier: SubscriptionTier;
  currentTier: SubscriptionTier;
  price: string;
  onUpgrade?: () => void;
  upgrading: boolean;
}) {
  const { colors: c } = useAppTheme();
  const isCurrent = tier === currentTier;
  const badge = badgeColors(tier, c);

  const ROWS = [
    { label: "Lesson plans", values: { free: "2 lifetime", tier1: "10",      tier2: "20"  } },
    { label: "Subjects",     values: { free: "2 total",    tier1: "10",      tier2: "20"  } },
    { label: "AI / day",     values: { free: "1",          tier1: "5",       tier2: "20"  } },
  ];

  return (
    <View
      style={[
        tierCardStyles.card,
        {
          backgroundColor: c.card,
          borderColor: isCurrent ? c.tint : c.border,
          borderWidth: isCurrent ? 1.5 : 1,
        },
      ]}
    >
      <View style={tierCardStyles.top}>
        <View style={[tierCardStyles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[tierCardStyles.badgeText, { color: badge.text }]}>
            {TIER_SHORT[tier]}
          </Text>
        </View>
        <Text style={[tierCardStyles.price, { color: c.text }]}>
          {tier === "free" ? "Free" : `${price}/mo`}
        </Text>
      </View>

      {ROWS.map((row) => (
        <View key={row.label} style={tierCardStyles.row}>
          <Text style={[tierCardStyles.rowLabel, { color: c.mutedText }]}>{row.label}</Text>
          <Text style={[tierCardStyles.rowValue, { color: c.text }]}>
            {row.values[tier]}
          </Text>
        </View>
      ))}

      {isCurrent ? (
        <View style={[tierCardStyles.currentBadge, { backgroundColor: c.background }]}>
          <Text style={[tierCardStyles.currentText, { color: c.tint }]}>Current plan</Text>
        </View>
      ) : tier !== "free" && onUpgrade ? (
        <Pressable
          onPress={onUpgrade}
          disabled={upgrading}
          style={[tierCardStyles.upgradeBtn, { backgroundColor: c.tint, opacity: upgrading ? 0.7 : 1 }]}
        >
          {upgrading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={tierCardStyles.upgradeBtnText}>Upgrade to {TIER_SHORT[tier]}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const tierCardStyles = StyleSheet.create({
  card:         { borderRadius: 14, padding: 14, gap: 8 },
  top:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  badge:        { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:    { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  price:        { fontSize: 16, fontWeight: "700" },
  row:          { flexDirection: "row", justifyContent: "space-between" },
  rowLabel:     { fontSize: 12 },
  rowValue:     { fontSize: 12, fontWeight: "600" },
  currentBadge: { borderRadius: 8, paddingVertical: 9, alignItems: "center", marginTop: 4 },
  currentText:  { fontSize: 13, fontWeight: "600" },
  upgradeBtn:   { borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 4 },
  upgradeBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});

// ── Main screen ──────────────────────────────────────────────────────────────

export default function SubscriptionScreen() {
  const { colors: c } = useAppTheme();
  const sub = useSubscriptionContext();
  const [upgrading, setUpgrading] = useState<"tier1" | "tier2" | null>(null);
  const [billingHistory, setBillingHistory] = useState<BillingEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const regionCode = Localization.getLocales()[0]?.regionCode ?? null;
  const pricing = getLocalePricing(regionCode);
  const badge = badgeColors(sub.tier, c);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const { data } = await supabase.rpc("get_billing_history");
    if (data) setBillingHistory(data as BillingEvent[]);
    setHistoryLoading(false);
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const handleUpgrade = async (tier: "tier1" | "tier2") => {
    setUpgrading(tier);
    await startCheckout(tier, regionCode);
    setUpgrading(null);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={sub.isLoading} onRefresh={sub.refetch} tintColor={c.tint} />
        }
      >
        {/* Top row */}
        <View style={styles.topRow}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={c.text} />
          </Pressable>
          <Text style={[styles.screenTitle, { color: c.text }]}>My Plan</Text>
          <View style={styles.backBtn} />
        </View>

        {/* Current plan card */}
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.planRow}>
            <View style={[styles.planBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.planBadgeText, { color: badge.text }]}>
                {TIER_SHORT[sub.tier]}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.planName, { color: c.text }]}>{TIER_NAMES[sub.tier]}</Text>
              {sub.tier !== "free" && sub.currentPeriodEnd && (
                <Text style={[styles.planMeta, { color: c.mutedText }]}>
                  {sub.cancelAtPeriodEnd
                    ? `Cancels ${formatDate(sub.currentPeriodEnd)}`
                    : `Renews ${formatDate(sub.currentPeriodEnd)}`}
                </Text>
              )}
              {sub.tier === "free" && (
                <Text style={[styles.planMeta, { color: c.mutedText }]}>No expiry</Text>
              )}
            </View>
          </View>
        </View>

        {/* Usage section */}
        <Text style={[styles.sectionTitle, { color: c.text }]}>Usage</Text>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, gap: 14 }]}>
          <UsageBar label="Lesson Plans" used={sub.lessonPlansUsed} limit={sub.lessonPlansLimit} />
          <UsageBar label="Subjects"     used={sub.subjectsUsed}    limit={sub.subjectsLimit}    />
          <UsageBar label="AI Today"     used={sub.aiUsedToday}     limit={sub.aiDailyLimit}     />
        </View>

        {/* Plans section */}
        <Text style={[styles.sectionTitle, { color: c.text }]}>Plans</Text>
        <View style={styles.tierGrid}>
          <TierCard
            tier="free"
            currentTier={sub.tier}
            price="Free"
            upgrading={false}
          />
          <TierCard
            tier="tier1"
            currentTier={sub.tier}
            price={pricing.tier1Price}
            onUpgrade={() => handleUpgrade("tier1")}
            upgrading={upgrading === "tier1"}
          />
          <TierCard
            tier="tier2"
            currentTier={sub.tier}
            price={pricing.tier2Price}
            onUpgrade={() => handleUpgrade("tier2")}
            upgrading={upgrading === "tier2"}
          />
        </View>

        <Text style={[styles.localeNote, { color: c.mutedText }]}>
          Prices shown in {pricing.currency} based on your region.
          {"\n"}Billed monthly. Cancel anytime.
        </Text>

        {/* Billing History */}
        <Text style={[styles.sectionTitle, { color: c.text }]}>Billing History</Text>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          {historyLoading ? (
            <ActivityIndicator color={c.tint} style={{ paddingVertical: 12 }} />
          ) : billingHistory.length === 0 ? (
            <Text style={[styles.emptyHistory, { color: c.mutedText }]}>
              No billing history yet.
            </Text>
          ) : (
            billingHistory.map((evt, i) => {
              const isLast = i === billingHistory.length - 1;
              const date = new Date(evt.occurred_at).toLocaleDateString(undefined, {
                year: "numeric", month: "short", day: "numeric",
              });
              const amountStr = evt.amount_cents != null && evt.currency
                ? `${evt.currency} ${(evt.amount_cents / 100).toFixed(2)}`
                : null;
              return (
                <View
                  key={evt.billing_event_id}
                  style={[
                    historyStyles.row,
                    !isLast && { borderBottomWidth: 1, borderBottomColor: c.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[historyStyles.desc, { color: c.text }]}>
                      {evt.description ?? evt.event_type}
                    </Text>
                    <Text style={[historyStyles.date, { color: c.mutedText }]}>{date}</Text>
                  </View>
                  {amountStr && (
                    <Text style={[historyStyles.amount, { color: c.text }]}>{amountStr}</Text>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* Cancel link (paid users only) */}
        {sub.tier !== "free" && (
          <Pressable
            onPress={() => Linking.openURL(getBillingManageUrl())}
            style={styles.cancelRow}
          >
            <Text style={[styles.cancelText, { color: c.mutedText }]}>
              Manage or cancel subscription
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const historyStyles = StyleSheet.create({
  row:    { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 8 },
  desc:   { fontSize: 13, fontWeight: "500" },
  date:   { fontSize: 11, marginTop: 2 },
  amount: { fontSize: 13, fontWeight: "600" },
});

const styles = StyleSheet.create({
  container:    { flex: 1 },
  content:      { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 12 },
  topRow:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  backBtn:      { width: 36, alignItems: "flex-start" },
  screenTitle:  { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  sectionTitle: { fontSize: 14, fontWeight: "700", marginTop: 4, marginBottom: -4 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  planRow:      { flexDirection: "row", alignItems: "center", gap: 12 },
  planBadge:    { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  planBadgeText: { fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  planName:     { fontSize: 16, fontWeight: "700" },
  planMeta:     { fontSize: 12, marginTop: 2 },
  tierGrid:     { gap: 10 },
  localeNote:   { fontSize: 11, textAlign: "center", lineHeight: 16 },
  cancelRow:    { alignItems: "center", paddingVertical: 4 },
  cancelText:   { fontSize: 13, textDecorationLine: "underline" },
  emptyHistory: { fontSize: 13, textAlign: "center", paddingVertical: 12 },
});
