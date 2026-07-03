-- seed_showcase_calendar.sql  (DEV ONLY — never run in production)
--
-- Marketing/screenshot showcase data for the calendar screens:
--
--   1. maria.santos gets a packed "homeroom teacher" day on Fri 2026-07-03:
--      7 manual blocks (no slot_id, metadata.manual_date) layered around her
--      existing 08:00 Math session — every session category appears once so
--      the daily timeline shows the full category color ramp.
--   2. jonathan.cruz (JHS Math 8, currently Mon/Tue/Thu lessons + Wed lab)
--      gets a "Weekly Mastery Quiz" slot every Friday 07:30–08:30, turning his
--      month grid into the classic secondary Mon–Fri pattern.
--   3. inez.mercado (BSIT college, two 2-day-a-week plans: Mon/Wed and
--      Tue/Thu) gets the standard dev password so she can be used in shots.
--
-- Idempotent: showcase rows are keyed with 'showcase_' prefixes and deleted
-- before re-insert.

begin;

-- ---------------------------------------------------------------------------
-- Cleanup of any previous run
-- ---------------------------------------------------------------------------
delete from public.blocks where algorithm_block_key like 'showcase_%';
delete from public.slots  where series_key like 'showcase_%';

-- ---------------------------------------------------------------------------
-- 1. Maria's busy Friday (manual blocks on 2026-07-03)
-- ---------------------------------------------------------------------------
with plans as (
  select
    (select lesson_plan_id from public.lesson_plans where lesson_plan_id = '74b6097a-a559-4152-a47a-f7951bd023a0') as eng,
    (select lesson_plan_id from public.lesson_plans where lesson_plan_id = '5463fce1-7b10-4d30-8cec-dea00ed4a79f') as math
),
rows_to_add (key, which, category, subcategory, ww, pt, title, t_start, t_end) as (
  values
    ('showcase_busy_homeroom',    'math', 'buffer',           'orientation', null,   null,       'Flag Ceremony & Homeroom',            time '07:15', time '08:00'),
    ('showcase_busy_eng_lesson',  'eng',  'lesson',           'lecture',     null,   null,       'Story Elements: Character & Setting', time '09:00', time '10:00'),
    ('showcase_busy_recess',      'math', 'buffer',           'other',       null,   null,       'Recess Duty',                         time '10:00', time '10:30'),
    ('showcase_busy_quiz',        'eng',  'written_work',     'quiz',        'quiz', null,       'Vocabulary Quiz: Unit 2',             time '10:30', time '11:30'),
    ('showcase_busy_pt',          'eng',  'performance_task', 'activity',    null,   'activity', 'Readers'' Theater: Group Performance', time '13:00', time '14:00'),
    ('showcase_busy_math_lesson', 'math', 'lesson',           'lecture',     null,   null,       'Division as Equal Sharing',           time '14:00', time '15:00'),
    ('showcase_busy_exam',        'math', 'exam',             'prelim',      null,   null,       'Unit 1 Mastery Check',                time '15:00', time '16:00')
)
insert into public.blocks (
  lesson_plan_id, slot_id, root_block_id, lesson_id,
  algorithm_block_key, block_key, title, description,
  session_category, session_subcategory, meeting_type,
  required, splittable, preferred_session_type, dependency_keys,
  order_no, is_locked, ww_subtype, pt_subtype, metadata,
  start_time, end_time
)
select
  case r.which when 'eng' then p.eng else p.math end,
  null, null, null,
  r.key, r.key, r.title, null,
  r.category::public.session_category,
  r.subcategory::public.session_subcategory,
  null,
  true, false, 'any', '{}',
  1, true,
  r.ww::public.session_subcategory,
  r.pt::public.session_subcategory,
  jsonb_build_object(
    'source', 'seed_showcase',
    'manual', true,
    'manual_date', '2026-07-03',
    'scope_lesson_ids', jsonb_build_array(),
    'scope_summary', r.title
  ),
  r.t_start, r.t_end
from rows_to_add r cross join plans p;

-- ---------------------------------------------------------------------------
-- 2. Jonathan's Friday "Weekly Mastery Quiz" (real slots -> shows in monthly)
-- ---------------------------------------------------------------------------
with fridays as (
  select d::date as slot_date, row_number() over (order by d) as n
  from generate_series(date '2026-06-12', date '2026-08-28', interval '7 days') as g(d)
),
new_slots as (
  insert into public.slots (
    lesson_plan_id, title, slot_date, weekday, start_time, end_time,
    meeting_type, slot_number, series_key, is_locked
  )
  select
    'b552bdac-d486-4a40-833a-85bc1a19e4f2',
    'Mathematics 8 Quarterly Plan - Grade 8 Newton',
    f.slot_date, 'friday'::public.weekday_name,
    time '07:30', time '08:30',
    'lecture'::public.meeting_type, 1,
    'showcase_math8_friday-5-07:30:00', false
  from fridays f
  returning slot_id, slot_date
)
insert into public.blocks (
  lesson_plan_id, slot_id, root_block_id, lesson_id,
  algorithm_block_key, block_key, title, description,
  session_category, session_subcategory, meeting_type,
  required, splittable, preferred_session_type, dependency_keys,
  order_no, is_locked, ww_subtype, pt_subtype, metadata,
  start_time, end_time
)
select
  'b552bdac-d486-4a40-833a-85bc1a19e4f2',
  s.slot_id, null, null,
  'showcase_math8_quiz_' || to_char(s.slot_date, 'YYYYMMDD'),
  'showcase_math8_quiz_' || to_char(s.slot_date, 'YYYYMMDD'),
  'Weekly Mastery Quiz', null,
  'written_work'::public.session_category,
  'quiz'::public.session_subcategory,
  null,
  true, false, 'any', '{}',
  1, false,
  'quiz'::public.session_subcategory, null,
  jsonb_build_object('source', 'seed_showcase', 'term_no', 1),
  time '07:30', time '08:30'
from new_slots s;

-- ---------------------------------------------------------------------------
-- 3. inez.mercado — standard dev password + GoTrue-safe token columns
-- ---------------------------------------------------------------------------
update auth.users u
   set encrypted_password = crypt('ScheduTest2026!', gen_salt('bf')),
       email_confirmed_at = coalesce(u.email_confirmed_at, now()),
       confirmation_token = coalesce(u.confirmation_token, ''),
       recovery_token = coalesce(u.recovery_token, ''),
       email_change = coalesce(u.email_change, ''),
       email_change_token_new = coalesce(u.email_change_token_new, ''),
       email_change_token_current = coalesce(u.email_change_token_current, '')
  from public.users pu
 where pu.userid = u.id
   and pu.username = 'inez.mercado';

commit;
