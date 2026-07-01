-- =========================
-- DEPARTMENTS (colleges/units within schools)
--
-- Covers:
--   - departments table
--   - user_schools.department_id FK (assign teachers to a dept)
--   - schools.join_code (short code for teachers to join a school)
--   - RLS policies for departments
-- =========================

-- departments: a college or administrative unit within a school/university
create table if not exists public.departments (
  department_id uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(school_id) on delete cascade,
  name          text not null,
  head_user_id  uuid references public.users(userid) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (school_id, name)
);

create index if not exists departments_school_id_idx on public.departments(school_id);
create index if not exists departments_head_user_idx  on public.departments(head_user_id);

create or replace trigger trg_departments_updated_at
before update on public.departments
for each row execute function public.set_updated_at();

-- Assign a teacher to a department within their school membership
alter table public.user_schools
  add column if not exists department_id uuid
  references public.departments(department_id) on delete set null;

create index if not exists user_schools_department_id_idx on public.user_schools(department_id);

-- join_code: short alphanumeric code admins share with teachers to join the school.
-- Generates an 8-char uppercase hex prefix from a fresh UUID by default.
alter table public.schools
  add column if not exists join_code text unique
  default upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));

-- Backfill join_code for any existing schools that don't have one yet.
update public.schools
set join_code = upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where join_code is null;

alter table public.schools
  alter column join_code set not null;

create index if not exists schools_join_code_idx on public.schools(join_code);

-- =========================
-- RLS for departments
-- =========================

alter table public.departments enable row level security;

drop policy if exists "school members can read departments" on public.departments;
create policy "school members can read departments"
on public.departments for select
using (
  exists (
    select 1 from public.user_schools us
    where us.school_id = departments.school_id
      and us.user_id = auth.uid()
  )
);

drop policy if exists "school admins can manage departments" on public.departments;
create policy "school admins can manage departments"
on public.departments for all
using (
  exists (
    select 1
    from public.user_schools us
    join public.users u on u.userid = us.user_id
    where us.user_id = auth.uid()
      and us.school_id = departments.school_id
      and u.role in ('admin', 'superadmin')
  )
)
with check (
  exists (
    select 1
    from public.user_schools us
    join public.users u on u.userid = us.user_id
    where us.user_id = auth.uid()
      and us.school_id = departments.school_id
      and u.role in ('admin', 'superadmin')
  )
);

-- =========================
-- RPC: join_school_by_code
--
-- Teachers call this to join a school using its join_code.
-- Inserts into user_schools (is_primary = false unless the user has no other schools).
-- =========================
create or replace function public.join_school_by_code(p_join_code text)
returns public.schools
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_school   public.schools;
  v_is_primary boolean;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select * into v_school
  from public.schools
  where join_code = upper(trim(p_join_code));

  if v_school.school_id is null then
    raise exception 'invalid join code' using errcode = 'P0001';
  end if;

  -- Already a member? Just return the school.
  if exists (
    select 1 from public.user_schools
    where user_id = v_user_id and school_id = v_school.school_id
  ) then
    return v_school;
  end if;

  -- Make primary if this is their first school.
  select not exists (
    select 1 from public.user_schools where user_id = v_user_id
  ) into v_is_primary;

  insert into public.user_schools (user_id, school_id, is_primary)
  values (v_user_id, v_school.school_id, v_is_primary);

  return v_school;
end $$;

grant execute on function public.join_school_by_code(text) to authenticated;

-- =========================
-- RPC: regenerate_join_code
--
-- Admin generates a fresh join code for their school.
-- =========================
create or replace function public.regenerate_join_code(p_school_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_code text;
begin
  if not exists (
    select 1
    from public.user_schools us
    join public.users u on u.userid = us.user_id
    where us.user_id = auth.uid()
      and us.school_id = p_school_id
      and u.role in ('admin', 'superadmin')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  loop
    v_new_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1 from public.schools where join_code = v_new_code
    );
  end loop;

  update public.schools set join_code = v_new_code where school_id = p_school_id;
  return v_new_code;
end $$;

grant execute on function public.regenerate_join_code(uuid) to authenticated;
