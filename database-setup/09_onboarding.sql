-- =========================
-- ONBOARDING / MID-TERM PLANNING
--
-- Covers:
--   - users.onboarded_at column (gates first-run wizard)
--   - lesson_plans.effective_start_date column (scheduling floor, separate from term start)
--   - lesson_plans.progress_anchor jsonb column (items already taught before plan began)
--   - create_lesson_plan RPC extended to accept both
-- =========================

alter table public.users
  add column if not exists onboarded_at timestamptz;

alter table public.lesson_plans
  add column if not exists effective_start_date date;

alter table public.lesson_plans
  add column if not exists progress_anchor jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lesson_plans_effective_start_check'
      and conrelid = 'public.lesson_plans'::regclass
  ) then
    alter table public.lesson_plans
      add constraint lesson_plans_effective_start_check
      check (
        effective_start_date is null
        or (effective_start_date >= start_date and effective_start_date <= end_date)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lesson_plans_progress_anchor_check'
      and conrelid = 'public.lesson_plans'::regclass
  ) then
    alter table public.lesson_plans
      add constraint lesson_plans_progress_anchor_check
      check (
        progress_anchor is null
        or (
          jsonb_typeof(progress_anchor) = 'object'
          and (progress_anchor ? 'lesson_no')
          and (progress_anchor ? 'written_work_no')
          and (progress_anchor ? 'performance_task_no')
          and (progress_anchor ? 'exam_no')
          and (progress_anchor->>'lesson_no')::int >= 0
          and (progress_anchor->>'written_work_no')::int >= 0
          and (progress_anchor->>'performance_task_no')::int >= 0
          and (progress_anchor->>'exam_no')::int >= 0
        )
      );
  end if;
end $$;

-- Extend create_lesson_plan RPC to accept optional mid-term planning inputs.
-- Drop the old signature first so the function can be re-created with new params.
drop function if exists public.create_lesson_plan(uuid, uuid, uuid, text, date, date, text, text);

create or replace function public.create_lesson_plan(
  p_school_id uuid,
  p_subject_id uuid,
  p_section_id uuid,
  p_title text,
  p_start_date date,
  p_end_date date,
  p_academic_year text default null,
  p_notes text default null,
  p_effective_start_date date default null,
  p_progress_anchor jsonb default null
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
    title, academic_year, start_date, end_date, notes,
    effective_start_date, progress_anchor
  )
  values (
    v_user_id, p_school_id, p_subject_id, p_section_id,
    p_title, p_academic_year, p_start_date, p_end_date, p_notes,
    p_effective_start_date, p_progress_anchor
  )
  returning * into v_plan;

  return v_plan;
end $$;

grant execute on function public.create_lesson_plan(uuid, uuid, uuid, text, date, date, text, text, date, jsonb) to authenticated;

-- Mark a user as onboarded. Idempotent.
create or replace function public.mark_user_onboarded()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  update public.users
    set onboarded_at = coalesce(onboarded_at, v_now)
    where userid = v_user_id
    returning onboarded_at into v_now;

  return v_now;
end $$;

grant execute on function public.mark_user_onboarded() to authenticated;
