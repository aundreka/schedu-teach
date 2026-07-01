import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type SubscriptionTier = "free" | "tier1" | "tier2";
export type SubscriptionStatus = "active" | "canceled" | "past_due" | "expired";

export type SubscriptionState = {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lessonPlansUsed: number;
  lessonPlansLimit: number;
  subjectsUsed: number;
  subjectsLimit: number;
  aiUsedToday: number;
  aiDailyLimit: number;
  // Derived
  lessonPlanQuotaExceeded: boolean;
  subjectQuotaExceeded: boolean;
  aiQuotaExceeded: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

const DEFAULTS: Omit<SubscriptionState, "refetch"> = {
  tier: "free",
  status: "active",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  lessonPlansUsed: 0,
  lessonPlansLimit: 2,
  subjectsUsed: 0,
  subjectsLimit: 2,
  aiUsedToday: 0,
  aiDailyLimit: 1,
  lessonPlanQuotaExceeded: false,
  subjectQuotaExceeded: false,
  aiQuotaExceeded: false,
  isLoading: true,
  error: null,
};

export function useSubscription(): SubscriptionState {
  const [state, setState] = useState<Omit<SubscriptionState, "refetch">>(DEFAULTS);

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const { data, error } = await supabase.rpc("get_subscription_status");
      if (error) throw error;

      const d = data as Record<string, unknown>;
      const lpUsed  = Number(d.lesson_plans_used  ?? 0);
      const lpLimit = Number(d.lesson_plans_limit  ?? 2);
      const sUsed   = Number(d.subjects_used       ?? 0);
      const sLimit  = Number(d.subjects_limit      ?? 2);
      const aiUsed  = Number(d.ai_used_today       ?? 0);
      const aiLimit = Number(d.ai_daily_limit      ?? 1);

      setState({
        tier:               (d.tier as SubscriptionTier)     ?? "free",
        status:             (d.status as SubscriptionStatus) ?? "active",
        currentPeriodEnd:   (d.current_period_end as string) ?? null,
        cancelAtPeriodEnd:  Boolean(d.cancel_at_period_end),
        lessonPlansUsed:    lpUsed,
        lessonPlansLimit:   lpLimit,
        subjectsUsed:       sUsed,
        subjectsLimit:      sLimit,
        aiUsedToday:        aiUsed,
        aiDailyLimit:       aiLimit,
        lessonPlanQuotaExceeded: lpUsed >= lpLimit,
        subjectQuotaExceeded:    sUsed  >= sLimit,
        aiQuotaExceeded:         aiUsed >= aiLimit,
        isLoading: false,
        error: null,
      });
    } catch (e: unknown) {
      // A transient RPC failure must not present free-tier limits as truth and
      // lock a paid user out of the UI. Keep last-known state but never show a
      // quota as exceeded on uncertain data — the server RPCs (create_lesson_plan,
      // increment_ai_quota) remain the authoritative enforcement.
      setState((s) => ({
        ...s,
        lessonPlanQuotaExceeded: false,
        subjectQuotaExceeded: false,
        aiQuotaExceeded: false,
        isLoading: false,
        error: e instanceof Error ? e.message : "Failed to load subscription",
      }));
    }
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  return { ...state, refetch };
}
