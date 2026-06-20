-- =========================
-- BILLING V2 — TIER LIMIT UPDATES + DAILY AI QUOTA + SUBJECT QUOTA
--
-- Changes from 08_billing.sql:
--   - tier_lesson_plan_limit: free 3→2, tier2 unlimited→20
--   - tier_ai_daily_limit: replaces monthly (free 1/day, tier1 5/day, tier2 20/day)
--   - tier_subject_limit: new helper (free 2, tier1 10, tier2 20)
--   - usage_quotas: period_month → period_day (calendar day, not month)
--   - increment_ai_quota: updated to daily period + tier_ai_daily_limit
--   - get_ai_quota_status: updated to daily
--   - get_subscription_status: new single-call RPC for the app hook
--   - create_user_subject: new quota-enforced RPC; revokes direct INSERT on user_subjects
--   - subscriptions: adds stripe_customer_id, stripe_subscription_id columns
--   - stripe_webhook_events: idempotency log table for future Stripe webhook handler
--
-- Safe to apply on dev (all changes are idempotent or CREATE OR REPLACE).
-- For prod, verify no tier2 user has >20 lesson_plans before applying.
-- =========================

-- =========================
-- Updated tier-limit helpers
-- =========================

create or replace function public.tier_lesson_plan_limit(p_tier public.subscription_tier)
returns integer
language sql
immutable
as $$
  select case p_tier
    when 'free'  then 2
    when 'tier1' then 10
    when 'tier2' then 20
  end;
$$;

-- Daily AI generation limit (replaces tier_ai_monthly_limit).
create or replace function public.tier_ai_daily_limit(p_tier public.subscription_tier)
returns integer
language sql
immutable
as $$
  select case p_tier
    when 'free'  then 1
    when 'tier1' then 5
    when 'tier2' then 20
  end;
$$;

grant execute on function public.tier_ai_daily_limit(public.subscription_tier) to authenticated;

-- Keep tier_ai_monthly_limit as a thin alias so any leftover callers don't break.
-- Returns same values as tier_ai_daily_limit.
create or replace function public.tier_ai_monthly_limit(p_tier public.subscription_tier)
returns integer
language sql
immutable
as $$
  select public.tier_ai_daily_limit(p_tier);
$$;

-- Subject limit: counts total user_subjects rows for this user.
create or replace function public.tier_subject_limit(p_tier public.subscription_tier)
returns integer
language sql
immutable
as $$
  select case p_tier
    when 'free'  then 2
    when 'tier1' then 10
    when 'tier2' then 20
  end;
$$;

grant execute on function public.tier_subject_limit(public.subscription_tier) to authenticated;

-- =========================
-- Stripe columns on subscriptions
-- =========================

alter table public.subscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create index if not exists subscriptions_stripe_sub_id_idx
  on public.subscriptions(stripe_subscription_id);

-- =========================
-- Stripe webhook events table
-- (mirrors paymongo_webhook_events; handler edge fn is deferred)
-- =========================

create table if not exists public.stripe_webhook_events (
  event_id    text primary key,
  event_type  text not null,
  payload     jsonb not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;

-- =========================
-- usage_quotas: period_month → period_day
--
-- Order matters: add + backfill + constraint + replace RPCs + drop old.
-- =========================

alter table public.usage_quotas
  add column if not exists period_day date;

-- Backfill: copy period_month → period_day if the old column still exists.
-- Guarded so re-running the migration (after period_month was already dropped) is safe.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'usage_quotas'
      and column_name  = 'period_month'
  ) then
    update public.usage_quotas
    set period_day = period_month
    where period_day is null;
  end if;
end $$;

-- Now safe to enforce NOT NULL (set a default for any rows that came in without a value).
update public.usage_quotas set period_day = current_date where period_day is null;

alter table public.usage_quotas
  alter column period_day set not null;

-- New unique constraint on the day column.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'usage_quotas_user_day_unique'
      and conrelid = 'public.usage_quotas'::regclass
  ) then
    alter table public.usage_quotas
      add constraint usage_quotas_user_day_unique unique (user_id, period_day);
  end if;
end $$;

-- Drop old month index (will be replaced below).
drop index if exists usage_quotas_period_idx;
create index if not exists usage_quotas_period_day_idx on public.usage_quotas(period_day);

-- =========================
-- Replace increment_ai_quota (daily period + tier_ai_daily_limit)
-- =========================

