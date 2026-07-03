-- =========================
-- LESSON PLAN VERSION HISTORY
-- Snapshots of blocks + slots taken before any mutation (suspend, unsuspend,
-- block add/delete, requirements change, manual restore). Lets teachers roll
-- back to any prior state.
-- =========================

create table if not exists public.lesson_plan_versions (
  version_id        uuid primary key default gen_random_uuid(),
  lesson_plan_id    uuid not null references public.lesson_plans(lesson_plan_id) on delete cascade,
  version_no        int not null,
  -- 'creation' | 'suspension' | 'unsuspension' | 'block_added' | 'block_deleted'
  -- | 'requirements_changed' | 'manual_restore'
  trigger_type      text not null,
  trigger_description text,
  blocks_snapshot   jsonb not null,
  slots_snapshot    jsonb not null,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.users(userid) on delete set null
);

create index if not exists lesson_plan_versions_plan_date
  on public.lesson_plan_versions(lesson_plan_id, created_at desc);

alter table public.lesson_plan_versions enable row level security;

drop policy if exists "owner can manage versions" on public.lesson_plan_versions;
create policy "owner can manage versions"
  on public.lesson_plan_versions
  for all
  using (
    exists (
      select 1 from public.lesson_plans lp
      where lp.lesson_plan_id = lesson_plan_versions.lesson_plan_id
        and lp.user_id = auth.uid()
    )
  );

-- =========================
-- SERIES_KEY on school_calendar_events
-- Allows suspending a specific recurring slot series (e.g. only Monday 9-10 AM)
-- rather than the entire day. When null the event applies to all slots on that day.
-- =========================

alter table public.school_calendar_events
  add column if not exists series_key text;

comment on column public.school_calendar_events.series_key is
  'When set, blackout applies only to the slot whose series_key matches. '
  'When null, blackout applies to all slots on start_date..end_date.';
