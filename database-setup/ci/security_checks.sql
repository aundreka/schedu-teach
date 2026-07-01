-- Post-apply security regression checks. Run after bootstrap.sql + apply.sh.
-- Each failed assertion raises and fails CI. Validates the Phase 1 guards:
--   1) users.role cannot be self-escalated from a client (authenticated) session
--   2) units has RLS enabled
--   3) user_schools has UPDATE and DELETE policies
--   4) subscriptions has the school-admin read policy
--   5) school_calendar_events no longer has the blanket FOR ALL manage policy
--
-- Assumes the CI bootstrap, where auth.uid() reads request.jwt.claim.sub.

\set ON_ERROR_STOP on

-- ---- 2) units RLS enabled ------------------------------------------------
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.units'::regclass) then
    raise exception 'CHECK FAILED: RLS is not enabled on public.units';
  end if;
end $$;

-- ---- 3) user_schools UPDATE + DELETE policies present --------------------
do $$
declare n int;
begin
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'user_schools' and cmd = 'UPDATE';
  if n = 0 then raise exception 'CHECK FAILED: user_schools has no UPDATE policy'; end if;
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'user_schools' and cmd = 'DELETE';
  if n = 0 then raise exception 'CHECK FAILED: user_schools has no DELETE policy'; end if;
end $$;

-- ---- 4) subscriptions school-admin read policy present ------------------
do $$
declare n int;
begin
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'subscriptions'
     and policyname = 'school admins can read member subscriptions';
  if n = 0 then raise exception 'CHECK FAILED: subscriptions admin read policy missing'; end if;
end $$;

-- ---- 5) calendar events blanket manage policy removed -------------------
do $$
declare n int;
begin
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'school_calendar_events'
     and policyname = 'users can manage calendar events in own schools';
  if n > 0 then raise exception 'CHECK FAILED: blanket FOR ALL calendar policy still present'; end if;
end $$;

-- ---- 1) role self-escalation is blocked --------------------------------
-- Seed an auth user + profile row as the privileged migration role.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'rls-check@example.com')
  on conflict (id) do nothing;
insert into public.users (userid, publicid, email, role)
  values ('11111111-1111-1111-1111-111111111111', 'usr_rls_check', 'rls-check@example.com', 'teacher')
  on conflict (userid) do update set role = 'teacher';

do $$
declare
  blocked boolean := false;
begin
  -- Act as the client role for this user.
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  begin
    update public.users set role = 'superadmin'
      where userid = '11111111-1111-1111-1111-111111111111';
  exception when others then
    blocked := true;          -- column grant or trigger rejected it
  end;
  reset role;
  if not blocked then
    -- Update "succeeded" under RLS; confirm role did NOT actually change.
    if (select role from public.users
          where userid = '11111111-1111-1111-1111-111111111111') = 'superadmin' then
      raise exception 'CHECK FAILED: a client session escalated users.role to superadmin';
    end if;
  end if;
end $$;

-- Cleanup
delete from public.users where userid = '11111111-1111-1111-1111-111111111111';
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';

select 'security_checks: all passed' as result;
