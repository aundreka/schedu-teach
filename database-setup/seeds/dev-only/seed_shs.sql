-- =====================================================================
-- DEV-ONLY SEED — NEVER RUN IN PRODUCTION.
-- Creates a Senior High School teacher persona (Grace Lim, Grade 11 STEM)
-- with rich, believable planning data.
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
--   username: grace.lim
--   email:    grace.lim@example.com
--   password: ScheduTest2026!
--
-- Run this after database-setup/00_users.sql through the latest billing/onboarding files.
-- The app's Library screen reads "books" from subjects assigned through user_subjects.

with seed_user(user_id, public_id, first_name, last_name, username, email, role_name) as (
  values (
    '33333333-3333-4333-8333-333333333333'::uuid,
    'usr_grace_lim',
    'Grace',
    'Lim',
    'grace.lim',
    'grace.lim@example.com',
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

with seed_user(user_id, public_id, first_name, last_name, username, email, role_name) as (
  values (
    '33333333-3333-4333-8333-333333333333'::uuid,
    'usr_grace_lim',
    'Grace',
    'Lim',
    'grace.lim',
    'grace.lim@example.com',
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
  role
)
select
  user_id,
  public_id,
  first_name,
  last_name,
  username,
  email,
  role_name::public.user_role
from seed_user
on conflict (userid) do update
set
  publicid = excluded.publicid,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  username = excluded.username,
  email = excluded.email,
  role = excluded.role,
  updated_at = now();

-- Mark onboarding complete so the first-run wizard does not gate this persona.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'onboarded_at'
  ) then
    update public.users
    set onboarded_at = now()
    where publicid = 'usr_grace_lim';
  end if;
end $$;

do $$
begin
  if to_regclass('public.subscriptions') is not null then
    insert into public.subscriptions (user_id, tier, status)
    select userid, 'tier2'::public.subscription_tier, 'active'::public.subscription_status
    from public.users
    where publicid = 'usr_grace_lim'
    on conflict (user_id) do update
    set
      tier = excluded.tier,
      status = excluded.status,
      updated_at = now();
  end if;

  -- usage_quotas was keyed on period_month before 10_billing_v2.sql renamed it
  -- to period_day. This dev seed runs after the full schema, so it targets period_day.
  if to_regclass('public.usage_quotas') is not null then
    insert into public.usage_quotas (user_id, period_day, ai_generations_used)
    select userid, current_date, 0
    from public.users
    where publicid = 'usr_grace_lim'
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
    'sch_rizal_shs',
    'Rizal National High School - Senior High',
    'basic_ed',
    '#059669',
    true,
    'usr_grace_lim'
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
join public.schools on schools.public_id = 'sch_rizal_shs'
where users.publicid = 'usr_grace_lim'
on conflict (user_id, school_id) do update
set is_primary = excluded.is_primary;

with section_seed(public_id, grade_level, name, status_name) as (
  values
    ('sec_rizal_g11_stem_a', 'Grade 11', 'Grade 11 - STEM A', 'published'),
    ('sec_rizal_g11_stem_b', 'Grade 11', 'Grade 11 - STEM B', 'published')
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
join public.schools on schools.public_id = 'sch_rizal_shs'
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
join public.schools on schools.public_id = 'sch_rizal_shs'
join public.sections on sections.school_id = schools.school_id
where users.publicid = 'usr_grace_lim'
  and sections.public_id in ('sec_rizal_g11_stem_a', 'sec_rizal_g11_stem_b')
on conflict (user_id, section_id) do nothing;

with subject_seed(public_id, code, title, year_level, academic_year, unit_no, description, status_name) as (
  values
    (
      'sub_rizal_genmath',
      'GENMATH',
      'General Mathematics',
      'Grade 11',
      '2026-2027',
      3,
      'A core Grade 11 course on functions, rational, exponential, and logarithmic relationships, and the mathematics of finance including simple and compound interest.',
      'published'
    ),
    (
      'sub_rizal_els',
      'ELS',
      'Earth and Life Science',
      'Grade 11',
      '2026-2027',
      3,
      'A core science course spanning the universe and solar system, the interacting subsystems of Earth, and the biomolecules and cellular basis of living things.',
      'published'
    ),
    (
      'sub_rizal_oralcom',
      'ORALCOM',
      'Oral Communication in Context',
      'Grade 11',
      '2026-2027',
      2,
      'A core course developing effective oral communication through communication models, verbal and nonverbal strategies, speech acts, and the different types and purposes of speech.',
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
join public.schools on schools.public_id = 'sch_rizal_shs'
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
join public.subjects on subjects.public_id in ('sub_rizal_genmath', 'sub_rizal_els', 'sub_rizal_oralcom')
where users.publicid = 'usr_grace_lim'
on conflict (user_id, subject_id) do nothing;

with unit_seed(subject_public_id, sequence_no, public_id, title, description) as (
  values
    ('sub_rizal_genmath', 1, 'unt_rizal_genmath_functions', 'Functions and Their Graphs', 'Function concepts, evaluation, operations, and rational functions with their graphs and asymptotes.'),
    ('sub_rizal_genmath', 2, 'unt_rizal_genmath_expolog', 'Exponential and Logarithmic Functions', 'Exponential growth and decay, logarithms as inverses, and solving exponential and logarithmic equations.'),
    ('sub_rizal_genmath', 3, 'unt_rizal_genmath_finance', 'Basic Business Mathematics', 'Simple and compound interest, annuities, and applications of financial mathematics.'),
    ('sub_rizal_els', 1, 'unt_rizal_els_universe', 'The Universe and the Solar System', 'Origin of the universe, formation of the solar system, and Earth as a habitable planet.'),
    ('sub_rizal_els', 2, 'unt_rizal_els_earth', 'Earth as a System', 'The interacting geosphere, hydrosphere, atmosphere, and biosphere and the flow of energy and matter.'),
    ('sub_rizal_els', 3, 'unt_rizal_els_life', 'Foundations of Life', 'Biomolecules of living things and the cell as the basic structural and functional unit of life.'),
    ('sub_rizal_oralcom', 1, 'unt_rizal_oralcom_process', 'The Communication Process', 'Nature, models, and functions of communication and the role of verbal and nonverbal cues.'),
    ('sub_rizal_oralcom', 2, 'unt_rizal_oralcom_speech', 'Speech Acts and Types of Speech', 'Speech acts, communicative strategies, and the types and purposes of speech in context.')
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
    ('sub_rizal_genmath', 1, 1, 'chp_rizal_genmath_functions', 'Functions and Function Operations', 'Introduces functions, evaluation, and operations on functions.'),
    ('sub_rizal_genmath', 1, 2, 'chp_rizal_genmath_rational', 'Rational Functions', 'Explores rational functions, their graphs, intercepts, and asymptotes.'),
    ('sub_rizal_genmath', 2, 3, 'chp_rizal_genmath_expolog', 'Exponential and Logarithmic Functions', 'Develops exponential and logarithmic functions and their relationships.'),
    ('sub_rizal_genmath', 3, 4, 'chp_rizal_genmath_interest', 'Interest and Financial Mathematics', 'Applies simple and compound interest to real financial situations.'),
    ('sub_rizal_els', 1, 1, 'chp_rizal_els_universe', 'Universe and Solar System', 'Traces the origin of the universe and formation of the solar system.'),
    ('sub_rizal_els', 2, 2, 'chp_rizal_els_subsystems', 'Earth Subsystems', 'Examines how Earth subsystems interact and exchange energy and matter.'),
    ('sub_rizal_els', 3, 3, 'chp_rizal_els_cells', 'Biomolecules and Cells', 'Connects biomolecules to the structure and function of cells.'),
    ('sub_rizal_oralcom', 1, 1, 'chp_rizal_oralcom_models', 'Communication Models and Cues', 'Covers models of communication and verbal and nonverbal cues.'),
    ('sub_rizal_oralcom', 2, 2, 'chp_rizal_oralcom_speech', 'Speech Acts and Types of Speech', 'Applies speech acts and the different types of speech.')
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
      'sub_rizal_genmath',
      1,
      1,
      'les_rizal_genmath_functions_intro',
      'Functions and Function Evaluation',
      $html$<h2>Overview</h2><p>Students revisit relations and functions, distinguish functions from non-functions using the vertical line test, and evaluate functions written in function notation for given inputs.</p><h3>Lesson Flow</h3><ul><li>Warm-up: sort real-life pairings into functions and non-functions.</li><li>Discussion: domain, range, and the vertical line test.</li><li>Guided practice: evaluate f(x) for tables, graphs, and equations.</li></ul><p>Exit task: explain in one sentence why every function is a relation but not every relation is a function.</p>$html$,
      'Define a function and distinguish it from a mere relation; apply the vertical line test; evaluate functions using function notation.',
      60,
      4
    ),
    (
      'sub_rizal_genmath',
      1,
      2,
      'les_rizal_genmath_function_operations',
      'Operations on Functions',
      $html$<h2>Overview</h2><p>The class performs addition, subtraction, multiplication, division, and composition of functions, paying attention to how the domain changes after each operation.</p><h3>Practice</h3><ul><li>Combine two functions using each operation.</li><li>Compose functions and evaluate at a value.</li><li>State the domain of the resulting function.</li></ul><p>Students close by comparing (f + g)(x) with (f o g)(x) to see why order and operation matter.</p>$html$,
      'Perform the four fundamental operations on functions; form the composition of two functions; determine the domain of a combined function.',
      60,
      5
    ),
    (
      'sub_rizal_genmath',
      2,
      1,
      'les_rizal_genmath_rational_graphs',
      'Graphing Rational Functions',
      $html$<h2>Overview</h2><p>Students graph rational functions by finding intercepts, vertical and horizontal asymptotes, and analyzing behavior near restricted values of the domain.</p><h3>Guided Work</h3><ul><li>Identify values that make the denominator zero.</li><li>Locate vertical and horizontal asymptotes.</li><li>Sketch the curve and describe end behavior.</li></ul><p>Exit prompt: describe what an asymptote tells us about the values a function can never take.</p>$html$,
      'Determine the domain, intercepts, and asymptotes of a rational function; sketch its graph; interpret asymptotic behavior.',
      70,
      5
    ),
    (
      'sub_rizal_genmath',
      2,
      2,
      'les_rizal_genmath_rational_equations',
      'Rational Equations and Inequalities',
      $html$<h2>Overview</h2><p>The lesson develops strategies for solving rational equations and inequalities, including checking for extraneous solutions introduced by multiplying through by variable expressions.</p><h3>Workshop</h3><ul><li>Clear denominators and solve rational equations.</li><li>Use a sign chart to solve a rational inequality.</li><li>Verify solutions against domain restrictions.</li></ul><p>Students submit a worked example that highlights where an extraneous root appeared.</p>$html$,
      'Solve rational equations and inequalities; identify and reject extraneous solutions; represent solution sets on a number line.',
      70,
      6
    ),
    (
      'sub_rizal_genmath',
      3,
      1,
      'les_rizal_genmath_exponential',
      'Exponential Functions, Growth, and Decay',
      $html$<h2>Overview</h2><p>Students model exponential growth and decay using real contexts such as population change and radioactive decay, then compare the shapes of increasing and decreasing exponential graphs.</p><h3>Practice</h3><ul><li>Build a table of values for an exponential function.</li><li>Contrast growth and decay using the base value.</li><li>Solve a basic exponential equation with a common base.</li></ul><p>Exit task: predict how doubling the base changes the steepness of the graph.</p>$html$,
      'Represent and graph exponential functions; distinguish exponential growth from decay; solve simple exponential equations.',
      70,
      5
    ),
    (
      'sub_rizal_genmath',
      3,
      2,
      'les_rizal_genmath_logarithmic',
      'Logarithmic Functions as Inverses',
      $html$<h2>Overview</h2><p>The class introduces logarithms as the inverse of exponential functions, converts between exponential and logarithmic form, and applies the basic laws of logarithms.</p><h3>Guided Work</h3><ul><li>Rewrite exponential statements in logarithmic form.</li><li>Evaluate logarithms using the definition.</li><li>Apply product, quotient, and power laws of logarithms.</li></ul><p>Students finish by explaining why the logarithmic graph is the reflection of the exponential graph across y = x.</p>$html$,
      'Relate logarithmic and exponential functions as inverses; convert between forms; apply the laws of logarithms.',
      70,
      6
    ),
    (
      'sub_rizal_genmath',
      4,
      1,
      'les_rizal_genmath_simple_interest',
      'Simple Interest',
      $html$<h2>Overview</h2><p>Students apply the simple interest formula to compute interest, maturity value, principal, rate, and time using authentic lending and savings scenarios.</p><h3>Workshop</h3><ul><li>Identify principal, rate, and time in a word problem.</li><li>Compute simple interest and maturity value.</li><li>Solve for a missing quantity in the formula.</li></ul><p>Exit prompt: explain how simple interest grows differently from a percentage taken only once.</p>$html$,
      'Apply the simple interest formula; compute maturity value; solve for principal, rate, or time given the others.',
      60,
      4
    ),
    (
      'sub_rizal_genmath',
      4,
      2,
      'les_rizal_genmath_compound_interest',
      'Compound Interest',
      $html$<h2>Overview</h2><p>The lesson contrasts compound interest with simple interest, showing how compounding frequency affects the final amount, and computes future value for different periods.</p><h3>Practice</h3><ul><li>Compute compound amount for annual and semi-annual compounding.</li><li>Compare simple and compound results for the same terms.</li><li>Discuss the effect of more frequent compounding.</li></ul><p>Students submit a short comparison showing why compound interest outpaces simple interest over time.</p>$html$,
      'Compute compound interest and future value; compare simple and compound interest; explain the effect of compounding frequency.',
      70,
      5
    ),
    (
      'sub_rizal_els',
      1,
      1,
      'les_rizal_els_universe_origin',
      'Origin of the Universe',
      $html$<h2>Overview</h2><p>Students examine the scientific evidence for the Big Bang theory, including cosmic expansion and background radiation, and place the age of the universe on a scaled timeline.</p><h3>Discussion</h3><ul><li>Summarize the key evidence for an expanding universe.</li><li>Order major cosmic events on a timeline.</li><li>Distinguish scientific explanations from other accounts.</li></ul><p>Exit task: name one observation that supports the idea that the universe is expanding.</p>$html$,
      'Describe the Big Bang theory; cite evidence for an expanding universe; sequence major events in cosmic history.',
      60,
      4
    ),
    (
      'sub_rizal_els',
      1,
      2,
      'les_rizal_els_solar_system',
      'Formation of the Solar System',
      $html$<h2>Overview</h2><p>The class explores the nebular hypothesis, compares terrestrial and gas giant planets, and identifies the factors that make Earth habitable.</p><h3>Guided Work</h3><ul><li>Trace solar system formation from a collapsing nebula.</li><li>Compare inner and outer planets by composition.</li><li>List conditions that support life on Earth.</li></ul><p>Students close by ranking the habitability factors they think matter most and defending their choice.</p>$html$,
      'Explain solar system formation using the nebular hypothesis; compare planet types; identify factors that make Earth habitable.',
      60,
      4
    ),
    (
      'sub_rizal_els',
      2,
      1,
      'les_rizal_els_subsystems',
      'Earth Subsystems and Their Interactions',
      $html$<h2>Overview</h2><p>Students model the geosphere, hydrosphere, atmosphere, and biosphere as interacting systems and trace how energy and matter move among them in familiar events.</p><h3>Activity</h3><ul><li>Classify components into the correct subsystem.</li><li>Trace matter and energy through an example like rainfall.</li><li>Diagram one interaction between two subsystems.</li></ul><p>Exit prompt: give one everyday event that involves at least three subsystems working together.</p>$html$,
      'Identify the four Earth subsystems; describe interactions among them; trace the flow of energy and matter through an event.',
      70,
      5
    ),
    (
      'sub_rizal_els',
      2,
      2,
      'les_rizal_els_energy_flow',
      'Energy and Matter Flow in Earth Systems',
      $html$<h2>Overview</h2><p>The lesson follows the water cycle and carbon cycle as examples of how matter cycles and energy flows, linking these processes to weather and living systems.</p><h3>Workshop</h3><ul><li>Label the stages of the water cycle.</li><li>Trace carbon through photosynthesis and respiration.</li><li>Connect these cycles to the biosphere.</li></ul><p>Students submit a labeled cycle diagram with a one-sentence explanation of each stage.</p>$html$,
      'Describe the water and carbon cycles; explain how matter cycles while energy flows; connect cycles to the biosphere.',
      70,
      5
    ),
    (
      'sub_rizal_els',
      3,
      1,
      'les_rizal_els_biomolecules',
      'Biomolecules of Living Things',
      $html$<h2>Overview</h2><p>Students identify carbohydrates, lipids, proteins, and nucleic acids, describe their building blocks, and connect each biomolecule to a function in the body.</p><h3>Guided Work</h3><ul><li>Match each biomolecule to its monomer.</li><li>Give a food source and a function for each type.</li><li>Explain why proteins have diverse roles.</li></ul><p>Exit task: name the biomolecule that stores genetic information and justify your answer.</p>$html$,
      'Classify the four major biomolecules; identify their building blocks; relate each biomolecule to a biological function.',
      70,
      5
    ),
    (
      'sub_rizal_els',
      3,
      2,
      'les_rizal_els_cells',
      'The Cell as the Basic Unit of Life',
      $html$<h2>Overview</h2><p>The class compares prokaryotic and eukaryotic cells, identifies major organelles, and relates cell structures to the processes that keep organisms alive.</p><h3>Activity</h3><ul><li>Label organelles on a cell diagram.</li><li>Match each organelle to its function.</li><li>Contrast plant and animal cell features.</li></ul><p>Students finish by explaining how one organelle contributes to the survival of the whole cell.</p>$html$,
      'Distinguish prokaryotic from eukaryotic cells; identify major organelles and functions; compare plant and animal cells.',
      70,
      5
    ),
    (
      'sub_rizal_oralcom',
      1,
      1,
      'les_rizal_oralcom_models',
      'The Communication Process and Its Models',
      $html$<h2>Overview</h2><p>Students examine the nature of communication and compare linear, interactive, and transactional models, identifying the sender, message, channel, receiver, feedback, and noise.</p><h3>Discussion</h3><ul><li>Label the elements in a real conversation.</li><li>Compare the three communication models.</li><li>Identify sources of noise that block a message.</li></ul><p>Exit task: give one example of feedback that shows communication is transactional rather than one-way.</p>$html$,
      'Explain the nature and process of communication; compare communication models; identify the elements of a communication situation.',
      60,
      4
    ),
    (
      'sub_rizal_oralcom',
      1,
      2,
      'les_rizal_oralcom_verbal_nonverbal',
      'Verbal and Nonverbal Communication',
      $html$<h2>Overview</h2><p>The lesson develops effective use of verbal and nonverbal cues such as gestures, facial expression, posture, and tone, and shows how they reinforce or contradict a spoken message.</p><h3>Practice</h3><ul><li>Interpret meaning conveyed by nonverbal cues.</li><li>Match tone and body language to intended meaning.</li><li>Revise a delivery to align verbal and nonverbal signals.</li></ul><p>Students close by describing a situation where nonverbal cues changed the meaning of the words.</p>$html$,
      'Distinguish verbal from nonverbal communication; use nonverbal cues effectively; explain how cues reinforce or contradict a message.',
      60,
      4
    ),
    (
      'sub_rizal_oralcom',
      2,
      1,
      'les_rizal_oralcom_speech_acts',
      'Speech Acts and Communicative Strategies',
      $html$<h2>Overview</h2><p>Students study locutionary, illocutionary, and perlocutionary acts and practice communicative strategies such as turn-taking, topic control, and repair to keep conversations effective.</p><h3>Workshop</h3><ul><li>Classify utterances by type of speech act.</li><li>Identify the communicative strategy used in a dialogue.</li><li>Repair a breakdown in a sample conversation.</li></ul><p>Exit prompt: explain the difference between what a speaker says and what the speaker intends.</p>$html$,
      'Differentiate the three types of speech acts; apply communicative strategies; repair breakdowns in conversation.',
      70,
      5
    ),
    (
      'sub_rizal_oralcom',
      2,
      2,
      'les_rizal_oralcom_types_speech',
      'Types and Purposes of Speech',
      $html$<h2>Overview</h2><p>The class distinguishes speeches by purpose (to inform, entertain, or persuade) and by delivery (manuscript, memorized, impromptu, and extemporaneous), and matches each to an appropriate situation.</p><h3>Application</h3><ul><li>Match a speaking situation to a purpose.</li><li>Compare the four types of delivery.</li><li>Plan a short extemporaneous response to a prompt.</li></ul><p>Students submit a plan for a one-minute impromptu speech with a clear purpose.</p>$html$,
      'Classify speeches by purpose and by delivery; select an appropriate type for a situation; plan a short spoken response.',
      70,
      5
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

with plan_seed(public_id, subject_public_id, section_public_id, title, academic_year, term, start_date, end_date, notes) as (
  values
    (
      'lp_rizal_genmath_stema_2026',
      'sub_rizal_genmath',
      'sec_rizal_g11_stem_a',
      'General Mathematics - Grade 11 STEM A',
      '2026-2027',
      'semester',
      '2026-06-09'::date,
      '2026-10-17'::date,
      'First semester plan covering functions, rational functions, exponential and logarithmic functions, and financial mathematics.'
    )
)
insert into public.lesson_plans (
  public_id,
  user_id,
  school_id,
  subject_id,
  section_id,
  title,
  academic_year,
  term,
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
  plan_seed.academic_year,
  plan_seed.term,
  plan_seed.start_date,
  plan_seed.end_date,
  plan_seed.notes,
  'published'::public.record_status
from plan_seed
join public.users on users.publicid = 'usr_grace_lim'
join public.schools on schools.public_id = 'sch_rizal_shs'
join public.subjects on subjects.public_id = plan_seed.subject_public_id
join public.sections on sections.public_id = plan_seed.section_public_id
on conflict (public_id) do update
set
  user_id = excluded.user_id,
  school_id = excluded.school_id,
  subject_id = excluded.subject_id,
  section_id = excluded.section_id,
  title = excluded.title,
  academic_year = excluded.academic_year,
  term = excluded.term,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  notes = excluded.notes,
  status = excluded.status,
  archived_at = null,
  updated_at = now();

with schedule_pattern(plan_public_id, iso_dow, start_time, end_time, meeting_type) as (
  values
    ('lp_rizal_genmath_stema_2026', 1, '10:00'::time, '11:30'::time, 'lecture'),
    ('lp_rizal_genmath_stema_2026', 3, '10:00'::time, '11:30'::time, 'lecture'),
    ('lp_rizal_genmath_stema_2026', 5, '10:00'::time, '11:30'::time, 'lecture')
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
  where lesson_plans.public_id in ('lp_rizal_genmath_stema_2026')
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
  where subjects.public_id in ('sub_rizal_genmath')
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
  'shs-genmath-' || plan_public_id || '-' || slot_sequence,
  'shs-genmath-' || plan_public_id || '-' || slot_sequence,
  case
    when slot_sequence % 12 = 0 then 'Midterm Exam: ' || subject_title
    when slot_sequence % 7 = 0 then 'Performance Task: ' || subject_title
    when slot_sequence % 5 = 0 then 'Quiz: ' || subject_title
    else lesson_title
  end,
  case
    when slot_sequence % 12 = 0 then 'Major periodic assessment with checking and feedback time.'
    when slot_sequence % 7 = 0 then 'Performance evidence aligned with the current unit.'
    when slot_sequence % 5 = 0 then 'Formative written work covering recent lessons.'
    else 'Class session tied to a library lesson.'
  end,
  case
    when slot_sequence % 12 = 0 then 'exam'
    when slot_sequence % 7 = 0 then 'performance_task'
    when slot_sequence % 5 = 0 then 'written_work'
    else 'lesson'
  end::public.session_category,
  case
    when slot_sequence % 12 = 0 then 'midterm'
    when slot_sequence % 7 = 0 then 'project'
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
    'seed_shs',
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
  where public_id in ('lp_rizal_genmath_stema_2026')
);

with plan_subjects as (
  select lesson_plan_id, subject_id
  from public.lesson_plans
  where public_id in ('lp_rizal_genmath_stema_2026')
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
  where public_id in ('lp_rizal_genmath_stema_2026')
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
  where lesson_plans.public_id in ('lp_rizal_genmath_stema_2026')
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
      'act_rizal_genmath_rational_quiz',
      'sub_rizal_genmath',
      2,
      'Rational Functions Long Quiz',
      'written_work',
      'quiz',
      'Quiz covering domain, intercepts, asymptotes, and rational equations.',
      '{"items":25,"duration_minutes":45,"item_mix":["multiple_choice","graph_reading","solving"]}'::jsonb,
      array['quiz','answer_key'],
      'Include at least two graph-reading items and one extraneous-solution check.',
      'Provide concise worked solutions for the answer key.',
      'A 25-item long quiz on rational functions, asking students to find asymptotes, sketch graphs, and solve rational equations while checking for extraneous roots.'
    ),
    (
      'act_rizal_els_subsystems_infographic',
      'sub_rizal_els',
      2,
      'Earth Subsystems Infographic',
      'performance_task',
      'project',
      'Project on how the four Earth subsystems interact and exchange energy and matter.',
      '{"group_size":3,"duration_minutes":80,"deliverables":["infographic","interaction diagram","short caption"]}'::jsonb,
      array['project_brief','rubric'],
      'Require one traced example showing at least three subsystems interacting.',
      'Include rubric criteria for accuracy, clarity, and visual design.',
      'Students design an infographic that maps the geosphere, hydrosphere, atmosphere, and biosphere and illustrates how energy and matter move between them.'
    ),
    (
      'act_rizal_oralcom_impromptu',
      'sub_rizal_oralcom',
      2,
      'Impromptu Speech Performance',
      'performance_task',
      'activity',
      'Speaking performance applying speech acts and effective delivery under time pressure.',
      '{"duration_minutes":2,"prep_minutes":1,"criteria":["content","organization","delivery"]}'::jsonb,
      array['prompt_bank','rubric','feedback_form'],
      'Draw prompts from real classroom and community situations.',
      'Include a rubric that scores content, organization, and nonverbal delivery.',
      'Each student draws a prompt, prepares briefly, and delivers a short impromptu speech that is scored on content, organization, and confident verbal and nonverbal delivery.'
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
join public.users on users.publicid = 'usr_grace_lim'
join public.schools on schools.public_id = 'sch_rizal_shs'
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
      'Senior High Research Congress',
      'School-wide congress where Grade 11 and 12 strands present their research and performance outputs.',
      '2026-08-14'::date,
      '2026-08-14'::date,
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
join public.schools on schools.public_id = 'sch_rizal_shs'
join public.users on users.publicid = 'usr_grace_lim'
where not exists (
  select 1
  from public.school_calendar_events existing
  where existing.school_id = schools.school_id
    and existing.title = event_seed.title
    and existing.start_date = event_seed.start_date
    and existing.end_date = event_seed.end_date
);

commit;
