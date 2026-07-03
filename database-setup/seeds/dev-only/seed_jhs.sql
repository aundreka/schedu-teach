-- =====================================================================
-- DEV-ONLY SEED — NEVER RUN IN PRODUCTION.
-- Creates a Junior High School (Grade 8) teacher persona with a known
-- password and rich, believable planning data.
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
--   username: jonathan.cruz
--   email:    jonathan.cruz@example.com
--   password: ScheduTest2026!
--
-- Run this after database-setup/00_users.sql through 12_*.sql.
-- The app's Library screen reads "books" from subjects assigned through user_subjects.

with seed_user(user_id, public_id, first_name, last_name, username, email, role_name) as (
  values (
    '22222222-2222-4222-8222-222222222222'::uuid,
    'usr_jonathan_cruz',
    'Jonathan',
    'Dela Cruz',
    'jonathan.cruz',
    'jonathan.cruz@example.com',
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

-- onboarded_at is added by 09_onboarding.sql; ensure it exists so the update below is safe.
alter table public.users
  add column if not exists onboarded_at timestamptz;

with seed_user(user_id, public_id, first_name, last_name, username, email, role_name) as (
  values (
    '22222222-2222-4222-8222-222222222222'::uuid,
    'usr_jonathan_cruz',
    'Jonathan',
    'Dela Cruz',
    'jonathan.cruz',
    'jonathan.cruz@example.com',
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
    select userid, 'free'::public.subscription_tier, 'active'::public.subscription_status
    from public.users
    where publicid = 'usr_jonathan_cruz'
    on conflict (user_id) do update
    set
      tier = excluded.tier,
      status = excluded.status,
      updated_at = now();
  end if;

  -- usage_quotas was keyed on period_month before 10_billing_v2.sql renamed it
  -- to period_day. This dev seed runs after the full schema (00 -> 12), so it
  -- targets period_day.
  if to_regclass('public.usage_quotas') is not null then
    insert into public.usage_quotas (user_id, period_day, ai_generations_used)
    select userid, current_date, 0
    from public.users
    where publicid = 'usr_jonathan_cruz'
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
    'sch_rizal_nhs',
    'Rizal National High School',
    'basic_ed',
    '#7C3AED',
    true,
    'usr_jonathan_cruz'
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
join public.schools on schools.public_id = 'sch_rizal_nhs'
where users.publicid = 'usr_jonathan_cruz'
on conflict (user_id, school_id) do update
set is_primary = excluded.is_primary;

with section_seed(public_id, grade_level, name, status_name) as (
  values
    ('sec_rizal_g8_newton', 'Grade 8', 'Grade 8 - Newton', 'published'),
    ('sec_rizal_g8_rizal', 'Grade 8', 'Grade 8 - Rizal', 'published')
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
join public.schools on schools.public_id = 'sch_rizal_nhs'
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
join public.schools on schools.public_id = 'sch_rizal_nhs'
join public.sections on sections.school_id = schools.school_id
where users.publicid = 'usr_jonathan_cruz'
  and sections.public_id in ('sec_rizal_g8_newton', 'sec_rizal_g8_rizal')
on conflict (user_id, section_id) do nothing;

with subject_seed(public_id, code, title, year_level, academic_year, unit_no, description, status_name) as (
  values
    (
      'sub_rizal_math8',
      'MATH8',
      'Mathematics 8',
      'Grade 8',
      '2026-2027',
      3,
      'A Grade 8 course on factoring, rational algebraic expressions, and linear equations, inequalities, and systems in two variables. Learners build fluency in algebraic reasoning and real-world modeling.',
      'published'
    ),
    (
      'sub_rizal_sci8',
      'SCI8',
      'Science 8',
      'Grade 8',
      '2026-2027',
      3,
      'A Grade 8 course spanning force and motion, Newton''s laws, work and energy, and the structure and function of the cell. Learners connect physical principles to everyday phenomena.',
      'published'
    ),
    (
      'sub_rizal_eng8',
      'ENG8',
      'English 8',
      'Grade 8',
      '2026-2027',
      3,
      'A Grade 8 course exploring Afro-Asian literature alongside grammar, verb moods, and persuasive writing. Learners strengthen comprehension, composition, and critical reading.',
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
join public.schools on schools.public_id = 'sch_rizal_nhs'
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
join public.subjects on subjects.public_id in ('sub_rizal_math8', 'sub_rizal_sci8', 'sub_rizal_eng8')
where users.publicid = 'usr_jonathan_cruz'
on conflict (user_id, subject_id) do nothing;

with unit_seed(subject_public_id, sequence_no, public_id, title, description) as (
  values
    ('sub_rizal_math8', 1, 'unt_rizal_math8_factoring', 'Factoring and Rational Expressions', 'Special products, factoring techniques, and operations on rational algebraic expressions.'),
    ('sub_rizal_math8', 2, 'unt_rizal_math8_linear', 'Linear Equations and Inequalities', 'The rectangular coordinate plane, linear equations, and linear inequalities in two variables.'),
    ('sub_rizal_math8', 3, 'unt_rizal_math8_systems', 'Systems of Linear Equations', 'Solving systems of linear equations graphically and algebraically to model real situations.'),
    ('sub_rizal_sci8', 1, 'unt_rizal_sci8_motion', 'Force and Motion', 'Describing motion, representing forces, and applying Newton''s three laws of motion.'),
    ('sub_rizal_sci8', 2, 'unt_rizal_sci8_energy', 'Work, Energy, and Power', 'Work done by a force, kinetic and potential energy, conservation of energy, and power.'),
    ('sub_rizal_sci8', 3, 'unt_rizal_sci8_cells', 'The Cell', 'Cell structure, function of organelles, and how cells sustain life processes.'),
    ('sub_rizal_eng8', 1, 'unt_rizal_eng8_literature', 'Afro-Asian Literature', 'Short stories, poems, and folk narratives from Africa and Asia and the cultures behind them.'),
    ('sub_rizal_eng8', 2, 'unt_rizal_eng8_grammar', 'Grammar and Verb Moods', 'Verb tenses, subject-verb agreement, and the indicative, imperative, and subjunctive moods.'),
    ('sub_rizal_eng8', 3, 'unt_rizal_eng8_writing', 'Persuasive Writing', 'Building claims, marshaling evidence, and composing coherent persuasive texts.')
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
    ('sub_rizal_math8', 1, 1, 'chp_rizal_math8_factoring', 'Special Products and Factoring', 'Recognizing patterns and factoring polynomial expressions.'),
    ('sub_rizal_math8', 1, 2, 'chp_rizal_math8_rational', 'Rational Algebraic Expressions', 'Simplifying and operating on rational algebraic expressions.'),
    ('sub_rizal_math8', 2, 3, 'chp_rizal_math8_linear', 'Linear Equations and Inequalities', 'Graphing and solving linear relations in two variables.'),
    ('sub_rizal_math8', 3, 4, 'chp_rizal_math8_systems', 'Solving Systems', 'Graphical and algebraic methods for systems of equations.'),
    ('sub_rizal_sci8', 1, 1, 'chp_rizal_sci8_newton', 'Newton''s Laws of Motion', 'Inertia, force and acceleration, and action-reaction pairs.'),
    ('sub_rizal_sci8', 2, 2, 'chp_rizal_sci8_energy', 'Work and Energy', 'Work, mechanical energy, and its conservation.'),
    ('sub_rizal_sci8', 3, 3, 'chp_rizal_sci8_cells', 'Cell Structure and Function', 'Organelles and the processes that keep cells alive.'),
    ('sub_rizal_eng8', 1, 1, 'chp_rizal_eng8_literature', 'Reading Afro-Asian Texts', 'Analyzing theme, culture, and craft in Afro-Asian selections.'),
    ('sub_rizal_eng8', 2, 2, 'chp_rizal_eng8_grammar', 'Verbs and Moods', 'Using verb tenses and moods accurately in writing and speech.'),
    ('sub_rizal_eng8', 3, 3, 'chp_rizal_eng8_writing', 'Crafting Persuasive Texts', 'Planning and drafting persuasive compositions.')
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
      'sub_rizal_math8',
      1,
      1,
      'les_rizal_math8_special_products',
      'Special Products of Polynomials',
      $html$<h2>Overview</h2><p>Students recognize the patterns behind squares of binomials, the product of a sum and difference, and the cube of a binomial. Fluent pattern use prepares learners to reverse the process when factoring.</p><h3>Lesson Flow</h3><ul><li>Warm-up: expand three products the long way, then look for shortcuts.</li><li>Discussion: derive the square-of-a-binomial and sum-and-difference patterns.</li><li>Guided practice: apply patterns to mixed expressions with area models.</li></ul><p>Exit ticket: explain how the middle term of a perfect square trinomial is formed.</p>$html$,
      'Identify special product patterns; expand squares of binomials and products of sums and differences; apply special products to model area.',
      50,
      3
    ),
    (
      'sub_rizal_math8',
      1,
      2,
      'les_rizal_math8_factoring',
      'Factoring Polynomials',
      $html$<h2>Overview</h2><p>Students factor polynomials using common monomial factors, difference of two squares, perfect square trinomials, and the general trinomial. Factoring is framed as reversing the special products from the previous lesson.</p><h3>Lesson Flow</h3><ul><li>Review: match expanded products to their factored forms.</li><li>Mini-lecture: choose a factoring technique from the structure of the expression.</li><li>Pair task: factor a set of expressions and justify each method.</li></ul><p>Exit ticket: factor one trinomial and check by multiplying.</p>$html$,
      'Factor polynomials using common monomial factors and special patterns; select an appropriate factoring technique; verify factors by multiplication.',
      55,
      4
    ),
    (
      'sub_rizal_math8',
      2,
      1,
      'les_rizal_math8_rational_simplify',
      'Simplifying Rational Algebraic Expressions',
      $html$<h2>Overview</h2><p>Students simplify rational algebraic expressions by factoring numerators and denominators and canceling common factors. The lesson connects fraction reasoning from earlier grades to algebraic form.</p><h3>Lesson Flow</h3><ul><li>Warm-up: reduce numeric fractions and name the common factor.</li><li>Guided work: factor and simplify rational expressions, noting restrictions on the variable.</li><li>Practice: identify values that make an expression undefined.</li></ul><p>Exit ticket: simplify one expression and state its excluded values.</p>$html$,
      'Simplify rational algebraic expressions; identify values that make an expression undefined; connect fraction reduction to algebraic simplification.',
      55,
      4
    ),
    (
      'sub_rizal_math8',
      2,
      2,
      'les_rizal_math8_rational_operations',
      'Operations on Rational Algebraic Expressions',
      $html$<h2>Overview</h2><p>Students add, subtract, multiply, and divide rational algebraic expressions, finding common denominators where needed. Emphasis is placed on factoring first and simplifying the final result.</p><h3>Lesson Flow</h3><ul><li>Review: recall multiplication and division of numeric fractions.</li><li>Guided work: multiply and divide rational expressions with factoring.</li><li>Practice: add and subtract expressions using a least common denominator.</li></ul><p>Exit ticket: combine two rational expressions into a single simplified fraction.</p>$html$,
      'Multiply and divide rational algebraic expressions; add and subtract expressions using a common denominator; simplify results fully.',
      55,
      4
    ),
    (
      'sub_rizal_math8',
      3,
      1,
      'les_rizal_math8_linear_equations',
      'Graphing Linear Equations in Two Variables',
      $html$<h2>Overview</h2><p>Students graph linear equations using intercepts and slope, and interpret slope as a rate of change. Real contexts such as savings over time make the relationship concrete.</p><h3>Lesson Flow</h3><ul><li>Warm-up: plot ordered pairs and describe the pattern.</li><li>Mini-lecture: find slope and intercepts from an equation.</li><li>Activity: graph three equations and compare their steepness and direction.</li></ul><p>Exit ticket: describe what the slope and y-intercept mean in a savings scenario.</p>$html$,
      'Graph linear equations using intercepts and slope; interpret slope as a rate of change; connect linear graphs to real-world situations.',
      55,
      4
    ),
    (
      'sub_rizal_math8',
      3,
      2,
      'les_rizal_math8_linear_inequalities',
      'Linear Inequalities in Two Variables',
      $html$<h2>Overview</h2><p>Students graph linear inequalities in two variables, distinguishing solid and dashed boundary lines and shading the correct half-plane. The lesson emphasizes testing a point to confirm the solution region.</p><h3>Lesson Flow</h3><ul><li>Review: recall graphing linear equations as boundary lines.</li><li>Guided work: decide between solid and dashed lines and choose a test point.</li><li>Practice: graph inequalities that model budget and time constraints.</li></ul><p>Exit ticket: explain how a test point determines which region to shade.</p>$html$,
      'Graph linear inequalities in two variables; determine the correct half-plane using a test point; model constraints with inequalities.',
      55,
      4
    ),
    (
      'sub_rizal_math8',
      4,
      1,
      'les_rizal_math8_systems_graphing',
      'Solving Systems by Graphing',
      $html$<h2>Overview</h2><p>Students solve systems of linear equations by graphing and classify systems as having one solution, no solution, or infinitely many solutions.</p><h3>Lesson Flow</h3><ul><li>Warm-up: graph two lines and locate their intersection.</li><li>Discussion: relate intersecting, parallel, and coincident lines to solution types.</li><li>Activity: solve three systems graphically and verify by substitution.</li></ul><p>Exit ticket: explain how a graph reveals whether a system has no solution.</p>$html$,
      'Solve systems of linear equations by graphing; classify systems by their number of solutions; verify solutions by substitution.',
      55,
      4
    ),
    (
      'sub_rizal_math8',
      4,
      2,
      'les_rizal_math8_systems_algebraic',
      'Solving Systems by Substitution and Elimination',
      $html$<h2>Overview</h2><p>Students solve systems of linear equations using substitution and elimination, choosing the more efficient method for a given system. Word problems connect the methods to real decisions.</p><h3>Lesson Flow</h3><ul><li>Review: recall solving a single linear equation.</li><li>Guided work: solve systems by substitution, then by elimination.</li><li>Application: translate a word problem into a system and solve it.</li></ul><p>Exit ticket: choose the better method for a given system and justify the choice.</p>$html$,
      'Solve systems by substitution and elimination; choose an efficient method; model and solve word problems using systems.',
      60,
      5
    ),
    (
      'sub_rizal_sci8',
      1,
      1,
      'les_rizal_sci8_first_law',
      'Newton''s First Law and Inertia',
      $html$<h2>Overview</h2><p>Students investigate inertia through everyday examples such as a passenger lurching when a jeepney stops. They describe how balanced forces keep an object at rest or in uniform motion.</p><h3>Lesson Flow</h3><ul><li>Demonstration: pull a sheet from under a stack of coins and discuss why they stay.</li><li>Discussion: define inertia and relate it to mass.</li><li>Activity: predict and observe motion when forces are balanced.</li></ul><p>Exit ticket: explain why seatbelts protect passengers in terms of inertia.</p>$html$,
      'State Newton''s first law; describe inertia and its relation to mass; explain everyday motion using balanced forces.',
      55,
      3
    ),
    (
      'sub_rizal_sci8',
      1,
      2,
      'les_rizal_sci8_second_third_law',
      'Newton''s Second and Third Laws',
      $html$<h2>Overview</h2><p>Students relate net force, mass, and acceleration through F = ma, then examine action-reaction pairs. Cart-and-mass investigations make the relationships measurable.</p><h3>Lesson Flow</h3><ul><li>Investigation: change the force on a cart and observe acceleration.</li><li>Discussion: derive the F = ma relationship from the data.</li><li>Activity: identify action-reaction pairs in walking, swimming, and rockets.</li></ul><p>Exit ticket: explain why a balloon moves forward as air rushes backward.</p>$html$,
      'Apply the relationship among force, mass, and acceleration; identify action-reaction pairs; use Newton''s laws to explain motion.',
      55,
      4
    ),
    (
      'sub_rizal_sci8',
      2,
      1,
      'les_rizal_sci8_work',
      'Work Done by a Force',
      $html$<h2>Overview</h2><p>Students define work in the scientific sense, calculate work using force and displacement, and distinguish situations where no work is done despite effort.</p><h3>Lesson Flow</h3><ul><li>Warm-up: sort scenarios into work and no-work cases.</li><li>Mini-lecture: compute work for forces along the direction of motion.</li><li>Practice: solve problems involving pushing, lifting, and carrying.</li></ul><p>Exit ticket: explain why holding a heavy bag still does no scientific work.</p>$html$,
      'Define work scientifically; calculate work from force and displacement; distinguish cases where no work is done.',
      50,
      3
    ),
    (
      'sub_rizal_sci8',
      2,
      2,
      'les_rizal_sci8_energy',
      'Kinetic and Potential Energy',
      $html$<h2>Overview</h2><p>Students describe kinetic and gravitational potential energy, compute each from given quantities, and trace energy transformations along a track or pendulum.</p><h3>Lesson Flow</h3><ul><li>Demonstration: release a pendulum and describe the energy changes.</li><li>Guided work: calculate kinetic and potential energy for simple cases.</li><li>Discussion: connect the transformations to conservation of energy.</li></ul><p>Exit ticket: describe where energy is greatest along a swinging pendulum.</p>$html$,
      'Describe kinetic and potential energy; calculate each from given data; trace energy transformations and relate them to conservation.',
      55,
      4
    ),
    (
      'sub_rizal_sci8',
      3,
      1,
      'les_rizal_sci8_cell_structure',
      'Structure of the Cell',
      $html$<h2>Overview</h2><p>Students examine the parts of plant and animal cells and compare their structures using labeled diagrams and prepared slides.</p><h3>Lesson Flow</h3><ul><li>Observation: view onion and cheek cells under a microscope.</li><li>Discussion: label the cell membrane, nucleus, cytoplasm, and other parts.</li><li>Activity: build a two-column comparison of plant and animal cells.</li></ul><p>Exit ticket: name two structures found only in plant cells.</p>$html$,
      'Identify parts of plant and animal cells; compare plant and animal cell structures; use a microscope to observe cells safely.',
      55,
      3
    ),
    (
      'sub_rizal_sci8',
      3,
      2,
      'les_rizal_sci8_cell_function',
      'Function of Cell Organelles',
      $html$<h2>Overview</h2><p>Students connect each organelle to its role in keeping the cell alive, using the analogy of a working community to organize the functions.</p><h3>Lesson Flow</h3><ul><li>Warm-up: match organelles to short function clues.</li><li>Mini-lecture: describe the jobs of the nucleus, mitochondria, and chloroplasts.</li><li>Activity: create an analogy that maps organelles to parts of a city.</li></ul><p>Exit ticket: explain how mitochondria and chloroplasts support the cell differently.</p>$html$,
      'Relate organelles to their functions; explain how organelles keep a cell alive; represent cell functions through an analogy.',
      55,
      4
    ),
    (
      'sub_rizal_eng8',
      1,
      1,
      'les_rizal_eng8_short_story',
      'Reading an Afro-Asian Short Story',
      $html$<h2>Overview</h2><p>Students read a short story from Asian literature, analyze how setting and culture shape character choices, and identify the theme. Close reading builds inference skills.</p><h3>Lesson Flow</h3><ul><li>Pre-reading: activate background on the story''s cultural setting.</li><li>Reading: annotate for conflict, character, and turning points.</li><li>Discussion: state the theme and support it with textual evidence.</li></ul><p>Exit ticket: write one sentence naming the theme and one line of evidence.</p>$html$,
      'Analyze how setting and culture shape a story; identify theme; support interpretations with textual evidence.',
      55,
      3
    ),
    (
      'sub_rizal_eng8',
      1,
      2,
      'les_rizal_eng8_poetry',
      'Exploring Afro-Asian Poetry',
      $html$<h2>Overview</h2><p>Students read poems from African and Asian traditions and examine imagery, figurative language, and tone. Oral reading highlights rhythm and mood.</p><h3>Lesson Flow</h3><ul><li>Warm-up: describe the feeling created by a short image.</li><li>Reading: identify metaphors, similes, and imagery in two poems.</li><li>Activity: read a stanza aloud and explain how sound supports meaning.</li></ul><p>Exit ticket: quote one image and explain the mood it creates.</p>$html$,
      'Identify imagery and figurative language in poetry; analyze how sound supports meaning; interpret tone in Afro-Asian poems.',
      50,
      3
    ),
    (
      'sub_rizal_eng8',
      2,
      1,
      'les_rizal_eng8_verb_tenses',
      'Verb Tenses and Agreement',
      $html$<h2>Overview</h2><p>Students use consistent verb tenses and apply subject-verb agreement, including tricky cases with intervening phrases and indefinite pronouns.</p><h3>Lesson Flow</h3><ul><li>Warm-up: correct sentences with shifting tenses.</li><li>Mini-lecture: review agreement rules with singular and plural subjects.</li><li>Practice: edit a paragraph for tense consistency and agreement.</li></ul><p>Exit ticket: rewrite two sentences to fix agreement errors.</p>$html$,
      'Maintain consistent verb tenses; apply subject-verb agreement rules; edit writing for grammatical accuracy.',
      50,
      3
    ),
    (
      'sub_rizal_eng8',
      2,
      2,
      'les_rizal_eng8_verb_moods',
      'The Moods of the Verb',
      $html$<h2>Overview</h2><p>Students distinguish the indicative, imperative, and subjunctive moods and use each appropriately to state facts, give commands, and express wishes or conditions.</p><h3>Lesson Flow</h3><ul><li>Warm-up: sort sentences by the purpose they serve.</li><li>Mini-lecture: define each mood with clear examples.</li><li>Practice: convert sentences from one mood to another.</li></ul><p>Exit ticket: write one subjunctive sentence expressing a wish.</p>$html$,
      'Distinguish the indicative, imperative, and subjunctive moods; use each mood appropriately; transform sentences across moods.',
      55,
      4
    ),
    (
      'sub_rizal_eng8',
      3,
      1,
      'les_rizal_eng8_claims',
      'Building Claims and Evidence',
      $html$<h2>Overview</h2><p>Students craft arguable claims and support them with relevant evidence and reasoning. They learn to anticipate a counterclaim and respond to it.</p><h3>Lesson Flow</h3><ul><li>Warm-up: judge whether statements are facts or arguable claims.</li><li>Mini-lecture: structure a claim with evidence and a warrant.</li><li>Activity: draft a claim on a school issue and list supporting evidence.</li></ul><p>Exit ticket: write a claim and one piece of evidence that supports it.</p>$html$,
      'Formulate arguable claims; support claims with evidence and reasoning; anticipate and address a counterclaim.',
      55,
      4
    ),
    (
      'sub_rizal_eng8',
      3,
      2,
      'les_rizal_eng8_persuasive_essay',
      'Composing a Persuasive Essay',
      $html$<h2>Overview</h2><p>Students plan and draft a persuasive essay with a clear thesis, organized body paragraphs, and a persuasive conclusion. Peer feedback guides revision.</p><h3>Lesson Flow</h3><ul><li>Planning: outline a thesis and three supporting reasons.</li><li>Drafting: develop body paragraphs with evidence and transitions.</li><li>Revision: exchange drafts and give feedback using a checklist.</li></ul><p>Exit ticket: write a thesis statement and one topic sentence for the essay.</p>$html$,
      'Plan a persuasive essay with a clear thesis; organize body paragraphs with evidence; revise writing using peer feedback.',
      60,
      4
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
      'lp_rizal_math8_newton_2026',
      'sub_rizal_math8',
      'sec_rizal_g8_newton',
      'Mathematics 8 Quarterly Plan - Grade 8 Newton',
      'quarter',
      '2026-2027',
      '2026-06-09'::date,
      '2026-08-29'::date,
      'First-quarter plan covering factoring, rational expressions, linear relations, and systems of equations.'
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
join public.users on users.publicid = 'usr_jonathan_cruz'
join public.schools on schools.public_id = 'sch_rizal_nhs'
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
    ('lp_rizal_math8_newton_2026', 1, '07:30'::time, '08:30'::time, 'lecture'),
    ('lp_rizal_math8_newton_2026', 2, '07:30'::time, '08:30'::time, 'lecture'),
    ('lp_rizal_math8_newton_2026', 3, '13:00'::time, '15:00'::time, 'laboratory'),
    ('lp_rizal_math8_newton_2026', 4, '07:30'::time, '08:30'::time, 'lecture')
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
  where lesson_plans.public_id in ('lp_rizal_math8_newton_2026')
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
  where subjects.public_id in ('sub_rizal_math8')
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
  'jhs-' || plan_public_id || '-' || slot_sequence,
  'jhs-' || plan_public_id || '-' || slot_sequence,
  case
    when slot_sequence % 12 = 0 then 'Quarterly Exam: ' || subject_title
    when slot_sequence % 7 = 0 then 'Performance Task: ' || subject_title
    when slot_sequence % 5 = 0 then 'Quiz: ' || subject_title
    else lesson_title
  end,
  case
    when slot_sequence % 12 = 0 then 'Major assessment for the quarter with checking and feedback time.'
    when slot_sequence % 7 = 0 then 'Hands-on performance evidence aligned with the current unit.'
    when slot_sequence % 5 = 0 then 'Short formative written work covering recent lessons.'
    else 'Lesson session tied to a library lesson for this subject.'
  end,
  case
    when slot_sequence % 12 = 0 then 'exam'
    when slot_sequence % 7 = 0 then 'performance_task'
    when slot_sequence % 5 = 0 then 'written_work'
    else 'lesson'
  end::public.session_category,
  case
    when slot_sequence % 12 = 0 then 'prelim'
    when slot_sequence % 7 = 0 then
      case when meeting_type = 'laboratory' then 'lab_report' else 'project' end
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
    'seed_jhs',
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
  where public_id in ('lp_rizal_math8_newton_2026')
);

with plan_subjects as (
  select lesson_plan_id, subject_id
  from public.lesson_plans
  where public_id in ('lp_rizal_math8_newton_2026')
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
  where public_id in ('lp_rizal_math8_newton_2026')
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
  where lesson_plans.public_id in ('lp_rizal_math8_newton_2026')
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
      'act_rizal_math8_linear_quiz',
      'sub_rizal_math8',
      3,
      'Solving Linear Equations Quiz',
      'written_work',
      'quiz',
      'Quiz covering graphing linear equations and inequalities in two variables.',
      '{"items":15,"duration_minutes":30,"item_mix":["multiple_choice","graphing","short_response"]}'::jsonb,
      array['quiz','answer_key'],
      'Include at least three graphing items and one real-world slope interpretation.',
      'Generate concise worked solutions for the answer key.',
      'A fifteen-item quiz asking learners to graph linear equations, shade inequality regions, and interpret slope in a savings context.'
    ),
    (
      'act_rizal_sci8_lab_report',
      'sub_rizal_sci8',
      1,
      'Newton''s Laws Lab Report',
      'performance_task',
      'lab_report',
      'Performance task documenting an investigation of Newton''s laws using a cart and added masses.',
      '{"group_size":4,"duration_minutes":90,"deliverables":["data table","analysis","conclusion"]}'::jsonb,
      array['task_brief','rubric','data_sheet'],
      'Require a labeled data table relating force, mass, and acceleration.',
      'Include scoring criteria for accuracy, analysis, and clarity of conclusions.',
      'A guided lab report in which groups measure a cart''s acceleration under varied forces and explain their results using Newton''s laws.'
    ),
    (
      'act_rizal_eng8_persuasive_essay',
      'sub_rizal_eng8',
      3,
      'Persuasive Essay Assignment',
      'written_work',
      'assignment',
      'Assignment covering claims, evidence, and the structure of a persuasive essay.',
      '{"word_target":450,"paragraphs":5,"deliverables":["outline","draft","final essay"]}'::jsonb,
      array['assignment_sheet','rubric'],
      'Use a relevant school or community issue as the essay prompt.',
      'Require a clear thesis, supporting evidence, and a response to one counterclaim.',
      'A five-paragraph persuasive essay on a community issue, with a clear thesis, evidence-backed body paragraphs, and a rebuttal to a counterclaim.'
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
join public.users on users.publicid = 'usr_jonathan_cruz'
join public.schools on schools.public_id = 'sch_rizal_nhs'
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
      'District Science Fair',
      'District-wide science fair where Grade 8 learners present investigatory projects.',
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
join public.schools on schools.public_id = 'sch_rizal_nhs'
join public.users on users.publicid = 'usr_jonathan_cruz'
where not exists (
  select 1
  from public.school_calendar_events existing
  where existing.school_id = schools.school_id
    and existing.title = event_seed.title
    and existing.start_date = event_seed.start_date
    and existing.end_date = event_seed.end_date
);

commit;
