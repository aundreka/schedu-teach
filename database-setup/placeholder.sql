begin;

create extension if not exists pgcrypto;

with seed_users(user_id, public_id, first_name, last_name, username, email, role_name) as (
  values
    ('8f0c3425-53c5-4c26-a34a-0f937f0d8f21'::uuid, 'usr_mariana_villanueva', 'Mariana', 'Villanueva', 'mariana.villanueva', 'mariana.villanueva@northfield.edu.ph', 'teacher'),
    ('b5278ce0-13cb-4034-a34f-2b9c3fdd7d38'::uuid, 'usr_gabriel_santos', 'Gabriel', 'Santos', 'gabriel.santos', 'gabriel.santos@northfield.edu.ph', 'teacher'),
    ('c96fdc23-6047-4a10-9c42-b6fdf0aab940'::uuid, 'usr_celeste_navarro', 'Celeste', 'Navarro', 'celeste.navarro', 'celeste.navarro@harborview.edu.ph', 'teacher'),
    ('0cb40a75-dca2-4fd1-8cda-51614a5bd188'::uuid, 'usr_rafael_delacruz', 'Rafael', 'Dela Cruz', 'rafael.delacruz', 'rafael.delacruz@harborview.edu.ph', 'admin'),
    ('bcf03eb3-7184-403b-941a-b2d41f91ae9e'::uuid, 'usr_inez_mercado', 'Inez', 'Mercado', 'inez.mercado', 'inez.mercado@mabini.edu.ph', 'teacher'),
    ('77b8955f-578e-4053-80e5-b5e8997a6e98'::uuid, 'usr_elisa_bautista', 'Elisa', 'Bautista', 'elisa.bautista', 'elisa.bautista@mabini.edu.ph', 'teacher')
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
  crypt('ScheduDemo2026!', gen_salt('bf')),
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
from seed_users
on conflict (id) do update
set
  email = excluded.email,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

with seed_users(user_id, public_id, first_name, last_name, username, email, role_name) as (
  values
    ('8f0c3425-53c5-4c26-a34a-0f937f0d8f21'::uuid, 'usr_mariana_villanueva', 'Mariana', 'Villanueva', 'mariana.villanueva', 'mariana.villanueva@northfield.edu.ph', 'teacher'),
    ('b5278ce0-13cb-4034-a34f-2b9c3fdd7d38'::uuid, 'usr_gabriel_santos', 'Gabriel', 'Santos', 'gabriel.santos', 'gabriel.santos@northfield.edu.ph', 'teacher'),
    ('c96fdc23-6047-4a10-9c42-b6fdf0aab940'::uuid, 'usr_celeste_navarro', 'Celeste', 'Navarro', 'celeste.navarro', 'celeste.navarro@harborview.edu.ph', 'teacher'),
    ('0cb40a75-dca2-4fd1-8cda-51614a5bd188'::uuid, 'usr_rafael_delacruz', 'Rafael', 'Dela Cruz', 'rafael.delacruz', 'rafael.delacruz@harborview.edu.ph', 'admin'),
    ('bcf03eb3-7184-403b-941a-b2d41f91ae9e'::uuid, 'usr_inez_mercado', 'Inez', 'Mercado', 'inez.mercado', 'inez.mercado@mabini.edu.ph', 'teacher'),
    ('77b8955f-578e-4053-80e5-b5e8997a6e98'::uuid, 'usr_elisa_bautista', 'Elisa', 'Bautista', 'elisa.bautista', 'elisa.bautista@mabini.edu.ph', 'teacher')
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
from seed_users
on conflict (userid) do update
set
  publicid = excluded.publicid,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  username = excluded.username,
  email = excluded.email,
  role = excluded.role,
  updated_at = now();

with school_seed(public_id, name, type_name, avatar_color, is_default, created_by_public_id) as (
  values
    ('sch_northfield', 'Northfield Integrated School', 'basic_ed', '#2563EB', true, 'usr_mariana_villanueva'),
    ('sch_harborview', 'Harborview Science High School', 'basic_ed', '#0F766E', false, 'usr_rafael_delacruz'),
    ('sch_mabini_college', 'Mabini Community College', 'university', '#7C3AED', false, 'usr_inez_mercado')
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

with membership_seed(user_public_id, school_public_id, is_primary) as (
  values
    ('usr_mariana_villanueva', 'sch_northfield', true),
    ('usr_gabriel_santos', 'sch_northfield', true),
    ('usr_celeste_navarro', 'sch_harborview', true),
    ('usr_rafael_delacruz', 'sch_harborview', true),
    ('usr_inez_mercado', 'sch_mabini_college', true),
    ('usr_elisa_bautista', 'sch_mabini_college', true),
    ('usr_mariana_villanueva', 'sch_harborview', false),
    ('usr_rafael_delacruz', 'sch_northfield', false)
)
insert into public.user_schools (
  user_id,
  school_id,
  is_primary
)
select
  users.userid,
  schools.school_id,
  membership_seed.is_primary
from membership_seed
join public.users on users.publicid = membership_seed.user_public_id
join public.schools on schools.public_id = membership_seed.school_public_id
on conflict (user_id, school_id) do update
set is_primary = excluded.is_primary;

with section_seed(public_id, school_public_id, grade_level, name, status_name) as (
  values
    ('sec_northfield_7_rizal', 'sch_northfield', 'Grade 7', 'Rizal', 'published'),
    ('sec_northfield_7_bonifacio', 'sch_northfield', 'Grade 7', 'Bonifacio', 'published'),
    ('sec_northfield_8_luna', 'sch_northfield', 'Grade 8', 'Luna', 'published'),
    ('sec_northfield_8_mabini', 'sch_northfield', 'Grade 8', 'Mabini', 'published'),
    ('sec_northfield_9_silang', 'sch_northfield', 'Grade 9', 'Silang', 'published'),
    ('sec_harborview_9_curie', 'sch_harborview', 'Grade 9', 'Curie', 'published'),
    ('sec_harborview_10_einstein', 'sch_harborview', 'Grade 10', 'Einstein', 'published'),
    ('sec_harborview_10_noether', 'sch_harborview', 'Grade 10', 'Noether', 'published'),
    ('sec_harborview_11_faraday', 'sch_harborview', 'Grade 11 STEM', 'Faraday', 'published'),
    ('sec_harborview_12_tesla', 'sch_harborview', 'Grade 12 STEM', 'Tesla', 'published'),
    ('sec_mabini_bsited_1a', 'sch_mabini_college', '1st Year', 'BSIT-1A', 'published'),
    ('sec_mabini_bsited_2a', 'sch_mabini_college', '2nd Year', 'BSIT-2A', 'published'),
    ('sec_mabini_bsed_3b', 'sch_mabini_college', '3rd Year', 'BSED-3B', 'published'),
    ('sec_mabini_beed_4a', 'sch_mabini_college', '4th Year', 'BEED-4A', 'published')
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
join public.schools on schools.public_id = section_seed.school_public_id
on conflict (public_id) do update
set
  school_id = excluded.school_id,
  grade_level = excluded.grade_level,
  name = excluded.name,
  status = excluded.status,
  updated_at = now();

with section_teacher_seed(user_public_id, section_public_id) as (
  values
    ('usr_mariana_villanueva', 'sec_northfield_7_rizal'),
    ('usr_mariana_villanueva', 'sec_northfield_7_bonifacio'),
    ('usr_gabriel_santos', 'sec_northfield_8_luna'),
    ('usr_gabriel_santos', 'sec_northfield_8_mabini'),
    ('usr_gabriel_santos', 'sec_northfield_9_silang'),
    ('usr_celeste_navarro', 'sec_harborview_9_curie'),
    ('usr_celeste_navarro', 'sec_harborview_11_faraday'),
    ('usr_rafael_delacruz', 'sec_harborview_10_einstein'),
    ('usr_rafael_delacruz', 'sec_harborview_10_noether'),
    ('usr_rafael_delacruz', 'sec_harborview_12_tesla'),
    ('usr_inez_mercado', 'sec_mabini_bsited_1a'),
    ('usr_inez_mercado', 'sec_mabini_bsited_2a'),
    ('usr_elisa_bautista', 'sec_mabini_bsed_3b'),
    ('usr_elisa_bautista', 'sec_mabini_beed_4a')
)
insert into public.user_sections (
  user_id,
  section_id
)
select
  users.userid,
  sections.section_id
from section_teacher_seed
join public.users on users.publicid = section_teacher_seed.user_public_id
join public.sections on sections.public_id = section_teacher_seed.section_public_id
on conflict (user_id, section_id) do nothing;

with subject_seed(public_id, school_public_id, teacher_public_id, code, title, year_level, academic_year, unit_no, description, status_name) as (
  values
    ('sub_science_7', 'sch_northfield', 'usr_mariana_villanueva', 'SCI7', 'Integrated Science 7', 'Grade 7', '2026-2027', 4, 'Matter, energy, Earth systems, and scientific inquiry for junior high learners.', 'published'),
    ('sub_math_7', 'sch_northfield', 'usr_mariana_villanueva', 'MATH7', 'Mathematics 7', 'Grade 7', '2026-2027', 4, 'Number sense, algebraic thinking, geometry, and data handling.', 'published'),
    ('sub_english_8', 'sch_northfield', 'usr_gabriel_santos', 'ENG8', 'English 8: Language and Literature', 'Grade 8', '2026-2027', 4, 'Reading, writing, speaking, viewing, and literary appreciation.', 'published'),
    ('sub_ict_9', 'sch_northfield', 'usr_gabriel_santos', 'ICT9', 'Computer Systems Servicing', 'Grade 9', '2026-2027', 4, 'Foundational ICT services, hardware maintenance, networking, and digital safety.', 'published'),
    ('sub_chem_9', 'sch_harborview', 'usr_celeste_navarro', 'CHEM9', 'Chemistry Fundamentals', 'Grade 9', '2026-2027', 4, 'Atomic structure, bonding, reactions, and laboratory practice.', 'published'),
    ('sub_biology_11', 'sch_harborview', 'usr_celeste_navarro', 'BIO11', 'General Biology 1', 'Grade 11 STEM', '2026-2027', 4, 'Cells, genetics, evolution, and organismal biology.', 'published'),
    ('sub_physics_12', 'sch_harborview', 'usr_rafael_delacruz', 'PHY12', 'General Physics 2', 'Grade 12 STEM', '2026-2027', 4, 'Electricity, magnetism, optics, and modern physics applications.', 'published'),
    ('sub_calculus_11', 'sch_harborview', 'usr_rafael_delacruz', 'CALC11', 'Basic Calculus', 'Grade 11 STEM', '2026-2027', 4, 'Limits, derivatives, integrals, and mathematical modeling.', 'published'),
    ('sub_it101', 'sch_mabini_college', 'usr_inez_mercado', 'IT101', 'Introduction to Computing', '1st Year', '2026-2027', 5, 'Computing concepts, productivity tools, web fundamentals, and responsible technology use.', 'published'),
    ('sub_ds201', 'sch_mabini_college', 'usr_inez_mercado', 'DS201', 'Data Structures and Algorithms', '2nd Year', '2026-2027', 5, 'Arrays, linked structures, trees, graphs, searching, sorting, and algorithm analysis.', 'published'),
    ('sub_res301', 'sch_mabini_college', 'usr_elisa_bautista', 'RES301', 'Research Methods in Education', '3rd Year', '2026-2027', 5, 'Research design, data gathering, analysis, ethics, and academic reporting.', 'published'),
    ('sub_profed401', 'sch_mabini_college', 'usr_elisa_bautista', 'PROFED401', 'Assessment of Learning', '4th Year', '2026-2027', 5, 'Assessment principles, rubric design, item analysis, and learner feedback.', 'published')
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
join public.schools on schools.public_id = subject_seed.school_public_id
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

with subject_teacher_seed(user_public_id, subject_public_id) as (
  values
    ('usr_mariana_villanueva', 'sub_science_7'),
    ('usr_mariana_villanueva', 'sub_math_7'),
    ('usr_gabriel_santos', 'sub_english_8'),
    ('usr_gabriel_santos', 'sub_ict_9'),
    ('usr_celeste_navarro', 'sub_chem_9'),
    ('usr_celeste_navarro', 'sub_biology_11'),
    ('usr_rafael_delacruz', 'sub_physics_12'),
    ('usr_rafael_delacruz', 'sub_calculus_11'),
    ('usr_inez_mercado', 'sub_it101'),
    ('usr_inez_mercado', 'sub_ds201'),
    ('usr_elisa_bautista', 'sub_res301'),
    ('usr_elisa_bautista', 'sub_profed401')
)
insert into public.user_subjects (
  user_id,
  subject_id
)
select
  users.userid,
  subjects.subject_id
from subject_teacher_seed
join public.users on users.publicid = subject_teacher_seed.user_public_id
join public.subjects on subjects.public_id = subject_teacher_seed.subject_public_id
on conflict (user_id, subject_id) do nothing;

with unit_seed(subject_public_id, sequence_no, title, description) as (
  values
    ('sub_science_7', 1, 'Scientific Inquiry and Measurement', 'Observation, measurement, variables, evidence, and classroom laboratory routines.'),
    ('sub_science_7', 2, 'Matter and Its Interactions', 'Properties of matter, changes, mixtures, solutions, and particle models.'),
    ('sub_science_7', 3, 'Earth Systems and Weather', 'Atmosphere, weather patterns, climate factors, and community preparedness.'),
    ('sub_science_7', 4, 'Energy in Everyday Systems', 'Heat, light, sound, electricity, and conservation in practical settings.'),
    ('sub_math_7', 1, 'Integers and Rational Numbers', 'Operations, number lines, absolute value, and real-world problems.'),
    ('sub_math_7', 2, 'Algebraic Expressions and Equations', 'Patterns, variables, expressions, equations, and inequalities.'),
    ('sub_math_7', 3, 'Geometry and Measurement', 'Angles, polygons, area, surface area, and volume.'),
    ('sub_math_7', 4, 'Data, Probability, and Statistics', 'Data collection, displays, measures of center, and probability models.'),
    ('sub_english_8', 1, 'Reading Strategies and Text Evidence', 'Close reading, inference, context clues, and citation of evidence.'),
    ('sub_english_8', 2, 'Philippine Literature and Identity', 'Short stories, poems, essays, and cultural context.'),
    ('sub_english_8', 3, 'Argument Writing and Speaking', 'Claims, reasons, evidence, organization, and oral delivery.'),
    ('sub_english_8', 4, 'Media Literacy and Multimodal Texts', 'Visual grammar, source credibility, digital citizenship, and presentation design.'),
    ('sub_ict_9', 1, 'Computer Hardware Fundamentals', 'Parts, specifications, handling procedures, and preventive maintenance.'),
    ('sub_ict_9', 2, 'Operating Systems and Productivity', 'File systems, utilities, productivity suites, and workflow organization.'),
    ('sub_ict_9', 3, 'Networking Basics', 'Network types, addressing, cabling, wireless setup, and troubleshooting.'),
    ('sub_ict_9', 4, 'Digital Safety and Service Documentation', 'Security habits, responsible use, service records, and client communication.'),
    ('sub_chem_9', 1, 'Atomic Structure and Periodicity', 'Subatomic particles, isotopes, electron arrangement, and periodic trends.'),
    ('sub_chem_9', 2, 'Chemical Bonding and Compounds', 'Ionic and covalent bonding, formulas, naming, and molecular models.'),
    ('sub_chem_9', 3, 'Chemical Reactions', 'Evidence of reactions, balancing equations, stoichiometry, and energy changes.'),
    ('sub_chem_9', 4, 'Solutions and Everyday Chemistry', 'Concentration, acidity, household chemicals, and laboratory safety.'),
    ('sub_biology_11', 1, 'Cell Structure and Function', 'Cell theory, organelles, membranes, transport, and microscopy.'),
    ('sub_biology_11', 2, 'Genetics and Heredity', 'DNA, chromosomes, inheritance patterns, and genetic variation.'),
    ('sub_biology_11', 3, 'Evolution and Biodiversity', 'Natural selection, classification, adaptation, and conservation.'),
    ('sub_biology_11', 4, 'Plant and Animal Systems', 'Organ systems, homeostasis, reproduction, and ecological relationships.'),
    ('sub_physics_12', 1, 'Electric Fields and Circuits', 'Charge, electric fields, potential, current, resistance, and circuit analysis.'),
    ('sub_physics_12', 2, 'Magnetism and Electromagnetic Induction', 'Magnetic fields, forces, motors, generators, and Faraday law.'),
    ('sub_physics_12', 3, 'Waves, Light, and Optics', 'Wave behavior, reflection, refraction, lenses, and optical instruments.'),
    ('sub_physics_12', 4, 'Modern Physics Applications', 'Quantum ideas, nuclear processes, semiconductors, and technology connections.'),
    ('sub_calculus_11', 1, 'Limits and Continuity', 'Limit laws, one-sided limits, continuity, and graphical interpretation.'),
    ('sub_calculus_11', 2, 'Derivatives and Rates of Change', 'Derivative rules, tangent lines, optimization, and related rates.'),
    ('sub_calculus_11', 3, 'Integral Concepts', 'Antiderivatives, area under curves, accumulation, and basic integration.'),
    ('sub_calculus_11', 4, 'Modeling with Calculus', 'Motion, growth, decay, approximation, and applied problem solving.'),
    ('sub_it101', 1, 'Computing Foundations', 'Computer systems, data representation, software categories, and careers.'),
    ('sub_it101', 2, 'Productivity and Collaboration Tools', 'Documents, spreadsheets, presentations, cloud workflows, and version habits.'),
    ('sub_it101', 3, 'Web and Internet Fundamentals', 'Internet services, HTML basics, accessibility, and digital publishing.'),
    ('sub_it101', 4, 'Programming Logic', 'Algorithms, flowcharts, variables, control structures, and debugging routines.'),
    ('sub_it101', 5, 'Responsible Technology Practice', 'Privacy, security, intellectual property, and inclusive technology use.'),
    ('sub_ds201', 1, 'Algorithm Analysis and Arrays', 'Complexity, arrays, strings, recursion, searching, and sorting.'),
    ('sub_ds201', 2, 'Linked Structures', 'Linked lists, stacks, queues, and implementation tradeoffs.'),
    ('sub_ds201', 3, 'Trees and Hashing', 'Trees, binary search trees, heaps, hash tables, and traversal.'),
    ('sub_ds201', 4, 'Graphs and Traversal', 'Graph representation, breadth-first search, depth-first search, and pathfinding.'),
    ('sub_ds201', 5, 'Algorithmic Problem Solving', 'Design patterns, greedy methods, dynamic programming, and code review.'),
    ('sub_res301', 1, 'Foundations of Educational Research', 'Research problems, literature review, variables, and conceptual frameworks.'),
    ('sub_res301', 2, 'Research Design and Ethics', 'Qualitative, quantitative, mixed methods, sampling, consent, and integrity.'),
    ('sub_res301', 3, 'Data Collection Instruments', 'Surveys, interviews, rubrics, observations, validity, and reliability.'),
    ('sub_res301', 4, 'Analysis and Interpretation', 'Descriptive analysis, coding, tables, findings, and limitations.'),
    ('sub_res301', 5, 'Writing and Presenting Research', 'Manuscript structure, citations, defense slides, and peer feedback.'),
    ('sub_profed401', 1, 'Principles of Assessment', 'Assessment purposes, alignment, fairness, and evidence of learning.'),
    ('sub_profed401', 2, 'Constructing Classroom Assessments', 'Item types, rubrics, performance tasks, and scoring guides.'),
    ('sub_profed401', 3, 'Analyzing Learner Performance', 'Item analysis, grades, feedback cycles, and intervention planning.'),
    ('sub_profed401', 4, 'Portfolio and Authentic Assessment', 'Portfolios, conferences, authentic evidence, and learner reflection.'),
    ('sub_profed401', 5, 'Reporting and Ethical Use of Results', 'Progress reports, stakeholder communication, data privacy, and professional judgment.')
)
insert into public.units (
  subject_id,
  title,
  description,
  sequence_no,
  status
)
select
  subjects.subject_id,
  unit_seed.title,
  unit_seed.description,
  unit_seed.sequence_no,
  'published'::public.record_status
from unit_seed
join public.subjects on subjects.public_id = unit_seed.subject_public_id
on conflict (subject_id, sequence_no) do update
set
  title = excluded.title,
  description = excluded.description,
  status = excluded.status,
  updated_at = now();

with chapter_template(local_sequence_no, title_suffix, description_suffix) as (
  values
    (1, 'Core Concepts', 'Key ideas, vocabulary, demonstrations, and guided note-taking.'),
    (2, 'Applied Practice', 'Collaborative exercises, problem sets, laboratories, and teacher feedback.'),
    (3, 'Synthesis and Reflection', 'Performance evidence, reflection prompts, review, and consolidation.')
),
unit_rows as (
  select
    subjects.subject_id,
    units.unit_id,
    units.sequence_no as unit_sequence_no,
    units.title as unit_title
  from public.units
  join public.subjects on subjects.subject_id = units.subject_id
  where subjects.public_id in (
    'sub_science_7',
    'sub_math_7',
    'sub_english_8',
    'sub_ict_9',
    'sub_chem_9',
    'sub_biology_11',
    'sub_physics_12',
    'sub_calculus_11',
    'sub_it101',
    'sub_ds201',
    'sub_res301',
    'sub_profed401'
  )
)
insert into public.chapters (
  subject_id,
  unit_id,
  title,
  description,
  sequence_no,
  status
)
select
  unit_rows.subject_id,
  unit_rows.unit_id,
  unit_rows.unit_title || ': ' || chapter_template.title_suffix,
  chapter_template.description_suffix,
  ((unit_rows.unit_sequence_no - 1) * 3) + chapter_template.local_sequence_no,
  'published'::public.record_status
from unit_rows
cross join chapter_template
on conflict (subject_id, sequence_no) do update
set
  unit_id = excluded.unit_id,
  title = excluded.title,
  description = excluded.description,
  status = excluded.status,
  updated_at = now();

with lesson_template(sequence_no, title_prefix, content_body, objectives_body, estimated_minutes, complexity_score) as (
  values
    (1, 'Explore', 'Opening scenario, guided questioning, short teacher input, and learner discussion.', 'Identify prior knowledge, define key terms, and connect the lesson to familiar classroom examples.', 60, 2),
    (2, 'Practice', 'Structured examples, collaborative work, feedback checkpoints, and short independent practice.', 'Apply the concept accurately, explain the process, and respond to feedback using clear evidence.', 75, 3),
    (3, 'Create', 'Performance task, laboratory output, written response, or group product with reflection.', 'Produce evidence of learning, justify choices, and reflect on areas for improvement.', 90, 4)
),
chapter_rows as (
  select
    chapters.chapter_id,
    chapters.title as chapter_title
  from public.chapters
  join public.subjects on subjects.subject_id = chapters.subject_id
  where subjects.public_id in (
    'sub_science_7',
    'sub_math_7',
    'sub_english_8',
    'sub_ict_9',
    'sub_chem_9',
    'sub_biology_11',
    'sub_physics_12',
    'sub_calculus_11',
    'sub_it101',
    'sub_ds201',
    'sub_res301',
    'sub_profed401'
  )
)
insert into public.lessons (
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
  chapter_rows.chapter_id,
  lesson_template.title_prefix || ': ' || chapter_rows.chapter_title,
  lesson_template.content_body,
  lesson_template.objectives_body,
  lesson_template.estimated_minutes,
  lesson_template.complexity_score,
  lesson_template.sequence_no,
  'published'::public.record_status
from chapter_rows
cross join lesson_template
on conflict (chapter_id, sequence_no) do update
set
  title = excluded.title,
  content = excluded.content,
  learning_objectives = excluded.learning_objectives,
  estimated_minutes = excluded.estimated_minutes,
  complexity_score = excluded.complexity_score,
  status = excluded.status,
  updated_at = now();

with plan_seed(public_id, user_public_id, school_public_id, subject_public_id, section_public_id, title, academic_year, start_date, end_date, notes, status_name) as (
  values
    ('lp_science7_rizal_q1', 'usr_mariana_villanueva', 'sch_northfield', 'sub_science_7', 'sec_northfield_7_rizal', 'Quarter 1 Science Learning Plan - Rizal', '2026-2027', '2026-06-15'::date, '2026-08-21'::date, 'Inquiry routines, laboratory safety, and matter concepts for the opening quarter.', 'published'),
    ('lp_math7_bonifacio_q1', 'usr_mariana_villanueva', 'sch_northfield', 'sub_math_7', 'sec_northfield_7_bonifacio', 'Quarter 1 Mathematics Learning Plan - Bonifacio', '2026-2027', '2026-06-15'::date, '2026-08-21'::date, 'Integer operations, rational numbers, and performance checks.', 'published'),
    ('lp_english8_luna_q1', 'usr_gabriel_santos', 'sch_northfield', 'sub_english_8', 'sec_northfield_8_luna', 'Quarter 1 English Learning Plan - Luna', '2026-2027', '2026-06-16'::date, '2026-08-20'::date, 'Close reading, text evidence, and short literary responses.', 'published'),
    ('lp_ict9_silang_q1', 'usr_gabriel_santos', 'sch_northfield', 'sub_ict_9', 'sec_northfield_9_silang', 'Quarter 1 ICT Learning Plan - Silang', '2026-2027', '2026-06-17'::date, '2026-08-21'::date, 'Hardware identification, preventive maintenance, and service logs.', 'published'),
    ('lp_chem9_curie_q1', 'usr_celeste_navarro', 'sch_harborview', 'sub_chem_9', 'sec_harborview_9_curie', 'Quarter 1 Chemistry Learning Plan - Curie', '2026-2027', '2026-06-15'::date, '2026-08-21'::date, 'Atomic structure, periodic trends, and model-building activities.', 'published'),
    ('lp_bio11_faraday_sem1', 'usr_celeste_navarro', 'sch_harborview', 'sub_biology_11', 'sec_harborview_11_faraday', 'Semester 1 Biology Learning Plan - Faraday', '2026-2027', '2026-06-15'::date, '2026-10-02'::date, 'Cells, genetics, and laboratory reporting for STEM learners.', 'published'),
    ('lp_physics12_tesla_sem1', 'usr_rafael_delacruz', 'sch_harborview', 'sub_physics_12', 'sec_harborview_12_tesla', 'Semester 1 Physics Learning Plan - Tesla', '2026-2027', '2026-06-16'::date, '2026-10-02'::date, 'Electricity, magnetism, and optics with laboratory investigations.', 'published'),
    ('lp_calc11_faraday_sem1', 'usr_rafael_delacruz', 'sch_harborview', 'sub_calculus_11', 'sec_harborview_11_faraday', 'Semester 1 Calculus Learning Plan - Faraday', '2026-2027', '2026-06-17'::date, '2026-10-01'::date, 'Limits, derivatives, and applied modeling tasks.', 'published'),
    ('lp_it101_bsita_midyear', 'usr_inez_mercado', 'sch_mabini_college', 'sub_it101', 'sec_mabini_bsited_1a', 'Prelim to Midterm Computing Plan - BSIT-1A', '2026-2027', '2026-06-22'::date, '2026-09-18'::date, 'Foundational computing concepts, productivity workflows, and web fundamentals.', 'published'),
    ('lp_ds201_bsit2a_midyear', 'usr_inez_mercado', 'sch_mabini_college', 'sub_ds201', 'sec_mabini_bsited_2a', 'Prelim to Midterm Data Structures Plan - BSIT-2A', '2026-2027', '2026-06-22'::date, '2026-09-18'::date, 'Algorithm analysis, arrays, linked structures, and implementation drills.', 'published'),
    ('lp_res301_bsed3b_midyear', 'usr_elisa_bautista', 'sch_mabini_college', 'sub_res301', 'sec_mabini_bsed_3b', 'Research Methods Plan - BSED-3B', '2026-2027', '2026-06-23'::date, '2026-09-17'::date, 'Research questions, review of related literature, design, and instrument planning.', 'published'),
    ('lp_assessment_beed4a_midyear', 'usr_elisa_bautista', 'sch_mabini_college', 'sub_profed401', 'sec_mabini_beed_4a', 'Assessment of Learning Plan - BEED-4A', '2026-2027', '2026-06-24'::date, '2026-09-18'::date, 'Assessment alignment, rubric design, and feedback cycles.', 'published')
)
insert into public.lesson_plans (
  public_id,
  user_id,
  school_id,
  subject_id,
  section_id,
  title,
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
  plan_seed.academic_year,
  plan_seed.start_date,
  plan_seed.end_date,
  plan_seed.notes,
  plan_seed.status_name::public.record_status
from plan_seed
join public.users on users.publicid = plan_seed.user_public_id
join public.schools on schools.public_id = plan_seed.school_public_id
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
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  notes = excluded.notes,
  status = excluded.status,
  updated_at = now();

with schedule_pattern(plan_public_id, iso_dow, start_time, end_time, meeting_type) as (
  values
    ('lp_science7_rizal_q1', 1, '08:00'::time, '09:00'::time, 'lecture'),
    ('lp_science7_rizal_q1', 3, '10:00'::time, '11:30'::time, 'laboratory'),
    ('lp_math7_bonifacio_q1', 2, '08:00'::time, '09:00'::time, 'lecture'),
    ('lp_math7_bonifacio_q1', 4, '08:00'::time, '09:00'::time, 'lecture'),
    ('lp_english8_luna_q1', 2, '10:00'::time, '11:00'::time, 'lecture'),
    ('lp_english8_luna_q1', 5, '09:00'::time, '10:00'::time, 'lecture'),
    ('lp_ict9_silang_q1', 3, '13:00'::time, '14:00'::time, 'lecture'),
    ('lp_ict9_silang_q1', 5, '13:00'::time, '15:00'::time, 'laboratory'),
    ('lp_chem9_curie_q1', 1, '09:00'::time, '10:00'::time, 'lecture'),
    ('lp_chem9_curie_q1', 4, '13:00'::time, '15:00'::time, 'laboratory'),
    ('lp_bio11_faraday_sem1', 1, '10:00'::time, '11:30'::time, 'lecture'),
    ('lp_bio11_faraday_sem1', 3, '13:00'::time, '15:00'::time, 'laboratory'),
    ('lp_bio11_faraday_sem1', 5, '10:00'::time, '11:00'::time, 'lecture'),
    ('lp_physics12_tesla_sem1', 2, '09:00'::time, '10:30'::time, 'lecture'),
    ('lp_physics12_tesla_sem1', 4, '10:00'::time, '12:00'::time, 'laboratory'),
    ('lp_calc11_faraday_sem1', 3, '08:00'::time, '09:30'::time, 'lecture'),
    ('lp_calc11_faraday_sem1', 5, '08:00'::time, '09:30'::time, 'lecture'),
    ('lp_it101_bsita_midyear', 1, '14:00'::time, '15:30'::time, 'lecture'),
    ('lp_it101_bsita_midyear', 3, '14:00'::time, '16:00'::time, 'laboratory'),
    ('lp_ds201_bsit2a_midyear', 2, '13:00'::time, '14:30'::time, 'lecture'),
    ('lp_ds201_bsit2a_midyear', 4, '13:00'::time, '15:00'::time, 'laboratory'),
    ('lp_res301_bsed3b_midyear', 2, '15:00'::time, '16:30'::time, 'lecture'),
    ('lp_res301_bsed3b_midyear', 5, '10:00'::time, '11:30'::time, 'lecture'),
    ('lp_assessment_beed4a_midyear', 3, '10:00'::time, '11:30'::time, 'lecture'),
    ('lp_assessment_beed4a_midyear', 5, '13:00'::time, '14:30'::time, 'lecture')
),
slot_days as (
  select
    lesson_plans.lesson_plan_id,
    lesson_plans.public_id,
    lesson_plans.title,
    date_day::date as slot_date,
    schedule_pattern.iso_dow,
    schedule_pattern.start_time,
    schedule_pattern.end_time,
    schedule_pattern.meeting_type
  from schedule_pattern
  join public.lesson_plans on lesson_plans.public_id = schedule_pattern.plan_public_id
  cross join lateral generate_series(lesson_plans.start_date, lesson_plans.end_date, interval '1 day') as generated_days(date_day)
  where extract(isodow from date_day)::integer = schedule_pattern.iso_dow
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
  where lesson_plans.public_id in (
    'lp_science7_rizal_q1',
    'lp_math7_bonifacio_q1',
    'lp_english8_luna_q1',
    'lp_ict9_silang_q1',
    'lp_chem9_curie_q1',
    'lp_bio11_faraday_sem1',
    'lp_physics12_tesla_sem1',
    'lp_calc11_faraday_sem1',
    'lp_it101_bsita_midyear',
    'lp_ds201_bsit2a_midyear',
    'lp_res301_bsed3b_midyear',
    'lp_assessment_beed4a_midyear'
  )
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
  'seed-' || plan_public_id || '-' || slot_sequence,
  'seed-' || plan_public_id || '-' || slot_sequence,
  case
    when slot_sequence % 16 = 0 then 'Major Exam: ' || subject_title
    when slot_sequence % 10 = 0 then 'Performance Task: ' || subject_title
    when slot_sequence % 6 = 0 then 'Quiz: ' || subject_title
    else lesson_title
  end,
  case
    when slot_sequence % 16 = 0 then 'Cumulative assessment with analysis and feedback session.'
    when slot_sequence % 10 = 0 then 'Applied output aligned with the current unit outcomes.'
    when slot_sequence % 6 = 0 then 'Short formative check for recent learning targets.'
    else 'Scheduled lesson block generated for presentation data.'
  end,
  case
    when slot_sequence % 16 = 0 then 'exam'
    when slot_sequence % 10 = 0 then 'performance_task'
    when slot_sequence % 6 = 0 then 'written_work'
    else 'lesson'
  end::public.session_category,
  case
    when slot_sequence % 16 = 0 then
      case
        when slot_sequence % 32 = 0 then 'midterm'
        else 'prelim'
      end
    when slot_sequence % 10 = 0 then
      case
        when meeting_type = 'laboratory' then 'lab_report'
        else 'project'
      end
    when slot_sequence % 6 = 0 then 'quiz'
    else meeting_type::text
  end::public.session_subcategory,
  meeting_type,
  start_time,
  end_time,
  true,
  false,
  case
    when meeting_type = 'laboratory' then 'laboratory'
    else 'lecture'
  end,
  '{}'::text[],
  1,
  false,
  jsonb_build_object(
    'source', 'presentation_placeholder',
    'sequence', slot_sequence,
    'subject', subject_title
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

with selected_content as (
  select
    lesson_plans.lesson_plan_id,
    lesson_plans.subject_id,
    units.unit_id,
    chapters.chapter_id,
    lessons.lesson_id,
    units.sequence_no as unit_sequence,
    chapters.sequence_no as chapter_sequence,
    lessons.sequence_no as lesson_sequence,
    units.title as unit_title,
    units.description as unit_description,
    chapters.title as chapter_title,
    chapters.description as chapter_description,
    lessons.title as lesson_title,
    lessons.content as lesson_content,
    lessons.learning_objectives,
    lessons.estimated_minutes,
    row_number() over (
      partition by lesson_plans.lesson_plan_id
      order by units.sequence_no, chapters.sequence_no, lessons.sequence_no
    ) as content_sequence
  from public.lesson_plans
  join public.units on units.subject_id = lesson_plans.subject_id
  join public.chapters on chapters.unit_id = units.unit_id
  join public.lessons on lessons.chapter_id = chapters.chapter_id
  where lesson_plans.public_id in (
    'lp_science7_rizal_q1',
    'lp_math7_bonifacio_q1',
    'lp_english8_luna_q1',
    'lp_ict9_silang_q1',
    'lp_chem9_curie_q1',
    'lp_bio11_faraday_sem1',
    'lp_physics12_tesla_sem1',
    'lp_calc11_faraday_sem1',
    'lp_it101_bsita_midyear',
    'lp_ds201_bsit2a_midyear',
    'lp_res301_bsed3b_midyear',
    'lp_assessment_beed4a_midyear'
  )
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
  lesson_title,
  lesson_content,
  learning_objectives,
  estimated_minutes
from selected_content
where content_sequence <= 12
  and not exists (
    select 1
    from public.plan_subject_content existing
    where existing.lesson_plan_id = selected_content.lesson_plan_id
      and existing.lesson_id = selected_content.lesson_id
      and existing.content_level = 'lesson'
  );

with event_seed(school_public_id, section_public_id, subject_public_id, event_type, blackout_reason, title, description, start_date, end_date, created_by_public_id) as (
  values
    ('sch_northfield', null, null, 'school_event', 'event', 'Faculty Curriculum Alignment Day', 'Department planning and vertical alignment for the opening quarter.', '2026-06-12'::date, '2026-06-12'::date, 'usr_mariana_villanueva'),
    ('sch_northfield', null, null, 'holiday', 'holiday', 'Independence Day Observance', 'Regular holiday marked on the school calendar.', '2026-06-12'::date, '2026-06-12'::date, 'usr_gabriel_santos'),
    ('sch_northfield', 'sec_northfield_7_rizal', 'sub_science_7', 'school_event', 'event', 'Grade 7 Laboratory Orientation', 'Safety briefing, equipment handling, and station rotation practice.', '2026-06-19'::date, '2026-06-19'::date, 'usr_mariana_villanueva'),
    ('sch_harborview', null, null, 'school_event', 'event', 'STEM Research Colloquium', 'Student research posters and adviser consultations.', '2026-07-10'::date, '2026-07-10'::date, 'usr_rafael_delacruz'),
    ('sch_harborview', 'sec_harborview_11_faraday', 'sub_biology_11', 'school_event', 'event', 'Microscopy Skills Clinic', 'Hands-on microscopy practice for cell structure lessons.', '2026-07-17'::date, '2026-07-17'::date, 'usr_celeste_navarro'),
    ('sch_harborview', null, null, 'exam_week', 'exam_week', 'First Quarter Examination Week', 'Coordinated written exams and performance task deadlines.', '2026-08-17'::date, '2026-08-21'::date, 'usr_rafael_delacruz'),
    ('sch_mabini_college', null, null, 'school_event', 'event', 'College Orientation and Advising', 'Program orientation, advising, and library onboarding.', '2026-06-19'::date, '2026-06-19'::date, 'usr_inez_mercado'),
    ('sch_mabini_college', 'sec_mabini_bsited_1a', 'sub_it101', 'school_event', 'event', 'Digital Portfolio Workshop', 'Workshop for organizing course artifacts and reflection notes.', '2026-07-03'::date, '2026-07-03'::date, 'usr_inez_mercado'),
    ('sch_mabini_college', 'sec_mabini_bsed_3b', 'sub_res301', 'school_event', 'event', 'Research Proposal Consultation Day', 'Small-group consultation for research questions and instruments.', '2026-08-07'::date, '2026-08-07'::date, 'usr_elisa_bautista'),
    ('sch_mabini_college', null, null, 'exam_week', 'exam_week', 'Prelim Examination Week', 'Prelim exams and portfolio checking across college programs.', '2026-08-24'::date, '2026-08-28'::date, 'usr_elisa_bautista')
)
insert into public.school_calendar_events (
  school_id,
  section_id,
  subject_id,
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
  sections.section_id,
  subjects.subject_id,
  event_seed.event_type::public.calendar_event_type,
  event_seed.blackout_reason::public.plan_blackout_reason,
  event_seed.title,
  event_seed.description,
  event_seed.start_date,
  event_seed.end_date,
  true,
  users.userid
from event_seed
join public.schools on schools.public_id = event_seed.school_public_id
left join public.sections on sections.public_id = event_seed.section_public_id
left join public.subjects on subjects.public_id = event_seed.subject_public_id
join public.users on users.publicid = event_seed.created_by_public_id
where not exists (
  select 1
  from public.school_calendar_events existing
  where existing.school_id = schools.school_id
    and existing.title = event_seed.title
    and existing.start_date = event_seed.start_date
    and existing.end_date = event_seed.end_date
);

with delay_seed(user_public_id, school_public_id, subject_public_id, section_public_id, absent_on, blackout_reason, reason) as (
  values
    ('usr_mariana_villanueva', 'sch_northfield', 'sub_science_7', 'sec_northfield_7_rizal', '2026-07-06'::date, 'leave', 'Approved professional development seminar.'),
    ('usr_gabriel_santos', 'sch_northfield', 'sub_english_8', 'sec_northfield_8_luna', '2026-07-24'::date, 'event', 'Oral reading conference schedule adjustment.'),
    ('usr_celeste_navarro', 'sch_harborview', 'sub_biology_11', 'sec_harborview_11_faraday', '2026-08-05'::date, 'event', 'Laboratory equipment calibration day.'),
    ('usr_rafael_delacruz', 'sch_harborview', 'sub_physics_12', 'sec_harborview_12_tesla', '2026-08-12'::date, 'suspended', 'Class suspension due to campus electrical maintenance.'),
    ('usr_inez_mercado', 'sch_mabini_college', 'sub_ds201', 'sec_mabini_bsited_2a', '2026-07-30'::date, 'leave', 'Department accreditation documentation work.'),
    ('usr_elisa_bautista', 'sch_mabini_college', 'sub_res301', 'sec_mabini_bsed_3b', '2026-08-14'::date, 'event', 'Research ethics committee consultation.')
)
insert into public.delays (
  user_id,
  school_id,
  subject_id,
  section_id,
  absent_on,
  blackout_reason,
  reason
)
select
  users.userid,
  schools.school_id,
  subjects.subject_id,
  sections.section_id,
  delay_seed.absent_on,
  delay_seed.blackout_reason::public.plan_blackout_reason,
  delay_seed.reason
from delay_seed
join public.users on users.publicid = delay_seed.user_public_id
join public.schools on schools.public_id = delay_seed.school_public_id
join public.subjects on subjects.public_id = delay_seed.subject_public_id
join public.sections on sections.public_id = delay_seed.section_public_id
where not exists (
  select 1
  from public.delays existing
  where existing.user_id = users.userid
    and existing.subject_id = subjects.subject_id
    and existing.section_id = sections.section_id
    and existing.absent_on = delay_seed.absent_on
);

with activity_seed(public_id, user_public_id, school_public_id, subject_public_id, title, category, activity_type, scope_summary, requirements, component_keys, template_notes, generation_notes, generated_text, status_name) as (
  values
    ('act_science7_lab_safety', 'usr_mariana_villanueva', 'sch_northfield', 'sub_science_7', 'Laboratory Safety Stations', 'performance_task', 'activity', 'Station-based task for safe handling, hazard labels, and emergency routines.', '{"group_size":4,"duration_minutes":60,"rubric":["Safety accuracy","Collaboration","Reflection quality"]}'::jsonb, array['rubric','station_cards','reflection'], 'Use classroom laboratory symbols and locally available equipment.', 'Include clear teacher prompts and quick scoring criteria.', 'Students rotate through four safety stations, complete evidence cards, and write a brief safety commitment.', 'published'),
    ('act_science7_matter_quiz', 'usr_mariana_villanueva', 'sch_northfield', 'sub_science_7', 'Matter and Particle Model Quiz', 'written_work', 'quiz', 'Short quiz covering states of matter, particle diagrams, and changes.', '{"items":20,"item_mix":["multiple_choice","diagram_labeling","short_response"]}'::jsonb, array['answer_key','item_analysis'], 'Balance recall and application items.', 'Provide answer key and feedback notes.', 'Twenty-item quiz with particle diagrams, explanation prompts, and misconception checks.', 'published'),
    ('act_math7_integer_trail', 'usr_mariana_villanueva', 'sch_northfield', 'sub_math_7', 'Integer Operations Trail', 'performance_task', 'activity', 'Collaborative route activity where learners solve signed-number problems at checkpoints.', '{"group_size":3,"duration_minutes":50,"materials":["checkpoint cards","number lines"]}'::jsonb, array['task_cards','rubric'], 'Use practical contexts such as temperature, elevation, and savings.', 'Create varied integer operations and reflection prompts.', 'Learners complete checkpoint cards and submit a solution trail with explanations.', 'published'),
    ('act_math7_equation_exit', 'usr_mariana_villanueva', 'sch_northfield', 'sub_math_7', 'One-Step Equations Exit Check', 'written_work', 'seatwork', 'Individual seatwork on translating and solving one-step equations.', '{"items":12,"duration_minutes":20}'::jsonb, array['worksheet','answer_key'], 'Keep numbers manageable for quick checking.', 'Generate concise problems with two word items.', 'Twelve-item exit check with solution space and a quick teacher marking guide.', 'published'),
    ('act_english8_evidence_cards', 'usr_gabriel_santos', 'sch_northfield', 'sub_english_8', 'Text Evidence Card Sort', 'performance_task', 'activity', 'Small-group sorting task for claims, direct evidence, and explanations.', '{"group_size":4,"duration_minutes":45,"rubric":["Accuracy","Reasoning","Participation"]}'::jsonb, array['card_set','rubric'], 'Use school-appropriate literary excerpts.', 'Include claims with plausible distractors.', 'Groups sort evidence cards, defend pairings, and submit a reflection paragraph.', 'published'),
    ('act_english8_argument_outline', 'usr_gabriel_santos', 'sch_northfield', 'sub_english_8', 'Argument Outline Assignment', 'written_work', 'assignment', 'Structured outline for claim, reasons, evidence, counterclaim, and closing statement.', '{"required_sections":5,"word_target":350}'::jsonb, array['outline_template','rubric'], 'Prompt should connect to media literacy.', 'Provide criteria for clarity and evidence use.', 'Learners complete an argument outline using sourced evidence and peer feedback.', 'published'),
    ('act_ict9_hardware_inventory', 'usr_gabriel_santos', 'sch_northfield', 'sub_ict_9', 'Computer Hardware Inventory', 'performance_task', 'activity', 'Practical hardware identification and documentation task.', '{"group_size":3,"duration_minutes":80,"deliverables":["inventory sheet","photo log","maintenance notes"]}'::jsonb, array['checklist','rubric'], 'Use available lab units and require safe handling.', 'Include professional service documentation language.', 'Teams inspect assigned units, record specifications, and recommend preventive maintenance.', 'published'),
    ('act_ict9_networking_quiz', 'usr_gabriel_santos', 'sch_northfield', 'sub_ict_9', 'Networking Basics Quiz', 'written_work', 'quiz', 'Quiz on network types, devices, IP basics, and troubleshooting steps.', '{"items":25,"duration_minutes":35}'::jsonb, array['question_bank','answer_key'], 'Include scenario-based troubleshooting questions.', 'Generate answer explanations for review.', 'Twenty-five-item quiz with matching, multiple choice, and short scenario responses.', 'published'),
    ('act_chem9_periodic_table', 'usr_celeste_navarro', 'sch_harborview', 'sub_chem_9', 'Periodic Trends Investigation', 'performance_task', 'lab_report', 'Guided analysis of atomic radius, electronegativity, and ionization energy trends.', '{"group_size":2,"duration_minutes":90,"sections":["data table","graph","analysis","conclusion"]}'::jsonb, array['lab_sheet','rubric'], 'Use safe paper-based trend data and graphing.', 'Include graph prompts and conclusion starters.', 'Pairs graph periodic trends, interpret patterns, and submit a concise lab report.', 'published'),
    ('act_bio11_microscopy_report', 'usr_celeste_navarro', 'sch_harborview', 'sub_biology_11', 'Cell Microscopy Lab Report', 'performance_task', 'lab_report', 'Lab report for comparing plant and animal cell structures.', '{"group_size":2,"duration_minutes":120,"rubric":["Observation quality","Scientific explanation","Diagram accuracy"]}'::jsonb, array['lab_report_template','rubric'], 'Require labeled sketches and microscopy notes.', 'Add prompts for magnification and cell organelles.', 'Students prepare slides, record observations, and explain similarities and differences between cell types.', 'published'),
    ('act_bio11_genetics_quiz', 'usr_celeste_navarro', 'sch_harborview', 'sub_biology_11', 'Mendelian Genetics Quiz', 'written_work', 'quiz', 'Quiz on Punnett squares, genotype, phenotype, and inheritance patterns.', '{"items":30,"duration_minutes":45}'::jsonb, array['quiz','answer_key'], 'Mix computation and concept questions.', 'Provide solution steps for Punnett square items.', 'Thirty-item genetics quiz with monohybrid crosses and interpretation questions.', 'published'),
    ('act_physics12_circuit_lab', 'usr_rafael_delacruz', 'sch_harborview', 'sub_physics_12', 'Series and Parallel Circuit Lab', 'performance_task', 'lab_report', 'Laboratory activity comparing current and voltage in circuit arrangements.', '{"group_size":3,"duration_minutes":120,"materials":["resistors","multimeter","breadboard"]}'::jsonb, array['lab_sheet','rubric','safety_notes'], 'Use low-voltage sources and standard safety reminders.', 'Include data tables and analysis prompts.', 'Groups build circuits, collect readings, and write evidence-based conclusions.', 'published'),
    ('act_physics12_fields_quiz', 'usr_rafael_delacruz', 'sch_harborview', 'sub_physics_12', 'Electric Fields Concept Check', 'written_work', 'seatwork', 'Short seatwork on field lines, force direction, and electric potential.', '{"items":15,"duration_minutes":25}'::jsonb, array['worksheet','answer_key'], 'Include diagrams requiring arrows and explanations.', 'Create a fast classroom check with teacher notes.', 'Fifteen-item concept check with diagrams, calculations, and two explanation prompts.', 'published'),
    ('act_calc11_derivatives_drill', 'usr_rafael_delacruz', 'sch_harborview', 'sub_calculus_11', 'Derivative Rules Drill', 'written_work', 'assignment', 'Practice set on power, product, quotient, and chain rules.', '{"items":24,"duration_minutes":60}'::jsonb, array['problem_set','solution_key'], 'Sequence items from routine to applied.', 'Include worked solutions for selected items.', 'Twenty-four derivative problems with a solution key and reflection prompt.', 'published'),
    ('act_it101_digital_portfolio', 'usr_inez_mercado', 'sch_mabini_college', 'sub_it101', 'Digital Portfolio Setup', 'performance_task', 'project', 'Portfolio project for organizing course artifacts and reflections.', '{"milestones":["folder structure","artifact upload","reflection page"],"rubric":["Organization","Completeness","Professional presentation"]}'::jsonb, array['project_brief','rubric'], 'Use privacy-aware instructions and accessible formatting.', 'Create milestone checklist and scoring guide.', 'Students assemble a digital portfolio with artifacts, captions, and reflection notes.', 'published'),
    ('act_ds201_sorting_benchmark', 'usr_inez_mercado', 'sch_mabini_college', 'sub_ds201', 'Sorting Algorithm Benchmark', 'performance_task', 'project', 'Programming task comparing sorting algorithms across input sizes.', '{"language":"TypeScript or Python","deliverables":["source code","table","analysis memo"]}'::jsonb, array['brief','rubric','starter_cases'], 'Require clear comments and runtime table.', 'Include varied input cases and analysis questions.', 'Students implement sorting routines, collect timing data, and explain complexity patterns.', 'published'),
    ('act_res301_literature_matrix', 'usr_elisa_bautista', 'sch_mabini_college', 'sub_res301', 'Review of Literature Matrix', 'written_work', 'assignment', 'Annotated matrix summarizing sources, methods, findings, and relevance.', '{"sources_required":8,"format":"matrix with synthesis notes"}'::jsonb, array['matrix_template','rubric'], 'Use APA-style citation expectations.', 'Add synthesis prompts and relevance column.', 'Students complete a literature matrix and identify gaps for their proposal.', 'published'),
    ('act_profed401_rubric_design', 'usr_elisa_bautista', 'sch_mabini_college', 'sub_profed401', 'Performance Task Rubric Design', 'performance_task', 'project', 'Design a standards-aligned rubric for an authentic classroom performance task.', '{"criteria_required":4,"levels":4,"deliverables":["task description","rubric","feedback plan"]}'::jsonb, array['project_brief','rubric_checker'], 'Emphasize alignment, observable criteria, and learner-friendly language.', 'Provide checklist for descriptors and feedback quality.', 'Students design an authentic task rubric and present the feedback plan.', 'published')
)
insert into public.activities (
  public_id,
  user_id,
  school_id,
  subject_id,
  title,
  category,
  activity_type,
  scope_summary,
  requirements,
  component_keys,
  template_notes,
  generation_notes,
  generated_text,
  status
)
select
  activity_seed.public_id,
  users.userid,
  schools.school_id,
  subjects.subject_id,
  activity_seed.title,
  activity_seed.category::public.session_category,
  activity_seed.activity_type,
  activity_seed.scope_summary,
  activity_seed.requirements,
  activity_seed.component_keys,
  activity_seed.template_notes,
  activity_seed.generation_notes,
  activity_seed.generated_text,
  activity_seed.status_name::public.record_status
from activity_seed
join public.users on users.publicid = activity_seed.user_public_id
join public.schools on schools.public_id = activity_seed.school_public_id
join public.subjects on subjects.public_id = activity_seed.subject_public_id
on conflict (public_id) do update
set
  user_id = excluded.user_id,
  school_id = excluded.school_id,
  subject_id = excluded.subject_id,
  title = excluded.title,
  category = excluded.category,
  activity_type = excluded.activity_type,
  scope_summary = excluded.scope_summary,
  requirements = excluded.requirements,
  component_keys = excluded.component_keys,
  template_notes = excluded.template_notes,
  generation_notes = excluded.generation_notes,
  generated_text = excluded.generated_text,
  status = excluded.status,
  updated_at = now();

commit;
