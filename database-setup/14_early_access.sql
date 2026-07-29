-- =========================
-- EARLY ACCESS MODE
--
-- Launch strategy: "free during early access". While the flag is on, every
-- authenticated user is treated as tier2 (MAX) by all quota enforcement, and
-- get_subscription_status() reports early_access so the app can label the
-- plan badge "EARLY ACCESS" instead of MAX.
--
-- Turning the paywall on later is a single row update:
--   update public.app_settings set early_access = false;
-- No app release required; clients pick it up on their next status fetch.
--
-- Tier2 daily AI limits still apply during early access, so the flag cannot
-- be abused into unlimited generation spend.
-- =========================

-- Single-row settings table. The primary-key check makes a second row
-- unrepresentable.
create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  early_access boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
-- No policies: only security-definer functions read this table.

insert into public.app_settings (id, early_access)
values (true, true)
on conflict (id) do update set early_access = true, updated_at = now();

create or replace function public.early_access_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select early_access from public.app_settings where id), false);
$$;

grant execute on function public.early_access_enabled() to authenticated;

-- Override at the single tier-resolution point every quota check goes
-- through (create_lesson_plan, increment_ai_quota, subject limit, onboarding).
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
  if public.early_access_enabled() then
    return 'tier2';
  end if;

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

-- Status RPC: same override, plus the early_access field the app reads.
create or replace function public.get_subscription_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid                 uuid := auth.uid();
  v_ea                  boolean := public.early_access_enabled();
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

  -- Early access: everyone gets tier2 regardless of subscription rows, and
  -- an expired paid period must not surface as 'expired' while everything is
  -- free anyway.
  if v_ea then
    v_tier   := 'tier2';
    v_status := 'active';
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
    'early_access',         v_ea,
    'lesson_plans_used',    coalesce(v_lp_count, 0),
    'lesson_plans_limit',   public.tier_lesson_plan_limit(v_tier),
    'subjects_used',        coalesce(v_subj_count, 0),
    'subjects_limit',       public.tier_subject_limit(v_tier),
    'ai_used_today',        coalesce(v_ai_used, 0),
    'ai_daily_limit',       public.tier_ai_daily_limit(v_tier)
  );
end $$;

grant execute on function public.get_subscription_status() to authenticated;
