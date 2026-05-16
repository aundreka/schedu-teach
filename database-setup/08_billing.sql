-- =========================
-- BILLING / SUBSCRIPTIONS / QUOTAS
--
-- Covers:
--   - subscription_tier / subscription_status enums
--   - subscriptions, usage_quotas, paymongo_webhook_events tables
--   - lesson_plans.archived_at column (downgrade handling)
--   - tier-limit helpers + create_lesson_plan / AI quota RPCs
--   - extended handle_new_auth_user trigger (default free row)
-- =========================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_tier') then
    create type public.subscription_tier as enum ('free', 'tier1', 'tier2');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum ('active', 'canceled', 'past_due', 'expired');
  end if;
end $$;

-- One row per user. Source of truth is PayMongo webhooks (see paymongo-webhook edge fn).
create table if not exists public.subscriptions (
  subscription_id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('sub_' || replace(gen_random_uuid()::text, '-', '')),
  user_id uuid not null unique references public.users(userid) on delete cascade,
  tier public.subscription_tier not null default 'free',
  status public.subscription_status not null default 'active',
  paymongo_customer_id text,
  paymongo_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);
create index if not exists subscriptions_paymongo_sub_id_idx on public.subscriptions(paymongo_subscription_id);

create or replace trigger trg_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

-- One row per user per calendar month for AI activity generations.
-- period_month is the first day of the month (e.g. 2026-06-01).
create table if not exists public.usage_quotas (
  usage_quota_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(userid) on delete cascade,
  period_month date not null,
  ai_generations_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usage_quotas_period_unique unique (user_id, period_month),
  constraint usage_quotas_count_check check (ai_generations_used >= 0)
);

create index if not exists usage_quotas_user_id_idx on public.usage_quotas(user_id);
create index if not exists usage_quotas_period_idx on public.usage_quotas(period_month);

create or replace trigger trg_usage_quotas_updated_at
before update on public.usage_quotas
for each row execute function public.set_updated_at();

-- Idempotency log so a replayed PayMongo webhook can never double-process.
create table if not exists public.paymongo_webhook_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create index if not exists paymongo_webhook_events_type_idx on public.paymongo_webhook_events(event_type);
create index if not exists paymongo_webhook_events_processed_idx on public.paymongo_webhook_events(processed_at);

-- archived_at: soft-archive flag for downgrade handling.
-- When a tier1 user downgrades and has >10 plans, the webhook handler archives the oldest
-- ones; they stay readable but don't count against the active-plan cap.
alter table public.lesson_plans
  add column if not exists archived_at timestamptz;

create index if not exists lesson_plans_archived_at_idx on public.lesson_plans(archived_at);

-- =========================
-- RLS for billing tables
-- =========================

alter table public.subscriptions enable row level security;
alter table public.usage_quotas enable row level security;
alter table public.paymongo_webhook_events enable row level security;

drop policy if exists "users can read own subscription" on public.subscriptions;
create policy "users can read own subscription"
on public.subscriptions for select
using (auth.uid() = user_id);

drop policy if exists "users can read own usage quotas" on public.usage_quotas;
create policy "users can read own usage quotas"
on public.usage_quotas for select
using (auth.uid() = user_id);

-- paymongo_webhook_events has RLS enabled with no policies = deny all to clients.
-- Service role (edge function) bypasses RLS so it can read/write freely.

revoke insert, update, delete on public.subscriptions from anon, authenticated;
revoke insert, update, delete on public.usage_quotas from anon, authenticated;
revoke all on public.paymongo_webhook_events from anon, authenticated;

-- =========================
-- Tier limit helpers (null = unlimited)
-- =========================

create or replace function public.tier_lesson_plan_limit(p_tier public.subscription_tier)
returns integer
language sql
immutable
as $$
  select case p_tier
    when 'free' then 3
    when 'tier1' then 10
    when 'tier2' then null
  end;
$$;

create or replace function public.tier_ai_monthly_limit(p_tier public.subscription_tier)
returns integer
language sql
immutable
as $$
  select case p_tier
    when 'free' then 5
    when 'tier1' then null
    when 'tier2' then null
  end;
$$;

-- Resolve effective (tier, status). Missing row or non-active status collapses to 'free'.
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
begin
  select s.tier, s.status into v_tier, v_status
  from public.subscriptions s
  where s.user_id = auth.uid();

  if v_tier is null or v_status is distinct from 'active' then
    return 'free';
  end if;

  return v_tier;
end $$;

grant execute on function public.current_effective_tier() to authenticated;

