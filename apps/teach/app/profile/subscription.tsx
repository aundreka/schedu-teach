import React, { useCallback, useEffect, useState } from "react";
import {
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
import { LinearGradient } from "expo-linear-gradient";
import { useAppTheme } from "../../context/theme";
import { useSubscriptionContext } from "../../context/subscription";
import { getLocalePricing, startCheckout, getBillingManageUrl } from "../../lib/pricing";
import { supabase } from "../../lib/supabase";
import type { SubscriptionTier } from "../../hooks/useSubscription";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  ListRow,
  ProgressRing,
  SectionHeader,
  Skeleton,
} from "../../components/ui";
import { Spacing, Typography } from "../../constants/fonts";

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

const TIER_BADGE_TONE: Record<SubscriptionTier, "neutral" | "pro" | "max"> = {
  free:  "neutral",
  tier1: "pro",
  tier2: "max",
};

// ── Usage ring ───────────────────────────────────────────────────────────────

function UsageRing({
  sublabel,
  a11yLabel,
  used,
  limit,
}: {
  sublabel: string;
  a11yLabel: string;
  used: number;
  limit: number;
}) {
  const overLimit = used >= limit;
  return (
    <ProgressRing
      size={76}
      value={used / Math.max(limit, 1)}
      label={`${used}/${limit}`}
      sublabel={sublabel}
      danger={overLimit}
      accessibilityLabel={`${a11yLabel}: ${used} of ${limit} used`}
    />
  );
}

// ── Tier card ────────────────────────────────────────────────────────────────

function TierCard({
  tier,
  currentTier,
  recommended,
  price,
  onUpgrade,
  upgrading,
}: {
  tier: SubscriptionTier;
  currentTier: SubscriptionTier;
  recommended: boolean;
  price: string;
  onUpgrade?: () => void;
  upgrading: boolean;
}) {
  const { colors: c } = useAppTheme();
  const isCurrent = tier === currentTier;

  const ROWS = [
    { label: "Lesson plans", values: { free: "2 lifetime", tier1: "10",      tier2: "20"  } },
    { label: "Subjects",     values: { free: "2 total",    tier1: "10",      tier2: "20"  } },
    { label: "Auto activity/exam · day", values: { free: "1",          tier1: "5",       tier2: "20"  } },
  ];

  return (
    <Card
      variant="flat"
      style={[
        tierCardStyles.card,
        recommended && { borderWidth: 1.5, borderColor: c.tint },
      ]}
    >
      <View style={tierCardStyles.top}>
        <Text style={[Typography.h3, { color: c.text }]}>{TIER_NAMES[tier]}</Text>
        <Badge label={TIER_SHORT[tier]} tone={TIER_BADGE_TONE[tier]} />
      </View>

      <Text style={[Typography.h2, { color: c.text }]}>
        {tier === "free" ? "Free" : `${price}/mo`}
      </Text>

      <View style={tierCardStyles.rows}>
        {ROWS.map((row) => (
          <View key={row.label} style={tierCardStyles.row}>
            <Text style={[Typography.bodySm, { color: c.mutedText }]}>{row.label}</Text>
            <Text style={[Typography.bodySm, { color: c.text, fontWeight: "600" }]}>
              {row.values[tier]}
            </Text>
          </View>
        ))}
      </View>

      {isCurrent ? (
        <Button title="Current plan" variant="secondary" disabled />
      ) : tier !== "free" && onUpgrade ? (
        <Button
          title={`Upgrade to ${TIER_SHORT[tier]}`}
          onPress={onUpgrade}
          loading={upgrading}
          accessibilityLabel={`Upgrade to the ${TIER_SHORT[tier]} plan, ${price} per month`}
        />
      ) : null}
    </Card>
  );
}

const tierCardStyles = StyleSheet.create({
  card: { gap: Spacing.sm },
  top:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rows: { gap: Spacing.xs, marginBottom: Spacing.xs },
  row:  { flexDirection: "row", justifyContent: "space-between" },
});

// ── Main screen ──────────────────────────────────────────────────────────────

