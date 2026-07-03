-- =========================
-- BILLING EXPIRY ENFORCEMENT
--
-- PH checkout is a ONE-TIME PayMongo payment that grants a 30-day period
-- (see create-paymongo-checkout / paymongo-webhook). Nothing external flips
-- status when that period lapses, so the DB must enforce current_period_end
-- at read time — otherwise a single ₱99 payment grants the tier forever.
--
--   - current_effective_tier(): collapse to 'free' once current_period_end
--     has passed (a NULL period end never expires — the default free row).
--   - get_subscription_status(): same collapse, and surfaces status
--     'expired' so the app can prompt renewal instead of showing "active".
--
-- Also correct defense-in-depth for Stripe: renewals move current_period_end
-- forward via stripe-webhook, and failed renewals already set past_due.
-- =========================

create or replace function public.current_effective_tier()
returns public.subscription_tier
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tier public.subscription_tier;
  v_status public.subscription_status;
  v_period_end timestamptz;
begin
  select s.tier, s.status, s.current_period_end
  into v_tier, v_status, v_period_end
  from public.subscriptions s
  where s.user_id = auth.uid();

  if v_tier is null or v_status is distinct from 'active' then
    return 'free';
  end if;

  if v_period_end is not null and v_period_end < now() then
    return 'free';
  end if;

  return v_tier;
end $$;

grant execute on function public.current_effective_tier() to authenticated;

create or replace function public.get_subscription_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid                 uuid := auth.uid();
  v_tier                public.subscription_tier;
  v_status              public.subscription_status;
  v_period_end          timestamptz;
  v_cancel_at_period_end boolean;
  v_lp_count            integer;
  v_subj_count          integer;
  v_ai_used             integer;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select s.tier, s.status, s.current_period_end, s.cancel_at_period_end
  into v_tier, v_status, v_period_end, v_cancel_at_period_end
  from public.subscriptions s
  where s.user_id = v_uid;

  -- Collapse missing row or non-active status to free.
  if v_tier is null or v_status is distinct from 'active' then
    v_tier := 'free';
  end if;

  -- Collapse a lapsed period to free and surface it as 'expired'.
  if v_status = 'active' and v_period_end is not null and v_period_end < now() then
    v_tier   := 'free';
    v_status := 'expired';
  end if;

  -- Lesson plan count: free counts all (archived included); paid counts active only.
  if v_tier = 'free' then
    select count(*)::integer into v_lp_count
    from public.lesson_plans
    where user_id = v_uid;
  else
    select count(*)::integer into v_lp_count
    from public.lesson_plans
    where user_id = v_uid and archived_at is null;
  end if;

  -- Subject count: total user_subjects rows.
  select count(*)::integer into v_subj_count
  from public.user_subjects
  where user_id = v_uid;

  -- AI count: today's usage.
  select coalesce(ai_generations_used, 0) into v_ai_used
  from public.usage_quotas
  where user_id = v_uid and period_day = current_date;

  return jsonb_build_object(
    'tier',                 v_tier,
    'status',               coalesce(v_status, 'active'::public.subscription_status),
    'current_period_end',   v_period_end,
    'cancel_at_period_end', coalesce(v_cancel_at_period_end, false),
    'lesson_plans_used',    coalesce(v_lp_count, 0),
    'lesson_plans_limit',   public.tier_lesson_plan_limit(v_tier),
    'subjects_used',        coalesce(v_subj_count, 0),
    'subjects_limit',       public.tier_subject_limit(v_tier),
    'ai_used_today',        coalesce(v_ai_used, 0),
    'ai_daily_limit',       public.tier_ai_daily_limit(v_tier)
  );
end $$;

grant execute on function public.get_subscription_status() to authenticated;
