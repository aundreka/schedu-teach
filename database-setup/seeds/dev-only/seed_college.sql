-- =====================================================================
-- DEV-ONLY SEED — NEVER RUN IN PRODUCTION.
-- Creates a college teacher persona (Ramon Villanueva, BSCS 2A instructor)
-- with rich, believable planning data for a university semester course.
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
--   username: ramon.villanueva
--   email:    ramon.villanueva@example.com
--   password: ScheduTest2026!
--
-- Run this after database-setup/00_users.sql through the latest billing/onboarding files.
-- The app's Library screen reads "books" from subjects assigned through user_subjects.

with seed_user(user_id, public_id, first_name, last_name, username, email, role_name) as (
  values (
    '44444444-4444-4444-8444-444444444444'::uuid,
    'usr_ramon_villanueva',
    'Ramon',
    'Villanueva',
    'ramon.villanueva',
    'ramon.villanueva@example.com',
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
    '44444444-4444-4444-8444-444444444444'::uuid,
    'usr_ramon_villanueva',
    'Ramon',
    'Villanueva',
    'ramon.villanueva',
    'ramon.villanueva@example.com',
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
    where publicid = 'usr_ramon_villanueva';
  end if;
end $$;

do $$
begin
  if to_regclass('public.subscriptions') is not null then
    insert into public.subscriptions (user_id, tier, status)
    select userid, 'tier1'::public.subscription_tier, 'active'::public.subscription_status
    from public.users
    where publicid = 'usr_ramon_villanueva'
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
    where publicid = 'usr_ramon_villanueva'
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
    'sch_batstateu',
    'Batangas State University',
    'university',
    '#B91C1C',
    true,
    'usr_ramon_villanueva'
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
join public.schools on schools.public_id = 'sch_batstateu'
where users.publicid = 'usr_ramon_villanueva'
on conflict (user_id, school_id) do update
set is_primary = excluded.is_primary;

with section_seed(public_id, grade_level, name, status_name) as (
  values
    ('sec_batstateu_bscs_2a', '2nd Year', 'BSCS 2A', 'published')
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
join public.schools on schools.public_id = 'sch_batstateu'
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
join public.schools on schools.public_id = 'sch_batstateu'
join public.sections on sections.school_id = schools.school_id
where users.publicid = 'usr_ramon_villanueva'
  and sections.public_id in ('sec_batstateu_bscs_2a')
on conflict (user_id, section_id) do nothing;

with subject_seed(public_id, code, title, year_level, academic_year, unit_no, description, status_name) as (
  values
    (
      'sub_batstateu_cs201',
      'CS201',
      'Data Structures & Algorithms',
      '2nd Year',
      '2026-2027',
      3,
      'A second-year computer science course on the design, analysis, and implementation of fundamental data structures — arrays, linked lists, stacks, queues, trees, heaps, hash tables, and graphs — together with the algorithms and complexity analysis that make them useful.',
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
join public.schools on schools.public_id = 'sch_batstateu'
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
join public.subjects on subjects.public_id in ('sub_batstateu_cs201')
where users.publicid = 'usr_ramon_villanueva'
on conflict (user_id, subject_id) do nothing;

with unit_seed(subject_public_id, sequence_no, public_id, title, description) as (
  values
    ('sub_batstateu_cs201', 1, 'unt_batstateu_cs201_linear', 'Linear Data Structures', 'Complexity analysis, arrays, linked lists, stacks, and queues — the sequential building blocks of programs, with an emphasis on choosing the right structure for a workload.'),
    ('sub_batstateu_cs201', 2, 'unt_batstateu_cs201_nonlinear', 'Nonlinear Structures and Algorithms', 'Trees, heaps, hash tables, graphs, and the classic sorting and traversal algorithms that operate on them, analyzed for time and space complexity.')
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
    ('sub_batstateu_cs201', 1, 1, 'chp_batstateu_cs201_foundations', 'Foundations and Sequential Structures', 'Asymptotic analysis, arrays, dynamic arrays, and linked lists as the baseline structures every other structure is measured against.'),
    ('sub_batstateu_cs201', 1, 2, 'chp_batstateu_cs201_stacks_queues', 'Stacks, Queues, and Recursion', 'LIFO and FIFO abstractions, their array and linked implementations, and recursion viewed through the call stack.'),
    ('sub_batstateu_cs201', 2, 3, 'chp_batstateu_cs201_trees', 'Trees and Heaps', 'Hierarchical structures: binary trees and traversals, binary search trees, and heaps backing priority queues.'),
    ('sub_batstateu_cs201', 2, 4, 'chp_batstateu_cs201_hash_graphs', 'Hashing, Graphs, and Sorting', 'Hash tables with collision resolution, graph representations and traversals, and a comparative study of sorting algorithms.')
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
      'sub_batstateu_cs201',
      1,
      1,
      'les_batstateu_cs201_bigo',
      'Complexity Analysis and Big-O Notation',
      $html$<h2>Overview</h2><p>Students measure how running time and memory grow with input size, express growth with Big-O, Big-Theta, and Big-Omega notation, and rank common complexity classes from constant to exponential.</p><h3>Lesson Flow</h3><ul><li>Warm-up: time a linear search and a binary search on growing arrays and plot the results.</li><li>Discussion: worst, best, and average case; why constants and lower-order terms are dropped.</li><li>Guided practice: derive the Big-O of short code fragments with loops and nested loops.</li></ul><p>Exit task: order O(1), O(log n), O(n), O(n log n), O(n^2), and O(2^n) and give a real algorithm for each.</p>$html$,
      'Define asymptotic notation; analyze the time complexity of simple iterative code; compare algorithms by growth rate rather than raw timing.',
      90,
      5
    ),
    (
      'sub_batstateu_cs201',
      1,
      2,
      'les_batstateu_cs201_arrays',
      'Arrays and Dynamic Arrays',
      $html$<h2>Overview</h2><p>The class examines contiguous memory layout, constant-time indexing, and the cost of insertion and deletion in static arrays, then builds a dynamic array and analyzes amortized growth by doubling.</p><h3>Practice</h3><ul><li>Trace memory addresses for row-major array indexing.</li><li>Implement append with capacity doubling and count copy operations.</li><li>Show why amortized append is O(1) even though a single append can be O(n).</li></ul><p>Students close by comparing when a static array beats a dynamic array and vice versa.</p>$html$,
      'Explain contiguous memory layout and indexing; implement a dynamic array with geometric resizing; analyze amortized cost of append.',
      90,
      5
    ),
    (
      'sub_batstateu_cs201',
      1,
      3,
      'les_batstateu_cs201_linkedlists',
      'Singly and Doubly Linked Lists',
      $html$<h2>Overview</h2><p>Students implement singly and doubly linked lists with head and tail pointers, walk pointer diagrams for insertion and deletion, and contrast list operations with their array counterparts.</p><h3>Guided Work</h3><ul><li>Draw the pointer updates for inserting at the head, tail, and middle.</li><li>Implement delete-by-value and handle the empty and single-node edge cases.</li><li>Compare O(1) insertion after a known node against O(n) search-to-insert.</li></ul><p>Exit prompt: name one workload where a linked list clearly beats a dynamic array and defend the choice with complexity.</p>$html$,
      'Implement singly and doubly linked lists; trace pointer manipulation for insertion and deletion; choose between lists and arrays for a given workload.',
      90,
      6
    ),
    (
      'sub_batstateu_cs201',
      2,
      1,
      'les_batstateu_cs201_stacks',
      'Stacks and Their Applications',
      $html$<h2>Overview</h2><p>The lesson develops the stack abstract data type with array and linked implementations, then applies it to balanced-parenthesis checking, infix-to-postfix conversion, and postfix evaluation.</p><h3>Workshop</h3><ul><li>Implement push, pop, and peek over a dynamic array.</li><li>Trace the shunting-yard conversion of an infix expression.</li><li>Evaluate the resulting postfix expression with a stack.</li></ul><p>Students submit a trace table showing stack contents at each token of a conversion.</p>$html$,
      'Implement a stack with array and linked backing; apply stacks to expression conversion and evaluation; reason about LIFO ordering.',
      90,
      5
    ),
    (
      'sub_batstateu_cs201',
      2,
      2,
      'les_batstateu_cs201_queues',
      'Queues, Deques, and Circular Buffers',
      $html$<h2>Overview</h2><p>Students implement queues and double-ended queues, discover why naive array dequeue is O(n), and fix it with a circular buffer using modular index arithmetic.</p><h3>Practice</h3><ul><li>Implement enqueue and dequeue over a linked list.</li><li>Convert an array queue into a circular buffer and handle wrap-around.</li><li>Distinguish full from empty states in a ring buffer.</li></ul><p>Exit task: explain where the operating system or a game loop uses a queue and why FIFO ordering matters there.</p>$html$,
      'Implement queue and deque operations; build a circular buffer with modular arithmetic; identify real systems that depend on FIFO ordering.',
      90,
      5
    ),
    (
      'sub_batstateu_cs201',
      2,
      3,
      'les_batstateu_cs201_recursion',
      'Recursion and the Call Stack',
      $html$<h2>Overview</h2><p>The class connects recursion to the runtime call stack, traces stack frames for factorial and Fibonacci, and converts recursive solutions to iterative ones with an explicit stack.</p><h3>Guided Work</h3><ul><li>Draw the frame-by-frame call stack for a recursive function.</li><li>Diagnose a stack overflow from missing or unreachable base cases.</li><li>Rewrite a recursive traversal iteratively using an explicit stack.</li></ul><p>Students finish by explaining why naive recursive Fibonacci is exponential and how memoization repairs it.</p>$html$,
      'Trace recursive calls through the call stack; identify base and recursive cases; convert between recursive and iterative formulations.',
      90,
      6
    ),
    (
      'sub_batstateu_cs201',
      3,
      1,
      'les_batstateu_cs201_bintrees',
      'Binary Trees and Traversals',
      $html$<h2>Overview</h2><p>Students define binary trees with node and pointer structures, implement preorder, inorder, postorder, and level-order traversals, and connect each traversal to a practical use such as expression printing or tree copying.</p><h3>Activity</h3><ul><li>Build a small expression tree and read it with each traversal.</li><li>Implement recursive traversals, then level-order with a queue.</li><li>Compute height and node count recursively.</li></ul><p>Exit prompt: which traversal of an expression tree reproduces the original infix expression, and why does it need parentheses?</p>$html$,
      'Represent binary trees in memory; implement the four standard traversals; compute structural properties like height recursively.',
      90,
      6
    ),
    (
      'sub_batstateu_cs201',
      3,
      2,
      'les_batstateu_cs201_bst',
      'Binary Search Trees',
      $html$<h2>Overview</h2><p>The lesson builds binary search trees with insert, search, and delete — including the two-child deletion case via inorder successor — and shows how insertion order drives the tree toward O(log n) or degenerates it to O(n).</p><h3>Workshop</h3><ul><li>Insert the same key set in sorted and shuffled order and compare heights.</li><li>Implement search and trace the comparisons made.</li><li>Delete a two-child node using its inorder successor.</li></ul><p>Students close with a one-paragraph argument for why balanced variants such as AVL trees exist.</p>$html$,
      'Maintain the BST ordering invariant through insert, search, and delete; analyze best and worst case height; motivate self-balancing trees.',
      90,
      7
    ),
    (
      'sub_batstateu_cs201',
      3,
      3,
      'les_batstateu_cs201_heaps',
      'Heaps and Priority Queues',
      $html$<h2>Overview</h2><p>Students implement a binary min-heap in an array, derive the parent and child index formulas, and use sift-up and sift-down to support insert and extract-min for a priority queue, closing with heapsort.</p><h3>Practice</h3><ul><li>Map a complete binary tree onto array indices.</li><li>Trace sift-up on insert and sift-down on extract-min.</li><li>Heapify an unsorted array in O(n) and run heapsort.</li></ul><p>Exit task: explain why a heap gives O(log n) priority-queue operations while a sorted array does not.</p>$html$,
      'Implement an array-backed binary heap; support priority queue operations in O(log n); apply heapify and heapsort.',
      90,
      7
    ),
    (
      'sub_batstateu_cs201',
      4,
      1,
      'les_batstateu_cs201_hashing',
      'Hash Tables and Collision Resolution',
      $html$<h2>Overview</h2><p>The class designs hash functions, measures load factor, and resolves collisions with separate chaining and open addressing (linear and quadratic probing), observing how clustering degrades probe counts.</p><h3>Guided Work</h3><ul><li>Insert a key set into a chained table and count chain lengths.</li><li>Repeat with linear probing and observe primary clustering.</li><li>Rehash into a larger table when the load factor passes a threshold.</li></ul><p>Students submit a table comparing average probes for chaining versus probing at several load factors.</p>$html$,
      'Design and evaluate hash functions; implement chaining and open addressing; relate load factor to expected operation cost.',
      90,
      7
    ),
    (
      'sub_batstateu_cs201',
      4,
      2,
      'les_batstateu_cs201_graphs',
      'Graph Representations and Traversals',
      $html$<h2>Overview</h2><p>Students model networks as graphs, compare adjacency matrix and adjacency list storage, and implement breadth-first and depth-first search, using BFS for unweighted shortest paths and DFS for connectivity and cycle detection.</p><h3>Activity</h3><ul><li>Encode a small campus map as both a matrix and a list and compare space.</li><li>Run BFS from a source vertex and recover shortest paths.</li><li>Use DFS to detect a cycle in a directed prerequisite graph.</li></ul><p>Exit prompt: for a sparse social network with millions of users, justify the representation you would choose.</p>$html$,
      'Choose between adjacency matrix and list representations; implement BFS and DFS; apply traversals to shortest paths and cycle detection.',
      90,
      7
    ),
    (
      'sub_batstateu_cs201',
      4,
      3,
      'les_batstateu_cs201_sorting',
      'Sorting Algorithms and Their Trade-offs',
      $html$<h2>Overview</h2><p>The lesson surveys insertion sort, merge sort, and quicksort, comparing time and space complexity, stability, and behavior on nearly-sorted data, and closes with why comparison sorting cannot beat O(n log n).</p><h3>Workshop</h3><ul><li>Trace each algorithm on the same input and count comparisons.</li><li>Contrast merge sort's O(n) extra space with quicksort's in-place partitioning.</li><li>Discuss pivot choice and quicksort's O(n^2) worst case.</li></ul><p>Students submit a recommendation of which sort to use for three described workloads, defended with complexity and stability arguments.</p>$html$,
      'Compare classic sorting algorithms by complexity, stability, and space; trace partition and merge steps; state the comparison-sort lower bound.',
      90,
      7
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
      'lp_batstateu_cs201_bscs2a_2026',
      'sub_batstateu_cs201',
      'sec_batstateu_bscs_2a',
      'Data Structures & Algorithms - BSCS 2A',
      '2026-2027',
      'semester',
      '2026-06-09'::date,
      '2026-10-17'::date,
      'First semester plan covering complexity analysis, linear structures, trees, heaps, hashing, graphs, and sorting, with a weekly three-hour laboratory.'
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
join public.users on users.publicid = 'usr_ramon_villanueva'
join public.schools on schools.public_id = 'sch_batstateu'
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
    ('lp_batstateu_cs201_bscs2a_2026', 1, '09:00'::time, '10:30'::time, 'lecture'),
    ('lp_batstateu_cs201_bscs2a_2026', 3, '09:00'::time, '10:30'::time, 'lecture'),
    ('lp_batstateu_cs201_bscs2a_2026', 5, '13:00'::time, '16:00'::time, 'laboratory')
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
  where lesson_plans.public_id in ('lp_batstateu_cs201_bscs2a_2026')
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
  where subjects.public_id in ('sub_batstateu_cs201')
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
  'college-cs201-' || plan_public_id || '-' || slot_sequence,
  'college-cs201-' || plan_public_id || '-' || slot_sequence,
  case
    when slot_sequence % 12 = 0 then 'Midterm Exam: ' || subject_title
    when slot_sequence % 7 = 0 then 'Machine Problem: ' || subject_title
    when slot_sequence % 5 = 0 then 'Quiz: ' || subject_title
    else lesson_title
  end,
  case
    when slot_sequence % 12 = 0 then 'Major periodic assessment with checking and feedback time.'
    when slot_sequence % 7 = 0 then 'Graded programming task aligned with the current unit.'
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
    'seed_college',
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
  where public_id in ('lp_batstateu_cs201_bscs2a_2026')
);

with plan_subjects as (
  select lesson_plan_id, subject_id
  from public.lesson_plans
  where public_id in ('lp_batstateu_cs201_bscs2a_2026')
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
  where public_id in ('lp_batstateu_cs201_bscs2a_2026')
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
  where lesson_plans.public_id in ('lp_batstateu_cs201_bscs2a_2026')
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
      'act_batstateu_cs201_stack_mp',
      'sub_batstateu_cs201',
      2,
      'Machine Problem: Expression Evaluator',
      'performance_task',
      'project',
      'Laboratory machine problem implementing a stack-based infix-to-postfix converter and evaluator.',
      '{"group_size":1,"duration_minutes":180,"deliverables":["source code","test cases","short write-up"]}'::jsonb,
      array['project_brief','rubric'],
      'Require handling of parentheses, operator precedence, and at least five instructor-supplied test expressions.',
      'Include rubric criteria for correctness, code quality, and edge-case handling.',
      'Students build a command-line expression evaluator that converts infix input to postfix with the shunting-yard algorithm and evaluates it with a stack, submitting code, tests, and a brief design note.'
    ),
    (
      'act_batstateu_cs201_bst_quiz',
      'sub_batstateu_cs201',
      3,
      'Trees and Heaps Long Quiz',
      'written_work',
      'quiz',
      'Quiz covering binary tree traversals, BST operations, and heap index arithmetic.',
      '{"items":25,"duration_minutes":60,"item_mix":["multiple_choice","tracing","short_answer"]}'::jsonb,
      array['quiz','answer_key'],
      'Include at least two traversal-tracing items and one two-child BST deletion.',
      'Provide concise worked solutions for the answer key.',
      'A 25-item long quiz asking students to trace tree traversals, perform BST insertions and deletions, and compute parent and child indices in an array-backed heap.'
    ),
    (
      'act_batstateu_cs201_graph_lab',
      'sub_batstateu_cs201',
      4,
      'Graph Traversal Laboratory Exercise',
      'performance_task',
      'activity',
      'Guided laboratory exercise implementing BFS and DFS over an adjacency list.',
      '{"group_size":2,"duration_minutes":180,"deliverables":["working traversal code","traversal order log","reflection questions"]}'::jsonb,
      array['lab_guide','rubric','feedback_form'],
      'Use the campus building map dataset so traversal orders are verifiable by hand.',
      'Include a rubric that scores correctness of traversal order, code structure, and the written reflection.',
      'Pairs implement breadth-first and depth-first search over an adjacency-list campus map, log the visit order from a chosen source, and answer reflection questions comparing the two traversals.'
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
join public.users on users.publicid = 'usr_ramon_villanueva'
join public.schools on schools.public_id = 'sch_batstateu'
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
      'University Intramurals',
      'Campus-wide sports festival; classes are suspended while colleges compete.',
      '2026-08-19'::date,
      '2026-08-21'::date,
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
join public.schools on schools.public_id = 'sch_batstateu'
join public.users on users.publicid = 'usr_ramon_villanueva'
where not exists (
  select 1
  from public.school_calendar_events existing
  where existing.school_id = schools.school_id
    and existing.title = event_seed.title
    and existing.start_date = event_seed.start_date
    and existing.end_date = event_seed.end_date
);

commit;