export default function SubscriptionScreen() {
  const { colors: c } = useAppTheme();
  const sub = useSubscriptionContext();
  const [upgrading, setUpgrading] = useState<"tier1" | "tier2" | null>(null);
  const [billingHistory, setBillingHistory] = useState<BillingEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);

  const regionCode = Localization.getLocales()[0]?.regionCode ?? null;
  const pricing = getLocalePricing(regionCode);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(false);
    const { data, error } = await supabase.rpc("get_billing_history");
    if (error) setHistoryError(true);
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

  // The paid tier one step above the current one gets the highlight ring.
  const recommendedTier: SubscriptionTier | null =
    sub.tier === "free" ? "tier1" : sub.tier === "tier1" ? "tier2" : null;

  const planMeta =
    sub.tier === "free"
      ? "No expiry"
      : sub.currentPeriodEnd
        ? sub.cancelAtPeriodEnd
          ? `Cancels ${formatDate(sub.currentPeriodEnd)}`
          : `Renews ${formatDate(sub.currentPeriodEnd)}`
        : null;

  const loadFailed = !!sub.error && !sub.isLoading;

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
          <Text style={[Typography.h2, styles.screenTitle, { color: c.text }]}>My Plan</Text>
          <View style={styles.backBtn} />
        </View>

        {loadFailed ? (
          <ErrorState
            title="Couldn't load your plan"
            body="Check your connection and try again."
            onRetry={() => void sub.refetch()}
          />
        ) : (
          <>
            {/* Hero: current plan */}
            <Card padded={false} style={styles.hero}>
              <LinearGradient
                colors={[c.tintSoft, "transparent"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.heroInner}>
                <Badge label={TIER_SHORT[sub.tier]} tone={TIER_BADGE_TONE[sub.tier]} />
                <Text style={[Typography.h1, { color: c.text }]}>{TIER_NAMES[sub.tier]}</Text>
                {planMeta ? (
                  <Text style={[Typography.bodySm, { color: c.mutedText }]}>{planMeta}</Text>
                ) : null}
              </View>
            </Card>

            {/* Usage */}
            <SectionHeader title="Usage" />
            <Card style={styles.usageRow}>
              <UsageRing
                sublabel="PLANS"
                a11yLabel="Lesson plans"
                used={sub.lessonPlansUsed}
                limit={sub.lessonPlansLimit}
              />
              <UsageRing
                sublabel="SUBJECTS"
                a11yLabel="Subjects"
                used={sub.subjectsUsed}
                limit={sub.subjectsLimit}
              />
              <UsageRing
                sublabel="AI TODAY"
                a11yLabel="Automated activities and exams today"
                used={sub.aiUsedToday}
                limit={sub.aiDailyLimit}
              />
            </Card>

            {/* Plans */}
            <SectionHeader title="Plans" />
            <View style={styles.tierGrid}>
              <TierCard
                tier="free"
                currentTier={sub.tier}
                recommended={false}
                price="Free"
                upgrading={false}
              />
              <TierCard
                tier="tier1"
                currentTier={sub.tier}
                recommended={recommendedTier === "tier1"}
                price={pricing.tier1Price}
                onUpgrade={() => handleUpgrade("tier1")}
                upgrading={upgrading === "tier1"}
              />
              <TierCard
                tier="tier2"
                currentTier={sub.tier}
                recommended={recommendedTier === "tier2"}
                price={pricing.tier2Price}
                onUpgrade={() => handleUpgrade("tier2")}
                upgrading={upgrading === "tier2"}
              />
            </View>

            <Text style={[Typography.caption, styles.localeNote, { color: c.mutedText }]}>
              Prices shown in {pricing.currency} based on your region.
              {"\n"}Billed monthly. Cancel anytime.
            </Text>

            {/* Billing history */}
            <SectionHeader title="Billing history" />
            {historyLoading ? (
              <View style={styles.historySkeletons}>
                <Skeleton height={44} />
                <Skeleton height={44} />
                <Skeleton height={44} />
              </View>
            ) : historyError ? (
              <View style={styles.historyErrorWrap}>
                <Text style={[Typography.bodySm, styles.emptyHistory, { color: c.mutedText }]}>
                  Couldn&apos;t load your billing history.
                </Text>
                <Button
                  title="Retry"
                  variant="ghost"
                  size="sm"
                  onPress={() => void loadHistory()}
                  style={styles.historyRetryBtn}
                />
              </View>
            ) : billingHistory.length === 0 ? (
              <Text style={[Typography.bodySm, styles.emptyHistory, { color: c.mutedText }]}>
                No billing history yet.
              </Text>
            ) : (
              billingHistory.map((evt, i) => {
                const date = new Date(evt.occurred_at).toLocaleDateString(undefined, {
                  year: "numeric", month: "short", day: "numeric",
                });
                const amountStr = evt.amount_cents != null && evt.currency
                  ? `${evt.currency} ${(evt.amount_cents / 100).toFixed(2)}`
                  : undefined;
                return (
                  <ListRow
                    key={evt.billing_event_id}
                    title={evt.description ?? evt.event_type}
                    subtitle={date}
                    value={amountStr}
                    chevron={false}
                    divider={i < billingHistory.length - 1}
                  />
                );
              })
            )}

            {/* Manage / cancel (paid users only) */}
            {sub.tier !== "free" && (
              <Button
                title="Manage or cancel subscription"
                variant="ghost"
                onPress={() => Linking.openURL(getBillingManageUrl())}
                style={styles.manageBtn}
                accessibilityHint="Opens the billing portal in your browser"
              />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  content:      { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 40 },
  topRow:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.sm },
  backBtn:      { width: 36, alignItems: "flex-start" },
  screenTitle:  { fontWeight: "700" },
  hero:         { overflow: "hidden" },
  heroInner:    { padding: Spacing.lg, gap: Spacing.sm },
  usageRow:     { flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  tierGrid:     { gap: Spacing.md },
  localeNote:   { textAlign: "center", marginTop: Spacing.lg },
  historySkeletons: { gap: Spacing.sm },
  historyErrorWrap: { alignItems: "center" },
  historyRetryBtn:  { marginTop: Spacing.sm, alignSelf: "center" },
  emptyHistory: { textAlign: "center", paddingVertical: Spacing.md },
  manageBtn:    { marginTop: Spacing.xxl },
});