-- =========================
-- create_lesson_plan RPC
--
-- Enforces tier-based caps:
--   - free:  3 lifetime plans (archived rows still count)
--   - tier1: 10 active plans (archived_at is null)
--   - tier2: unlimited
-- Direct INSERT on lesson_plans is revoked in 06_rls.sql; clients must call this RPC.
-- =========================
create or replace function public.create_lesson_plan(
  p_school_id uuid,
  p_subject_id uuid,
  p_section_id uuid,
  p_title text,
  p_start_date date,
  p_end_date date,
  p_academic_year text default null,
  p_notes text default null
)
returns public.lesson_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier public.subscription_tier;
  v_limit integer;
  v_count integer;
  v_plan public.lesson_plans;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  -- Mirror the section/subject RLS rule: caller must be a member of the school.
  if not exists (
    select 1 from public.user_schools us
    where us.user_id = v_user_id and us.school_id = p_school_id
  ) then
    raise exception 'forbidden: not a member of school' using errcode = '42501';
  end if;

  v_tier := public.current_effective_tier();
  v_limit := public.tier_lesson_plan_limit(v_tier);

  if v_limit is not null then
    if v_tier = 'free' then
      select count(*) into v_count
      from public.lesson_plans
      where user_id = v_user_id;
    else
      select count(*) into v_count
      from public.lesson_plans
      where user_id = v_user_id
        and archived_at is null;
    end if;

    if v_count >= v_limit then
      raise exception 'quota_exceeded: lesson plan limit reached for tier %', v_tier
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.lesson_plans (
    user_id, school_id, subject_id, section_id,
    title, academic_year, start_date, end_date, notes
  )
  values (
    v_user_id, p_school_id, p_subject_id, p_section_id,
    p_title, p_academic_year, p_start_date, p_end_date, p_notes
  )
  returning * into v_plan;

  return v_plan;
end $$;

grant execute on function public.create_lesson_plan(uuid, uuid, uuid, text, date, date, text, text) to authenticated;

-- =========================
-- AI quota RPCs
-- =========================

create or replace function public.get_ai_quota_status()
returns table (
  tier public.subscription_tier,
  used integer,
  monthly_limit integer,
  period_month date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier public.subscription_tier;
  v_period date := date_trunc('month', now())::date;
  v_used integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  v_tier := public.current_effective_tier();

  select coalesce(uq.ai_generations_used, 0) into v_used
  from public.usage_quotas uq
  where uq.user_id = v_user_id and uq.period_month = v_period;

  return query select
    v_tier,
    coalesce(v_used, 0),
    public.tier_ai_monthly_limit(v_tier),
    v_period;
end $$;

grant execute on function public.get_ai_quota_status() to authenticated;

-- Atomic check + increment. Raises quota_exceeded when at the cap.
-- The conditional ON CONFLICT WHERE clause prevents two concurrent generations from
-- both squeezing past the limit.
create or replace function public.increment_ai_quota()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier public.subscription_tier;
  v_limit integer;
  v_period date := date_trunc('month', now())::date;
  v_new_count integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  v_tier := public.current_effective_tier();
  v_limit := public.tier_ai_monthly_limit(v_tier);

  insert into public.usage_quotas (user_id, period_month, ai_generations_used)
  values (v_user_id, v_period, 1)
  on conflict (user_id, period_month) do update
    set ai_generations_used = public.usage_quotas.ai_generations_used + 1
    where v_limit is null or public.usage_quotas.ai_generations_used < v_limit
  returning ai_generations_used into v_new_count;

  if v_new_count is null then
    raise exception 'quota_exceeded: AI generation limit reached for tier %', v_tier
      using errcode = 'P0001';
  end if;

  return v_new_count;
end $$;

grant execute on function public.increment_ai_quota() to authenticated;

-- =========================
-- Extended handle_new_auth_user
-- Adds a default free 'active' subscription row alongside the public.users insert.
-- Replaces the version in 00_users.sql; safe to re-run.
-- =========================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_first text;
  v_last text;
begin
  v_email := new.email;

  v_first := coalesce(new.raw_user_meta_data->>'given_name', new.raw_user_meta_data->>'first_name');
  v_last  := coalesce(new.raw_user_meta_data->>'family_name', new.raw_user_meta_data->>'last_name');

  insert into public.users (userID, publicID, first_name, last_name, email)
  values (
    new.id,
    'usr_' || replace(gen_random_uuid()::text, '-', ''),
    v_first,
    v_last,
    v_email
  )
  on conflict (userID) do nothing;

  insert into public.subscriptions (user_id, tier, status)
  values (new.id, 'free', 'active')
  on conflict (user_id) do nothing;

  return new;
end $$;

-- Backfill subscription rows for users created before this migration ran.
insert into public.subscriptions (user_id, tier, status)
select userid, 'free', 'active' from public.users
on conflict (user_id) do nothing;