create or replace function public.increment_ai_quota()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid    := auth.uid();
  v_tier      public.subscription_tier;
  v_limit     integer;
  v_period    date    := current_date;
  v_new_count integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  v_tier  := public.current_effective_tier();
  v_limit := public.tier_ai_daily_limit(v_tier);

  insert into public.usage_quotas (user_id, period_day, ai_generations_used)
  values (v_user_id, v_period, 1)
  on conflict (user_id, period_day) do update
    set ai_generations_used = public.usage_quotas.ai_generations_used + 1
    where v_limit is null
       or public.usage_quotas.ai_generations_used < v_limit
  returning ai_generations_used into v_new_count;

  if v_new_count is null then
    raise exception 'quota_exceeded: AI generation limit reached for tier %', v_tier
      using errcode = 'P0001';
  end if;

  return v_new_count;
end $$;

grant execute on function public.increment_ai_quota() to authenticated;

-- =========================
-- Replace get_ai_quota_status (daily)
-- =========================

drop function if exists public.get_ai_quota_status();

create or replace function public.get_ai_quota_status()
returns table (
  tier        public.subscription_tier,
  used        integer,
  daily_limit integer,
  period_day  date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier    public.subscription_tier;
  v_today   date := current_date;
  v_used    integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  v_tier := public.current_effective_tier();

  select coalesce(uq.ai_generations_used, 0) into v_used
  from public.usage_quotas uq
  where uq.user_id = v_user_id and uq.period_day = v_today;

  return query select
    v_tier,
    coalesce(v_used, 0)::integer,
    public.tier_ai_daily_limit(v_tier),
    v_today;
end $$;

grant execute on function public.get_ai_quota_status() to authenticated;

-- =========================
-- Now safe to drop old period_month column + constraint
-- =========================

alter table public.usage_quotas
  drop constraint if exists usage_quotas_period_unique;

alter table public.usage_quotas
  drop column if exists period_month;

-- =========================
-- get_subscription_status — single RPC used by useSubscription hook
-- Returns all quota data in one call to avoid N+1 queries.
-- =========================

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

-- =========================
-- create_user_subject — quota-enforced subject link
-- Revokes direct INSERT on user_subjects; clients must call this RPC.
-- =========================

create or replace function public.create_user_subject(p_subject_id uuid)
returns public.user_subjects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_tier  public.subscription_tier;
  v_limit integer;
  v_count integer;
  v_row   public.user_subjects;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  v_tier  := public.current_effective_tier();
  v_limit := public.tier_subject_limit(v_tier);

  select count(*)::integer into v_count
  from public.user_subjects
  where user_id = v_uid;

  if v_count >= v_limit then
    raise exception 'quota_exceeded: subject limit reached for tier %', v_tier
      using errcode = 'P0001';
  end if;

  insert into public.user_subjects (user_id, subject_id)
  values (v_uid, p_subject_id)
  returning * into v_row;

  return v_row;
end $$;

grant execute on function public.create_user_subject(uuid) to authenticated;

-- Revoke direct INSERT so all subject-user links go through the quota-enforced RPC.
revoke insert on public.user_subjects from anon, authenticated;

-- =========================
-- billing_events — user-readable log of payments and subscription state changes.
-- Written by webhook handlers (service role). Clients read via RLS.
-- =========================

create table if not exists public.billing_events (
  billing_event_id uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(userid) on delete cascade,
  event_type       text not null,
  tier             public.subscription_tier,
  amount_cents     integer,
  currency         text,
  description      text,
  occurred_at      timestamptz not null default now()
);

create index if not exists billing_events_user_id_idx   on public.billing_events(user_id);
create index if not exists billing_events_occurred_idx  on public.billing_events(occurred_at desc);

alter table public.billing_events enable row level security;

drop policy if exists "users can read own billing events" on public.billing_events;
create policy "users can read own billing events"
  on public.billing_events for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.billing_events from anon, authenticated;

-- =========================
-- get_billing_history — returns latest 20 billing events for the signed-in user
-- =========================

create or replace function public.get_billing_history()
returns table (
  billing_event_id uuid,
  event_type       text,
  tier             public.subscription_tier,
  amount_cents     integer,
  currency         text,
  description      text,
  occurred_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  return query
    select
      be.billing_event_id,
      be.event_type,
      be.tier,
      be.amount_cents,
      be.currency,
      be.description,
      be.occurred_at
    from public.billing_events be
    where be.user_id = v_uid
    order by be.occurred_at desc
    limit 20;
end $$;

grant execute on function public.get_billing_history() to authenticated;

-- =========================
-- RLS for new tables
-- =========================

drop policy if exists "users can read own stripe events" on public.stripe_webhook_events;
-- No read policy needed; service role only.
