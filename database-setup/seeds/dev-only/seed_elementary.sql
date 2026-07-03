-- =====================================================================
-- DEV-ONLY SEED — NEVER RUN IN PRODUCTION.
-- Creates one elementary teacher persona (Maria Santos) with rich data.
-- Guard: this file aborts unless the operator explicitly opts in for the
-- session with:   set app.allow_dev_seed = 'yes';
-- See seeds/dev-only/README.md.
-- =====================================================================
begin;

do $$
begin
  if current_setting('app.allow_dev_seed', true) is distinct from 'yes' then
    raise exception 'Refusing to run dev-only seed. Run "set app.allow_dev_seed = ''yes'';" first (never in production).';
  end if;
end $$;

create extension if not exists pgcrypto;

-- Test login:
--   username: maria.santos
--   email:    maria.santos@example.com
--   password: ScheduTest2026!
--
-- Run this after database-setup/00_users.sql through 12 (full schema).
-- The app's Library screen reads "books" from subjects assigned through user_subjects.

with seed_user(user_id, public_id, first_name, last_name, username, email, role_name) as (
  values (
    '11111111-1111-4111-8111-111111111111'::uuid,
    'usr_maria_santos',
    'Maria',
    'Santos',
    'maria.santos',
    'maria.santos@example.com',
    'teacher'
  )
)
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  user_id,
  'authenticated',
  'authenticated',
  email,
  crypt('ScheduTest2026!', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('first_name', first_name, 'last_name', last_name),
  false,
  '',
  '',
  '',
  ''
from seed_user
on conflict (id) do update
set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

-- onboarded_at is added by 09_onboarding.sql; guard it so this seed is
-- self-contained and can mark Maria as fully onboarded.
alter table public.users
  add column if not exists onboarded_at timestamptz;

with seed_user(user_id, public_id, first_name, last_name, username, email, role_name) as (
  values (
    '11111111-1111-4111-8111-111111111111'::uuid,
    'usr_maria_santos',
    'Maria',
    'Santos',
    'maria.santos',
    'maria.santos@example.com',
    'teacher'
  )
)
insert into public.users (
  userid,
  publicid,
  first_name,
  last_name,
  username,
  email,
  role,
  onboarded_at
)
select
  user_id,
  public_id,
  first_name,
  last_name,
  username,
  email,
  role_name::public.user_role,
  now()
from seed_user
on conflict (userid) do update
set
  publicid = excluded.publicid,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  username = excluded.username,
  email = excluded.email,
  role = excluded.role,
  onboarded_at = now(),
  updated_at = now();

do $$
begin
  if to_regclass('public.subscriptions') is not null then
    insert into public.subscriptions (user_id, tier, status)
    select userid, 'tier1'::public.subscription_tier, 'active'::public.subscription_status
    from public.users
    where publicid = 'usr_maria_santos'
    on conflict (user_id) do update
    set
      tier = excluded.tier,
      status = excluded.status,
      updated_at = now();
  end if;

  -- usage_quotas is keyed on period_day after 10_billing_v2.sql. This dev seed
  -- runs after the full schema (00 -> 12), so it targets period_day.
  if to_regclass('public.usage_quotas') is not null then
    insert into public.usage_quotas (user_id, period_day, ai_generations_used)
    select userid, current_date, 0
    from public.users
    where publicid = 'usr_maria_santos'
    on conflict (user_id, period_day) do update
    set
      ai_generations_used = excluded.ai_generations_used,
      updated_at = now();
  end if;
end $$;

alter table public.lesson_plans
  add column if not exists archived_at timestamptz;

with school_seed(public_id, name, type_name, avatar_color, is_default, created_by_public_id) as (
  values (
    'sch_mabini_elem',
    'Mabini Elementary School',
    'basic_ed',
    '#0EA5E9',
    true,
    'usr_maria_santos'
  )
)
insert into public.schools (
  public_id,
  name,
  type,
  avatar_color,
  is_default,
  created_by
)
select
  school_seed.public_id,
  school_seed.name,
  school_seed.type_name::public.school_type,
  school_seed.avatar_color,
  school_seed.is_default,
  users.userid
from school_seed
join public.users on users.publicid = school_seed.created_by_public_id
on conflict (public_id) do update
set
  name = excluded.name,
  type = excluded.type,
  avatar_color = excluded.avatar_color,
  is_default = excluded.is_default,
  created_by = excluded.created_by,
  updated_at = now();

insert into public.user_schools (
  user_id,
  school_id,
  is_primary
)
select
  users.userid,
  schools.school_id,
  true
from public.users
join public.schools on schools.public_id = 'sch_mabini_elem'
where users.publicid = 'usr_maria_santos'
on conflict (user_id, school_id) do update
set is_primary = excluded.is_primary;

with section_seed(public_id, grade_level, name, status_name) as (
  values
    ('sec_mabini_g3_sampaguita', 'Grade 3', 'Grade 3 - Sampaguita', 'published'),
    ('sec_mabini_g3_rosal', 'Grade 3', 'Grade 3 - Rosal', 'published')
)
insert into public.sections (
  public_id,
  school_id,
  grade_level,
  name,
  status
)
select
  section_seed.public_id,
  schools.school_id,
  section_seed.grade_level,
  section_seed.name,
  section_seed.status_name::public.record_status
from section_seed
join public.schools on schools.public_id = 'sch_mabini_elem'
on conflict (school_id, name) do update
set
  public_id = excluded.public_id,
  grade_level = excluded.grade_level,
  status = excluded.status,
  updated_at = now();

insert into public.user_sections (
  user_id,
  section_id
)
select
  users.userid,
  sections.section_id
from public.users
join public.schools on schools.public_id = 'sch_mabini_elem'
join public.sections on sections.school_id = schools.school_id
where users.publicid = 'usr_maria_santos'
  and sections.public_id in ('sec_mabini_g3_sampaguita', 'sec_mabini_g3_rosal')
on conflict (user_id, section_id) do nothing;

with subject_seed(public_id, code, title, year_level, academic_year, unit_no, description, status_name) as (
  values
    (
      'sub_mabini_math3',
      'MATH3',
      'Mathematics 3',
      'Grade 3',
      '2026-2027',
      2,
      'Grade 3 mathematics covering place value to thousands, addition and subtraction with regrouping, multiplication and division facts, and an introduction to fractions.',
      'published'
    ),
    (
      'sub_mabini_sci3',
      'SCI3',
      'Science 3',
      'Grade 3',
      '2026-2027',
      2,
      'Grade 3 science exploring living and non-living things, the parts and needs of plants and animals, and everyday weather and its effect on daily activities.',
      'published'
    ),
    (
      'sub_mabini_eng3',
      'ENG3',
      'English 3',
      'Grade 3',
      '2026-2027',
      2,
      'Grade 3 English building vocabulary, common and proper nouns, action verbs, and reading comprehension of short stories and simple informational texts.',
      'published'
    ),
    (
      'sub_mabini_fil3',
      'FIL3',
      'Filipino 3',
      'Grade 3',
      '2026-2027',
      2,
      'Filipino 3 na tumutuon sa pagbaybay ng mga pantig, mga uri ng pangngalan, at maunawang pagbasa ng maikling kuwento at tula.',
      'published'
    ),
    (
      'sub_mabini_ap3',
      'AP3',
      'Araling Panlipunan 3',
      'Grade 3',
      '2026-2027',
      2,
      'Araling Panlipunan 3 na nag-aaral sa lokal na komunidad, mga pangangailangan at kagustuhan, mga tungkulin ng mamamayan, at mga likas na yaman ng pamayanan.',
      'published'
    )
)
insert into public.subjects (
  public_id,
  school_id,
  code,
  title,
  year,
  academic_year,
  unit_no,
  description,
  status
)
select
  subject_seed.public_id,
  schools.school_id,
  subject_seed.code,
  subject_seed.title,
  subject_seed.year_level,
  subject_seed.academic_year,
  subject_seed.unit_no,
  subject_seed.description,
  subject_seed.status_name::public.record_status
from subject_seed
join public.schools on schools.public_id = 'sch_mabini_elem'
on conflict (school_id, code) do update
set
  public_id = excluded.public_id,
  title = excluded.title,
  year = excluded.year,
  academic_year = excluded.academic_year,
  unit_no = excluded.unit_no,
  description = excluded.description,
  status = excluded.status,
  updated_at = now();

insert into public.user_subjects (
  user_id,
  subject_id
)
select
  users.userid,
  subjects.subject_id
from public.users
join public.subjects on subjects.public_id in (
  'sub_mabini_math3',
  'sub_mabini_sci3',
  'sub_mabini_eng3',
  'sub_mabini_fil3',
  'sub_mabini_ap3'
)
where users.publicid = 'usr_maria_santos'
on conflict (user_id, subject_id) do nothing;

with unit_seed(subject_public_id, sequence_no, public_id, title, description) as (
  values
    ('sub_mabini_math3', 1, 'unt_mabini_math3_numbers', 'Numbers and Operations', 'Place value to thousands and addition and subtraction with regrouping.'),
    ('sub_mabini_math3', 2, 'unt_mabini_math3_multiplication', 'Multiplication and Fractions', 'Multiplication and division facts and an introduction to unit fractions.'),
    ('sub_mabini_sci3', 1, 'unt_mabini_sci3_living', 'Living and Non-Living Things', 'Characteristics of living and non-living things and the parts and needs of plants.'),
    ('sub_mabini_sci3', 2, 'unt_mabini_sci3_animals_weather', 'Animals and Weather', 'Groups and needs of animals and everyday weather conditions.'),
    ('sub_mabini_eng3', 1, 'unt_mabini_eng3_grammar', 'Nouns and Verbs', 'Common and proper nouns and action verbs in simple sentences.'),
    ('sub_mabini_eng3', 2, 'unt_mabini_eng3_reading', 'Reading and Comprehension', 'Reading short stories and informational texts with understanding.'),
    ('sub_mabini_fil3', 1, 'unt_mabini_fil3_wika', 'Pantig at Pangngalan', 'Pagbaybay ng mga pantig at mga uri ng pangngalan.'),
    ('sub_mabini_fil3', 2, 'unt_mabini_fil3_pagbasa', 'Pagbasa at Pag-unawa', 'Maunawang pagbasa ng maikling kuwento at tula.'),
    ('sub_mabini_ap3', 1, 'unt_mabini_ap3_komunidad', 'Ang Aming Komunidad', 'Katangian ng lokal na komunidad at mga bahagi nito.'),
    ('sub_mabini_ap3', 2, 'unt_mabini_ap3_pangangailangan', 'Pangangailangan at Tungkulin', 'Mga pangangailangan, kagustuhan, at tungkulin ng mamamayan.')
)
insert into public.units (
  public_id,
  subject_id,
  title,
  description,
  sequence_no,
  status
)
select
  unit_seed.public_id,
  subjects.subject_id,
  unit_seed.title,
  unit_seed.description,
  unit_seed.sequence_no,
  'published'::public.record_status
from unit_seed
join public.subjects on subjects.public_id = unit_seed.subject_public_id
on conflict (subject_id, sequence_no) do update
set
  public_id = excluded.public_id,
  title = excluded.title,
  description = excluded.description,
  status = excluded.status,
  updated_at = now();

with chapter_seed(subject_public_id, unit_sequence_no, sequence_no, public_id, title, description) as (
  values
    ('sub_mabini_math3', 1, 1, 'chp_mabini_math3_place_value', 'Place Value and Numbers', 'Reading, writing, and comparing numbers up to the thousands place.'),
    ('sub_mabini_math3', 2, 2, 'chp_mabini_math3_multiplication', 'Multiplication and Fractions', 'Multiplication tables and naming simple fractions of a whole.'),
    ('sub_mabini_sci3', 1, 1, 'chp_mabini_sci3_plants', 'Living Things and Plants', 'Telling living from non-living things and studying the parts of a plant.'),
    ('sub_mabini_sci3', 2, 2, 'chp_mabini_sci3_animals_weather', 'Animals and Weather', 'Grouping animals by their needs and observing daily weather.'),
    ('sub_mabini_eng3', 1, 1, 'chp_mabini_eng3_grammar', 'Nouns and Verbs', 'Naming words and action words in everyday sentences.'),
    ('sub_mabini_eng3', 2, 2, 'chp_mabini_eng3_reading', 'Reading Comprehension', 'Understanding characters, events, and details in short texts.'),
    ('sub_mabini_fil3', 1, 1, 'chp_mabini_fil3_pantig', 'Pantig at Pangngalan', 'Pagbaybay ng mga pantig at pagkilala sa mga pangngalan.'),
    ('sub_mabini_fil3', 2, 2, 'chp_mabini_fil3_pagbasa', 'Pagbasa ng Kuwento', 'Pag-unawa sa mga tauhan at pangyayari sa maikling kuwento.'),
    ('sub_mabini_ap3', 1, 1, 'chp_mabini_ap3_komunidad', 'Ang Komunidad', 'Ang mga bahagi at katangian ng sariling komunidad.'),
    ('sub_mabini_ap3', 2, 2, 'chp_mabini_ap3_pangangailangan', 'Pangangailangan at Tungkulin', 'Mga pangangailangan ng pamayanan at tungkulin ng mamamayan.')
)
insert into public.chapters (
  public_id,
  subject_id,
  unit_id,
  title,
  description,
  sequence_no,
  status
)
select
  chapter_seed.public_id,
  subjects.subject_id,
  units.unit_id,
  chapter_seed.title,
  chapter_seed.description,
  chapter_seed.sequence_no,
  'published'::public.record_status
from chapter_seed
join public.subjects on subjects.public_id = chapter_seed.subject_public_id
join public.units
  on units.subject_id = subjects.subject_id
 and units.sequence_no = chapter_seed.unit_sequence_no
on conflict (subject_id, sequence_no) do update
set
  public_id = excluded.public_id,
  unit_id = excluded.unit_id,
  title = excluded.title,
  description = excluded.description,
  status = excluded.status,
  updated_at = now();

with lesson_seed(subject_public_id, chapter_sequence_no, sequence_no, public_id, title, content, learning_objectives, estimated_minutes, complexity_score) as (
  values
    (
      'sub_mabini_math3',
      1,
      1,
      'les_mabini_math3_place_value',
      'Place Value to Thousands',
      $html$<h2>Overview</h2><p>Learners read and write three- and four-digit numbers and identify the value of each digit using place value blocks and a place value chart. They see that the digit 3 in 3,254 stands for three thousands.</p><h3>Activities</h3><ul><li>Build numbers with ones, tens, hundreds, and thousands blocks.</li><li>Write the expanded form of a number, such as 3,254 = 3,000 + 200 + 50 + 4.</li><li>Compare two numbers using greater than, less than, and equal to.</li></ul><p>Wrap-up: learners explain why the position of a digit changes its value.</p>$html$,
      'Read and write numbers to the thousands, identify the value of each digit, and compare numbers using place value.',
      50,
      2
    ),
    (
      'sub_mabini_math3',
      1,
      2,
      'les_mabini_math3_regrouping',
      'Addition with Regrouping',
      $html$<h2>Overview</h2><p>Learners add two- and three-digit numbers that require regrouping, or carrying, from ones to tens and from tens to hundreds. They use bundles of straws to make the trading concrete before writing the vertical algorithm.</p><h3>Activities</h3><ul><li>Group ten ones into one ten and record the carry.</li><li>Solve column addition such as 148 + 76 step by step.</li><li>Answer word problems about combining classroom supplies.</li></ul><p>Wrap-up: learners check a partner's work and explain each regrouping step.</p>$html$,
      'Add two- and three-digit numbers with regrouping and solve simple addition word problems.',
      50,
      2
    ),
    (
      'sub_mabini_math3',
      2,
      1,
      'les_mabini_math3_multiplication',
      'Multiplication Tables and Facts',
      $html$<h2>Overview</h2><p>Learners understand multiplication as repeated addition and equal groups, then practice the 2, 3, 4, 5, and 10 times tables. They use arrays of counters to picture facts such as 4 x 3 = 12.</p><h3>Activities</h3><ul><li>Make equal groups of counters and write the matching multiplication sentence.</li><li>Skip count by 2s, 5s, and 10s to build the tables.</li><li>Play a quick multiplication fact game with flashcards.</li></ul><p>Wrap-up: learners show that 3 groups of 4 and 4 groups of 3 give the same total.</p>$html$,
      'Explain multiplication as repeated addition and recall the 2, 3, 4, 5, and 10 multiplication facts.',
      50,
      2
    ),
    (
      'sub_mabini_math3',
      2,
      2,
      'les_mabini_math3_fractions',
      'Introducing Fractions',
      $html$<h2>Overview</h2><p>Learners name unit fractions such as one half, one third, and one fourth by dividing shapes and sets into equal parts. They connect fractions to fair sharing of food and objects.</p><h3>Activities</h3><ul><li>Fold paper strips to show halves, thirds, and fourths.</li><li>Shade the fraction of a shape named by the teacher.</li><li>Share a set of counters equally among friends and name the fraction each receives.</li></ul><p>Wrap-up: learners explain why the parts of a fraction must be equal in size.</p>$html$,
      'Name unit fractions of a whole and a set and represent halves, thirds, and fourths with drawings.',
      45,
      2
    ),
    (
      'sub_mabini_sci3',
      1,
      1,
      'les_mabini_sci3_living',
      'Living and Non-Living Things',
      $html$<h2>Overview</h2><p>Learners sort objects around the classroom and schoolyard into living and non-living things. They discover that living things grow, need food and water, and can reproduce, while non-living things do not.</p><h3>Activities</h3><ul><li>Take a short observation walk and list what is seen.</li><li>Sort picture cards into living and non-living groups.</li><li>Discuss why a plant is living but a rock is not.</li></ul><p>Wrap-up: learners name three signs that show something is alive.</p>$html$,
      'Classify things as living or non-living and describe the characteristics of living things.',
      50,
      1
    ),
    (
      'sub_mabini_sci3',
      1,
      2,
      'les_mabini_sci3_plants',
      'Parts of a Plant and Their Needs',
      $html$<h2>Overview</h2><p>Learners identify the roots, stem, leaves, and flower of a plant and describe what each part does. They also learn that plants need sunlight, water, air, and soil to grow.</p><h3>Activities</h3><ul><li>Label the parts of a real potted plant.</li><li>Match each plant part to its job, such as roots taking in water.</li><li>Start a small seed-growing observation in a cup.</li></ul><p>Wrap-up: learners explain what would happen to a plant kept in the dark.</p>$html$,
      'Identify the main parts of a plant, tell what each part does, and list what plants need to grow.',
      50,
      2
    ),
    (
      'sub_mabini_sci3',
      2,
      1,
      'les_mabini_sci3_animals',
      'Animals and Their Needs',
      $html$<h2>Overview</h2><p>Learners group familiar animals by where they live and what they eat, and describe the basic needs of animals for food, water, air, and shelter. They compare animals that live on land and in water.</p><h3>Activities</h3><ul><li>Sort animal pictures by their habitat.</li><li>Match animals to the food they eat.</li><li>Draw a shelter that meets an animal's needs.</li></ul><p>Wrap-up: learners explain how a pet at home has its needs met.</p>$html$,
      'Describe the basic needs of animals and group animals by habitat and the food they eat.',
      50,
      2
    ),
    (
      'sub_mabini_sci3',
      2,
      2,
      'les_mabini_sci3_weather',
      'Weather and Daily Activities',
      $html$<h2>Overview</h2><p>Learners observe and describe daily weather as sunny, cloudy, rainy, or windy, and record it on a weather chart. They discuss how weather affects the clothes they wear and the activities they can do.</p><h3>Activities</h3><ul><li>Observe today's sky and mark the class weather chart.</li><li>Match weather conditions to suitable clothing.</li><li>Talk about which activities are safe on a rainy day.</li></ul><p>Wrap-up: learners predict tomorrow's weather from what they see today.</p>$html$,
      'Describe different kinds of weather and explain how weather affects daily activities and clothing.',
      45,
      1
    ),
    (
      'sub_mabini_eng3',
      1,
      1,
      'les_mabini_eng3_nouns',
      'Common and Proper Nouns',
      $html$<h2>Overview</h2><p>Learners identify nouns as words that name people, places, animals, and things, and tell the difference between common and proper nouns. They learn that proper nouns begin with a capital letter.</p><h3>Activities</h3><ul><li>Circle the nouns in short sentences.</li><li>Sort nouns into common and proper columns.</li><li>Rewrite proper nouns with correct capital letters.</li></ul><p>Wrap-up: learners give one common noun and one proper noun for a person and a place.</p>$html$,
      'Identify nouns in sentences and distinguish common nouns from proper nouns, capitalizing proper nouns correctly.',
      50,
      2
    ),
    (
      'sub_mabini_eng3',
      1,
      2,
      'les_mabini_eng3_verbs',
      'Action Verbs',
      $html$<h2>Overview</h2><p>Learners recognize action verbs as words that tell what someone or something does. They act out verbs and use them to complete simple sentences about daily routines.</p><h3>Activities</h3><ul><li>Act out verbs such as run, jump, read, and write.</li><li>Underline the action verb in each sentence.</li><li>Complete sentences by choosing the best action verb.</li></ul><p>Wrap-up: learners say a sentence about themselves using an action verb.</p>$html$,
      'Identify action verbs in sentences and use action verbs correctly to describe everyday actions.',
      45,
      2
    ),
    (
      'sub_mabini_eng3',
      2,
      1,
      'les_mabini_eng3_reading',
      'Reading a Short Story',
      $html$<h2>Overview</h2><p>Learners read a short story with the teacher and answer questions about the characters, setting, and main events. They practice retelling the story in their own words in the correct order.</p><h3>Activities</h3><ul><li>Preview the title and pictures to predict the story.</li><li>Read aloud and pause to answer who, what, and where questions.</li><li>Retell the beginning, middle, and end using a story map.</li></ul><p>Wrap-up: learners share their favorite part and explain why.</p>$html$,
      'Read a short story and answer comprehension questions about characters, setting, and sequence of events.',
      50,
      2
    ),
    (
      'sub_mabini_eng3',
      2,
      2,
      'les_mabini_eng3_informational',
      'Reading for Information',
      $html$<h2>Overview</h2><p>Learners read a short informational text about a familiar topic and locate facts to answer questions. They notice how a title and pictures help them understand what the text is about.</p><h3>Activities</h3><ul><li>Read a short passage about a common animal or place.</li><li>Highlight facts that answer given questions.</li><li>Complete a simple fact chart from the text.</li></ul><p>Wrap-up: learners share one new fact they learned from the reading.</p>$html$,
      'Locate facts in a short informational text and answer questions using details from the passage.',
      45,
      2
    ),
    (
      'sub_mabini_fil3',
      1,
      1,
      'les_mabini_fil3_pantig',
      'Pagbaybay ng mga Pantig',
      $html$<h2>Overview</h2><p>Natututo ang mga bata na hatiin ang mga salita sa pantig at basahin ang mga ito nang malinaw. Ginagamit nila ang pagpalakpak upang bilangin ang bilang ng pantig sa isang salita.</p><h3>Mga Gawain</h3><ul><li>Palakpakin ang bawat pantig ng salita tulad ng ba-hay at pa-a-ra-lan.</li><li>Bilangin at isulat ang bilang ng pantig sa bawat salita.</li><li>Bumuo ng bagong salita mula sa mga ibinigay na pantig.</li></ul><p>Pagtatapos: nagbibigay ang mga bata ng isang salitang may tatlong pantig.</p>$html$,
      'Nahahati at nababasa nang wasto ang mga salita sa pantig at nabibilang ang bilang ng pantig.',
      50,
      1
    ),
    (
      'sub_mabini_fil3',
      1,
      2,
      'les_mabini_fil3_pangngalan',
      'Ang mga Pangngalan',
      $html$<h2>Overview</h2><p>Nakikilala ng mga bata ang pangngalan bilang salitang tumutukoy sa tao, hayop, bagay, at lugar. Natutukoy nila ang pantangi at pambalanang pangngalan sa mga pangungusap.</p><h3>Mga Gawain</h3><ul><li>Bilugan ang mga pangngalan sa maikling pangungusap.</li><li>Iuri ang mga pangngalan sa pantangi at pambalana.</li><li>Isulat nang may malaking titik ang mga pantanging pangngalan.</li></ul><p>Pagtatapos: nagbibigay ang mga bata ng halimbawa ng pangngalan para sa tao at lugar.</p>$html$,
      'Natutukoy ang mga pangngalan at naiuuri ang mga ito sa pantangi at pambalana.',
      45,
      2
    ),
    (
      'sub_mabini_fil3',
      2,
      1,
      'les_mabini_fil3_kuwento',
      'Pagbasa ng Maikling Kuwento',
      $html$<h2>Overview</h2><p>Bumabasa ang mga bata ng maikling kuwento kasama ang guro at sumasagot sa mga tanong tungkol sa mga tauhan at pangyayari. Isinasalaysay nila muli ang kuwento sa tamang pagkakasunod-sunod.</p><h3>Mga Gawain</h3><ul><li>Hulaan ang kuwento batay sa pamagat at larawan.</li><li>Sagutin ang mga tanong na sino, ano, at saan.</li><li>Isalaysay muli ang simula, gitna, at wakas ng kuwento.</li></ul><p>Pagtatapos: ibinabahagi ng mga bata ang paboritong bahagi ng kuwento.</p>$html$,
      'Nauunawaan ang maikling kuwento at nasasagot ang mga tanong tungkol sa tauhan at pangyayari.',
      50,
      2
    ),
    (
      'sub_mabini_fil3',
      2,
      2,
      'les_mabini_fil3_tula',
      'Pag-unawa sa Tula',
      $html$<h2>Overview</h2><p>Bumabasa ang mga bata ng maikling tula at nararamdaman ang tugma at ritmo nito. Natutukoy nila ang paksa at ang damdaming ipinapahayag ng tula.</p><h3>Mga Gawain</h3><ul><li>Basahin nang malakas ang tula nang may tamang tugma.</li><li>Tukuyin ang mga salitang magkakatugma.</li><li>Ilarawan ang damdaming ipinahihiwatig ng tula.</li></ul><p>Pagtatapos: nagbabahagi ang mga bata ng isang salitang naramdaman nila sa tula.</p>$html$,
      'Nauunawaan ang maikling tula at natutukoy ang paksa, tugma, at damdamin nito.',
      45,
      2
    ),
    (
      'sub_mabini_ap3',
      1,
      1,
      'les_mabini_ap3_komunidad',
      'Ang Aming Komunidad',
      $html$<h2>Overview</h2><p>Natututo ang mga bata na ang komunidad ay ang lugar na kanilang tinitirhan kasama ang pamilya at kapitbahay. Natutukoy nila ang mga mahahalagang bahagi nito tulad ng paaralan, palengke, at simbahan.</p><h3>Mga Gawain</h3><ul><li>Gumuhit ng simpleng mapa ng sariling komunidad.</li><li>Tukuyin ang mga pook na madalas puntahan ng pamilya.</li><li>Talakayin ang mga tao at ang kanilang gawain sa komunidad.</li></ul><p>Pagtatapos: nagbabahagi ang mga bata ng paboritong lugar sa kanilang komunidad.</p>$html$,
      'Natutukoy ang sariling komunidad at ang mga mahahalagang bahagi at tao nito.',
      50,
      1
    ),
    (
      'sub_mabini_ap3',
      1,
      2,
      'les_mabini_ap3_likas_yaman',
      'Mga Likas na Yaman ng Pamayanan',
      $html$<h2>Overview</h2><p>Nakikilala ng mga bata ang mga likas na yaman sa kanilang pamayanan tulad ng lupa, tubig, at halaman. Natututo silang pangalagaan ang mga ito para sa lahat.</p><h3>Mga Gawain</h3><ul><li>Tukuyin ang mga likas na yaman na makikita sa paligid.</li><li>Iugnay ang bawat yaman sa pakinabang nito sa pamayanan.</li><li>Magbigay ng paraan upang mapangalagaan ang kalikasan.</li></ul><p>Pagtatapos: nagbabahagi ang mga bata ng isang paraan ng pag-iingat sa kalikasan.</p>$html$,
      'Natutukoy ang mga likas na yaman ng pamayanan at ang wastong pangangalaga sa mga ito.',
      45,
      2
    ),
    (
      'sub_mabini_ap3',
      2,
      1,
      'les_mabini_ap3_pangangailangan',
      'Pangangailangan at Kagustuhan',
      $html$<h2>Overview</h2><p>Natututo ang mga bata na tukuyin ang pagkakaiba ng pangangailangan at kagustuhan. Nauunawaan nila na ang pagkain, damit, at tirahan ay mga pangangailangan.</p><h3>Mga Gawain</h3><ul><li>Iuri ang mga larawan sa pangangailangan at kagustuhan.</li><li>Talakayin kung bakit mahalaga ang mga pangangailangan.</li><li>Bumuo ng listahan ng mga pangangailangan ng pamilya.</li></ul><p>Pagtatapos: ipinaliliwanag ng mga bata ang pagkakaiba ng pangangailangan at kagustuhan.</p>$html$,
      'Naiuuri ang mga bagay bilang pangangailangan o kagustuhan at naipaliliwanag ang kahalagahan ng mga pangangailangan.',
      50,
      2
    ),
    (
      'sub_mabini_ap3',
      2,
      2,
      'les_mabini_ap3_tungkulin',
      'Mga Tungkulin ng Mamamayan',
      $html$<h2>Overview</h2><p>Natututo ang mga bata sa mga tungkulin at responsibilidad ng isang mabuting mamamayan sa tahanan, paaralan, at komunidad. Nauunawaan nila na ang pagtutulungan ay nakabubuti sa lahat.</p><h3>Mga Gawain</h3><ul><li>Talakayin ang mga tungkulin sa tahanan at paaralan.</li><li>Magbigay ng halimbawa ng tulong sa kapwa at komunidad.</li><li>Gumawa ng pangako ng isang mabuting gawain.</li></ul><p>Pagtatapos: nagbabahagi ang mga bata ng isang tungkuling gagampanan nila.</p>$html$,
      'Natutukoy ang mga tungkulin ng mabuting mamamayan sa tahanan, paaralan, at komunidad.',
      45,
      2
    )
)
insert into public.lessons (
  public_id,
  chapter_id,
  title,
  content,
  learning_objectives,
  estimated_minutes,
  complexity_score,
  sequence_no,
  status
)
select
  lesson_seed.public_id,
  chapters.chapter_id,
  lesson_seed.title,
  lesson_seed.content,
  lesson_seed.learning_objectives,
  lesson_seed.estimated_minutes,
  lesson_seed.complexity_score,
  lesson_seed.sequence_no,
  'published'::public.record_status
from lesson_seed
join public.subjects on subjects.public_id = lesson_seed.subject_public_id
join public.chapters
  on chapters.subject_id = subjects.subject_id
 and chapters.sequence_no = lesson_seed.chapter_sequence_no
on conflict (chapter_id, sequence_no) do update
set
  public_id = excluded.public_id,
  title = excluded.title,
  content = excluded.content,
  learning_objectives = excluded.learning_objectives,
  estimated_minutes = excluded.estimated_minutes,
  complexity_score = excluded.complexity_score,
  status = excluded.status,
  updated_at = now();

with plan_seed(public_id, subject_public_id, section_public_id, title, term, academic_year, start_date, end_date, notes) as (
  values
    (
      'lp_mabini_math3_sampaguita_2026',
      'sub_mabini_math3',
      'sec_mabini_g3_sampaguita',
      'Mathematics 3 First Quarter Plan - Sampaguita',
      'quarter',
      '2026-2027',
      '2026-06-09'::date,
      '2026-08-29'::date,
      'First quarter plan for Grade 3 Sampaguita covering place value, regrouping, multiplication facts, and fractions.'
    ),
    (
      'lp_mabini_eng3_rosal_2026',
      'sub_mabini_eng3',
      'sec_mabini_g3_rosal',
      'English 3 First Quarter Plan - Rosal',
      'quarter',
      '2026-2027',
      '2026-06-09'::date,
      '2026-08-29'::date,
      'First quarter plan for Grade 3 Rosal covering nouns, action verbs, and reading comprehension.'
    )
)
insert into public.lesson_plans (
  public_id,
  user_id,
  school_id,
  subject_id,
  section_id,
  title,
  term,
  academic_year,
  start_date,
  end_date,
  notes,
  status
)
select
  plan_seed.public_id,
  users.userid,
  schools.school_id,
  subjects.subject_id,
  sections.section_id,
  plan_seed.title,
  plan_seed.term,
  plan_seed.academic_year,
  plan_seed.start_date,
  plan_seed.end_date,
  plan_seed.notes,
  'published'::public.record_status
from plan_seed
join public.users on users.publicid = 'usr_maria_santos'
join public.schools on schools.public_id = 'sch_mabini_elem'
join public.subjects on subjects.public_id = plan_seed.subject_public_id
join public.sections on sections.public_id = plan_seed.section_public_id
on conflict (public_id) do update
set
  user_id = excluded.user_id,
  school_id = excluded.school_id,
  subject_id = excluded.subject_id,
  section_id = excluded.section_id,
  title = excluded.title,
  term = excluded.term,
  academic_year = excluded.academic_year,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  notes = excluded.notes,
  status = excluded.status,
  archived_at = null,
  updated_at = now();

with schedule_pattern(plan_public_id, iso_dow, start_time, end_time, meeting_type) as (
  values
    ('lp_mabini_math3_sampaguita_2026', 1, '08:00'::time, '09:00'::time, 'lecture'),
    ('lp_mabini_math3_sampaguita_2026', 3, '08:00'::time, '09:00'::time, 'lecture'),
    ('lp_mabini_math3_sampaguita_2026', 5, '08:00'::time, '09:00'::time, 'lecture'),
    ('lp_mabini_eng3_rosal_2026', 2, '09:00'::time, '10:00'::time, 'lecture'),
    ('lp_mabini_eng3_rosal_2026', 4, '09:00'::time, '10:00'::time, 'lecture')
),
slot_days as (
  select
    lesson_plans.lesson_plan_id,
    lesson_plans.public_id,
    lesson_plans.title,
    generated_day::date as slot_date,
    schedule_pattern.iso_dow,
    schedule_pattern.start_time,
    schedule_pattern.end_time,
    schedule_pattern.meeting_type
  from schedule_pattern
  join public.lesson_plans on lesson_plans.public_id = schedule_pattern.plan_public_id
  cross join lateral generate_series(lesson_plans.start_date, lesson_plans.end_date, interval '1 day') as generated_days(generated_day)
  where extract(isodow from generated_day)::integer = schedule_pattern.iso_dow
),
numbered_slots as (
  select
    slot_days.*,
    row_number() over (
      partition by lesson_plan_id, slot_date
      order by start_time, end_time
    ) as slot_number
  from slot_days
)
insert into public.slots (
  lesson_plan_id,
  title,
  slot_date,
  weekday,
  start_time,
  end_time,
  meeting_type,
  slot_number,
  series_key,
  is_locked
)
select
  lesson_plan_id,
  title,
  slot_date,
  case iso_dow
    when 1 then 'monday'
    when 2 then 'tuesday'
    when 3 then 'wednesday'
    when 4 then 'thursday'
    when 5 then 'friday'
    when 6 then 'saturday'
    else 'sunday'
  end::public.weekday_name,
  start_time,
  end_time,
  meeting_type::public.meeting_type,
  slot_number,
  public_id || '-' || iso_dow || '-' || start_time::text,
  false
from numbered_slots
on conflict (lesson_plan_id, slot_date, slot_number) do update
set
  title = excluded.title,
  weekday = excluded.weekday,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  meeting_type = excluded.meeting_type,
  series_key = excluded.series_key,
  is_locked = excluded.is_locked,
  updated_at = now();

with ordered_slots as (
  select
    slots.slot_id,
    slots.lesson_plan_id,
    slots.start_time,
    slots.end_time,
    slots.meeting_type,
    lesson_plans.public_id as plan_public_id,
    lesson_plans.subject_id,
    subjects.title as subject_title,
    row_number() over (
      partition by slots.lesson_plan_id
      order by slots.slot_date, slots.start_time, slots.slot_number
    ) as slot_sequence
  from public.slots
  join public.lesson_plans on lesson_plans.lesson_plan_id = slots.lesson_plan_id
  join public.subjects on subjects.subject_id = lesson_plans.subject_id
  where lesson_plans.public_id in ('lp_mabini_math3_sampaguita_2026', 'lp_mabini_eng3_rosal_2026')
),
subject_lessons as (
  select
    subjects.subject_id,
    lessons.lesson_id,
    lessons.title as lesson_title,
    row_number() over (
      partition by subjects.subject_id
      order by chapters.sequence_no, lessons.sequence_no
    ) as lesson_sequence,
    count(*) over (partition by subjects.subject_id) as lesson_count
  from public.subjects
  join public.chapters on chapters.subject_id = subjects.subject_id
  join public.lessons on lessons.chapter_id = chapters.chapter_id
  where subjects.public_id in ('sub_mabini_math3', 'sub_mabini_eng3')
),
block_source as (
  select
    ordered_slots.*,
    subject_lessons.lesson_id,
    subject_lessons.lesson_title
  from ordered_slots
  join subject_lessons
    on subject_lessons.subject_id = ordered_slots.subject_id
   and subject_lessons.lesson_sequence = ((ordered_slots.slot_sequence - 1) % subject_lessons.lesson_count) + 1
)
insert into public.blocks (
  lesson_plan_id,
  slot_id,
  lesson_id,
  algorithm_block_key,
  block_key,
  title,
  description,
  session_category,
  session_subcategory,
  meeting_type,
  start_time,
  end_time,
  required,
  splittable,
  preferred_session_type,
  dependency_keys,
  order_no,
  is_locked,
  metadata
)
select
  lesson_plan_id,
  slot_id,
  lesson_id,
  'elem-' || plan_public_id || '-' || slot_sequence,
  'elem-' || plan_public_id || '-' || slot_sequence,
  case
    when slot_sequence % 12 = 0 then 'Quarterly Test: ' || subject_title
    when slot_sequence % 7 = 0 then 'Performance Task: ' || subject_title
    when slot_sequence % 5 = 0 then 'Quiz: ' || subject_title
    else lesson_title
  end,
  case
    when slot_sequence % 12 = 0 then 'Quarterly assessment with checking and feedback time.'
    when slot_sequence % 7 = 0 then 'Performance evidence aligned with the current unit.'
    when slot_sequence % 5 = 0 then 'Short formative written work for recent lessons.'
    else 'Lesson block tied to a filled library lesson.'
  end,
  case
    when slot_sequence % 12 = 0 then 'exam'
    when slot_sequence % 7 = 0 then 'performance_task'
    when slot_sequence % 5 = 0 then 'written_work'
    else 'lesson'
  end::public.session_category,
  case
    when slot_sequence % 12 = 0 then 'final'
    when slot_sequence % 7 = 0 then 'activity'
    when slot_sequence % 5 = 0 then 'quiz'
    else meeting_type::text
  end::public.session_subcategory,
  meeting_type,
  start_time,
  end_time,
  true,
  false,
  case when meeting_type = 'laboratory' then 'laboratory' else 'lecture' end,
  '{}'::text[],
  1,
  false,
  jsonb_build_object(
    'source',
    'seed_elementary',
    'sequence',
    slot_sequence,
    'lesson_no',
    slot_sequence,
    'scope_lesson_ids',
    jsonb_build_array(lesson_id)
  )
from block_source
on conflict (lesson_plan_id, algorithm_block_key) do update
set
  slot_id = excluded.slot_id,
  lesson_id = excluded.lesson_id,
  block_key = excluded.block_key,
  title = excluded.title,
  description = excluded.description,
  session_category = excluded.session_category,
  session_subcategory = excluded.session_subcategory,
  meeting_type = excluded.meeting_type,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  required = excluded.required,
  splittable = excluded.splittable,
  preferred_session_type = excluded.preferred_session_type,
  dependency_keys = excluded.dependency_keys,
  order_no = excluded.order_no,
  is_locked = excluded.is_locked,
  metadata = excluded.metadata,
  updated_at = now();

delete from public.plan_subject_content
where lesson_plan_id in (
  select lesson_plan_id
  from public.lesson_plans
  where public_id in ('lp_mabini_math3_sampaguita_2026', 'lp_mabini_eng3_rosal_2026')
);

with plan_subjects as (
  select lesson_plan_id, subject_id
  from public.lesson_plans
  where public_id in ('lp_mabini_math3_sampaguita_2026', 'lp_mabini_eng3_rosal_2026')
)
insert into public.plan_subject_content (
  lesson_plan_id,
  subject_id,
  unit_id,
  content_level,
  sequence_no,
  selected_title,
  selected_content
)
select
  plan_subjects.lesson_plan_id,
  plan_subjects.subject_id,
  units.unit_id,
  'unit',
  units.sequence_no,
  units.title,
  units.description
from plan_subjects
join public.units on units.subject_id = plan_subjects.subject_id;

with plan_subjects as (
  select lesson_plan_id, subject_id
  from public.lesson_plans
  where public_id in ('lp_mabini_math3_sampaguita_2026', 'lp_mabini_eng3_rosal_2026')
)
insert into public.plan_subject_content (
  lesson_plan_id,
  subject_id,
  unit_id,
  chapter_id,
  content_level,
  sequence_no,
  selected_title,
  selected_content
)
select
  plan_subjects.lesson_plan_id,
  plan_subjects.subject_id,
  chapters.unit_id,
  chapters.chapter_id,
  'chapter',
  chapters.sequence_no,
  chapters.title,
  chapters.description
from plan_subjects
join public.chapters on chapters.subject_id = plan_subjects.subject_id;

with selected_lessons as (
  select
    lesson_plans.lesson_plan_id,
    lesson_plans.subject_id,
    chapters.unit_id,
    chapters.chapter_id,
    lessons.lesson_id,
    lessons.title,
    lessons.content,
    lessons.learning_objectives,
    lessons.estimated_minutes,
    row_number() over (
      partition by lesson_plans.lesson_plan_id
      order by chapters.sequence_no, lessons.sequence_no
    ) as content_sequence
  from public.lesson_plans
  join public.chapters on chapters.subject_id = lesson_plans.subject_id
  join public.lessons on lessons.chapter_id = chapters.chapter_id
  where lesson_plans.public_id in ('lp_mabini_math3_sampaguita_2026', 'lp_mabini_eng3_rosal_2026')
)
insert into public.plan_subject_content (
  lesson_plan_id,
  subject_id,
  unit_id,
  chapter_id,
  lesson_id,
  content_level,
  sequence_no,
  selected_title,
  selected_content,
  learning_objectives,
  estimated_minutes
)
select
  lesson_plan_id,
  subject_id,
  unit_id,
  chapter_id,
  lesson_id,
  'lesson',
  content_sequence,
  title,
  content,
  learning_objectives,
  estimated_minutes
from selected_lessons;

with activity_seed(public_id, subject_public_id, chapter_sequence_no, title, category, activity_type, scope_summary, requirements, component_keys, template_notes, generation_notes, generated_text) as (
  values
    (
      'act_mabini_math3_regrouping_ws',
      'sub_mabini_math3',
      1,
      'Addition with Regrouping Worksheet',
      'written_work',
      'assignment',
      'Assignment covering place value and addition with regrouping.',
      '{"items":15,"duration_minutes":30,"item_mix":["column_addition","word_problems"]}'::jsonb,
      array['worksheet','answer_key'],
      'Include two- and three-digit sums that require carrying, plus two short word problems.',
      'Provide a worked example at the top and clear answer boxes.',
      'A fifteen-item worksheet where learners solve column addition with regrouping and two everyday word problems, with a worked example and answer key.'
    ),
    (
      'act_mabini_sci3_plant_quiz',
      'sub_mabini_sci3',
      1,
      'Parts of a Plant Quiz',
      'written_work',
      'quiz',
      'Quiz covering living things and the parts and needs of plants.',
      '{"items":10,"duration_minutes":20,"item_mix":["labeling","multiple_choice","true_false"]}'::jsonb,
      array['quiz','answer_key'],
      'Include one plant diagram to label and questions on what plants need to grow.',
      'Keep wording simple and add one picture-based labeling item.',
      'A ten-item quiz with a labeled plant diagram, multiple-choice, and true-or-false questions on plant parts and needs.'
    ),
    (
      'act_mabini_ap3_community_poster',
      'sub_mabini_ap3',
      1,
      'My Community Poster',
      'performance_task',
      'project',
      'Project covering the local community and its important places and people.',
      '{"format":"poster","duration_minutes":60,"deliverables":["drawing","short_labels","oral_share"]}'::jsonb,
      array['task_brief','rubric'],
      'Learners draw important places in their community and label at least four of them.',
      'Include a simple rubric for content, labels, and neatness.',
      'A poster project where learners draw and label the important places and people in their community and share it briefly with the class.'
    )
),
activity_scope as (
  select
    activity_seed.*,
    array_agg(lessons.lesson_id order by lessons.sequence_no) as scope_lesson_ids
  from activity_seed
  join public.subjects on subjects.public_id = activity_seed.subject_public_id
  join public.chapters
    on chapters.subject_id = subjects.subject_id
   and chapters.sequence_no = activity_seed.chapter_sequence_no
  join public.lessons on lessons.chapter_id = chapters.chapter_id
  group by
    activity_seed.public_id,
    activity_seed.subject_public_id,
    activity_seed.chapter_sequence_no,
    activity_seed.title,
    activity_seed.category,
    activity_seed.activity_type,
    activity_seed.scope_summary,
    activity_seed.requirements,
    activity_seed.component_keys,
    activity_seed.template_notes,
    activity_seed.generation_notes,
    activity_seed.generated_text
)
insert into public.activities (
  public_id,
  user_id,
  school_id,
  subject_id,
  title,
  category,
  activity_type,
  scope_lesson_ids,
  scope_summary,
  requirements,
  component_keys,
  template_notes,
  generation_notes,
  generated_text,
  status
)
select
  activity_scope.public_id,
  users.userid,
  schools.school_id,
  subjects.subject_id,
  activity_scope.title,
  activity_scope.category::public.session_category,
  activity_scope.activity_type,
  activity_scope.scope_lesson_ids,
  activity_scope.scope_summary,
  activity_scope.requirements,
  activity_scope.component_keys,
  activity_scope.template_notes,
  activity_scope.generation_notes,
  activity_scope.generated_text,
  'published'::public.record_status
from activity_scope
join public.users on users.publicid = 'usr_maria_santos'
join public.schools on schools.public_id = 'sch_mabini_elem'
join public.subjects on subjects.public_id = activity_scope.subject_public_id
on conflict (public_id) do update
set
  user_id = excluded.user_id,
  school_id = excluded.school_id,
  subject_id = excluded.subject_id,
  title = excluded.title,
  category = excluded.category,
  activity_type = excluded.activity_type,
  scope_lesson_ids = excluded.scope_lesson_ids,
  scope_summary = excluded.scope_summary,
  requirements = excluded.requirements,
  component_keys = excluded.component_keys,
  template_notes = excluded.template_notes,
  generation_notes = excluded.generation_notes,
  generated_text = excluded.generated_text,
  status = excluded.status,
  updated_at = now();

with event_seed(title, description, start_date, end_date, event_type, blackout_reason) as (
  values
    (
      'Nutrition Month Program',
      'Whole-day Nutrition Month program with a healthy food fair and classroom activities.',
      '2026-07-24'::date,
      '2026-07-24'::date,
      'school_event',
      'event'
    )
)
insert into public.school_calendar_events (
  school_id,
  event_type,
  blackout_reason,
  title,
  description,
  start_date,
  end_date,
  is_whole_day,
  created_by
)
select
  schools.school_id,
  event_seed.event_type::public.calendar_event_type,
  event_seed.blackout_reason::public.plan_blackout_reason,
  event_seed.title,
  event_seed.description,
  event_seed.start_date,
  event_seed.end_date,
  true,
  users.userid
from event_seed
join public.schools on schools.public_id = 'sch_mabini_elem'
join public.users on users.publicid = 'usr_maria_santos'
where not exists (
  select 1
  from public.school_calendar_events existing
  where existing.school_id = schools.school_id
    and existing.title = event_seed.title
    and existing.start_date = event_seed.start_date
    and existing.end_date = event_seed.end_date
);

commit;
