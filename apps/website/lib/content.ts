/**
 * All landing-page copy lives here so wording can be tuned in one place.
 * Sourced from the SchEDU Product Guide (Sales & Marketing, June 2026 v1.0).
 */

export const SITE = {
  name: 'SchEDU',
  tagline: 'Smarter lesson planning for teachers',
  // teach.scheduhq.com — web checkout + account portal (login / upgrade).
  appUrl: 'https://teach.scheduhq.com',
  loginUrl: 'https://teach.scheduhq.com/login',
  /** Soft launch: Android, 2026–2027 school year. */
  launchLabel: 'Coming to Android · 2026–2027 school year',
}

export const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'For schools', href: '#schools' },
  { label: 'FAQ', href: '#faq' },
] as const

export const HERO = {
  badge: SITE.launchLabel,
  title: 'Plan your whole term in minutes — not weekends.',
  subtitle:
    'SchEDU turns your subjects and class times into a complete, balanced term schedule — automatically — and turns each lesson into ready-to-use classroom activities. All from your phone.',
  primaryCta: 'Get early access',
  secondaryCta: 'See how it works',
  trust: 'Built for Philippine classrooms · DepEd-aligned',
}

export const PROBLEM = {
  eyebrow: 'The problem we solve',
  title: 'Planning eats teachers’ evenings and weekends.',
  body: 'Teachers — especially those handling several sections — lose hours every week to planning, and their tools don’t talk to each other.',
  points: [
    'You forget which section is on which lesson.',
    'Lessons get prepared, but not easily turned into activities for students.',
    'A schedule is visible, but it doesn’t show the lesson or activity for that class.',
    'The same topic is taught to several sections, each at a different pace.',
    'Most planning tools aren’t built for quick phone use during the school day.',
  ],
  outcome: 'The result: planning spills into evenings and weekends, and prep quality suffers. SchEDU removes that load.',
}

export const HEADLINE_FEATURE = {
  eyebrow: 'The headline',
  title: 'A complete term, planned for you.',
  body: 'Enter your subject, the days the class meets, and a few requirements — how many quizzes, performance tasks, and exams. SchEDU builds the entire term: lessons paced sensibly, quizzes spaced out, performance tasks and exams placed in the right order, with review buffers and holidays respected.',
  benefit:
    'What used to take a weekend takes minutes — and the result is balanced, not just full.',
  inputs: ['Subject & class days', 'Quizzes', 'Performance tasks', 'Exams'],
}

export interface Feature {
  title: string
  body: string
  benefit: string
}

export const FEATURES: Feature[] = [
  {
    title: 'Know exactly what’s next',
    body: 'Open the app and the first thing you see is the next class, the section, the time, and the lesson to teach — no digging through menus.',
    benefit: 'Walk into every class prepared, and never lose track of where each section is.',
  },
  {
    title: 'A clean library of every subject and lesson',
    body: 'Every subject, unit, chapter, and lesson lives in one organized library — reusable term after term, year after year.',
    benefit: 'Prep is never started from scratch. Good lessons get saved once and reused forever.',
  },
  {
    title: 'Turn any lesson into an activity or exam — automatically',
    body: 'From any lesson, SchEDU automatically drafts quizzes, written work, performance tasks, and exams — the items and instructions included. Export them ready to hand out.',
    benefit: 'The hardest part of prep — making the actual activity or exam — gets faster and easier.',
  },
  {
    title: 'Track every plan and every section',
    body: 'All lesson plans in one place, each showing its status and completion. See at a glance which sections are ahead, on track, or need attention.',
    benefit: 'Full visibility across a real teaching load, not just a single class.',
  },
  {
    title: 'Start any time — even mid-term',
    body: 'Joining at the start of the year? Picking up a class halfway through? SchEDU asks where you are and plans only what’s ahead.',
    benefit: 'No awkward setup, no re-doing past work — useful from day one, whenever that day is.',
  },
  {
    title: 'Create anything in a tap',
    body: 'Lesson plans, subjects, lessons, and activities — all created from one simple menu, built for the phone in a teacher’s pocket.',
    benefit: 'The whole planning workflow lives in one app.',
  },
]

/** Secondary capability grid — the rest of what the app does. */
export interface MoreFeature {
  icon: string
  title: string
  body: string
}

export const MORE_FEATURES: MoreFeature[] = [
  {
    icon: 'CalendarRange',
    title: 'Monthly & daily views',
    body: 'See the whole month at a glance, or zoom into a single day’s timeline of classes.',
  },
  {
    icon: 'CalendarCog',
    title: 'Stay in control of the plan',
    body: 'SchEDU builds the schedule, but it’s yours — move, reschedule, or suspend any class.',
  },
  {
    icon: 'PartyPopper',
    title: 'Holidays & special dates',
    body: 'Holidays, exam dates, and special days are respected automatically when planning.',
  },
  {
    icon: 'FileDown',
    title: 'Export to Word & PDF',
    body: 'Turn any activity or exam into a Word or PDF document, ready to print and hand out.',
  },
  {
    icon: 'ScanText',
    title: 'Import from PDFs & photos',
    body: 'Pull text from existing PDFs and images to build lessons and activities faster.',
  },
  {
    icon: 'LayoutTemplate',
    title: 'Match your template',
    body: 'Upload a template so generated documents follow your school’s existing format.',
  },
  {
    icon: 'Search',
    title: 'Search & smart filters',
    body: 'Find any plan or lesson fast, and filter by Active, Draft, Review, or Upcoming.',
  },
  {
    icon: 'Users',
    title: 'Department dashboard',
    body: 'Department heads get an overview of every teacher’s plans and progress in one place.',
  },
  {
    icon: 'GraduationCap',
    title: 'DepEd & college terms',
    body: 'Plans on the DepEd school-year calendar, or college prelim–midterm–final terms.',
  },
  {
    icon: 'History',
    title: 'Plan history',
    body: 'Keep past terms and plans on record, so nothing good is ever lost between years.',
  },
  {
    icon: 'Palette',
    title: 'Color-coded subjects',
    body: 'Every subject gets its own color, so a full week is readable in a single glance.',
  },
  {
    icon: 'Moon',
    title: 'Dark mode',
    body: 'A full dark theme for late-night planning that’s easy on the eyes.',
  },
]

export const DIFFERENTIATORS = [
  {
    title: 'It builds the schedule for you',
    body: 'Most tools are empty boxes you fill in. SchEDU does the planning.',
  },
  {
    title: 'It speaks DepEd',
    body: 'Plans on the DepEd school calendar and balances Written Work, Performance Tasks, and exams — not a generic to-do list.',
  },
  {
    title: 'Balanced, not just full',
    body: 'Quizzes are spaced, exams are ordered, buffers and holidays respected.',
  },
  {
    title: 'Built for many sections',
    body: 'Each section is tracked separately, at its own pace.',
  },
  {
    title: 'Mobile-first',
    body: 'Made for use during the school day, between classrooms.',
  },
  {
    title: 'Plan to activity, end to end',
    body: 'Lessons become activities and exams in the same app — planning and prep, together.',
  },
]

/** Comparison table — rows are capabilities, columns are alternatives. */
export const COMPARISON = {
  columns: ['Paper / forms', 'Calendar app', 'Spreadsheet', 'Generic LMS', 'SchEDU'],
  rows: [
    { label: 'Builds your whole term for you', values: ['no', 'no', 'no', 'no', 'yes'] },
    { label: 'Balances Written Work, Performance Tasks & exams', values: ['no', 'no', 'partial', 'no', 'yes'] },
    { label: 'Follows the DepEd school-year calendar', values: ['partial', 'no', 'no', 'no', 'yes'] },
    { label: 'Tracks multiple sections separately', values: ['partial', 'partial', 'partial', 'yes', 'yes'] },
    { label: 'Turns lessons into activities & exams automatically', values: ['no', 'no', 'no', 'partial', 'yes'] },
    { label: 'Works mobile-first, during the school day', values: ['no', 'partial', 'no', 'partial', 'yes'] },
  ] as { label: string; values: ('yes' | 'partial' | 'no')[] }[],
  footnote:
    '“Other tools store your plan. SchEDU builds it — the way Filipino teachers already pace and grade.”',
}

export const AUDIENCE = [
  { who: 'Subject teachers', gets: 'Plan and track several sections of the same subject without mixing up progress.' },
  { who: 'Class advisers', gets: 'A clearer, more predictable view of daily teaching responsibilities.' },
  { who: 'New teachers', gets: 'A ready-made, structured term to follow — less guesswork, more confidence.' },
  { who: 'Busy teachers', gets: 'A phone-first view to check what’s next between classes.' },
  { who: 'Departments & schools', gets: 'More consistent lesson and activity planning across teachers — without a complicated system.' },
]

export const STEPS = [
  { title: 'Create a free account', body: 'Download SchEDU on Android and sign up in seconds.' },
  { title: 'Add a subject and class days', body: 'Tell SchEDU what you teach and when the class meets.' },
  { title: 'Let SchEDU build the term', body: 'A complete, balanced schedule appears — paced, spaced, and ordered.' },
  { title: 'Teach from it', body: 'Check what’s next each day, and turn lessons into activities as you go.' },
  { title: 'Upgrade when you need more', body: 'Move to Pro or Max from the web whenever you need more capacity.' },
]

export const FAQS = [
  {
    q: 'Isn’t this just a calendar?',
    a: 'A calendar is empty until you fill it. SchEDU builds the schedule for you and keeps lessons, sections, and activities connected.',
  },
  {
    q: 'Do I have to rebuild all my plans?',
    a: 'No — you set up a subject once, SchEDU lays out the whole term, and you adjust only what you want.',
  },
  {
    q: 'I teach a lot of sections. Will it keep up?',
    a: 'That’s exactly who it’s for — each section is tracked separately, at its own pace.',
  },
  {
    q: 'I’m joining mid-year. Is that a problem?',
    a: 'Tell SchEDU where you are and it plans only what’s ahead — nothing to redo.',
  },
  {
    q: 'Is it expensive?',
    a: 'It’s free to start. Paid plans begin at ₱99/month when you need more, and you can cancel anytime.',
  },
  {
    q: 'When and where can I get it?',
    a: 'SchEDU soft-launches on Android for the 2026–2027 school year. Join early access to be notified the moment it’s available.',
  },
]

export const FINAL_CTA = {
  title: 'Start free on Android — plan your whole term today.',
  subtitle: 'Less time planning. More time teaching.',
  cta: 'Get early access',
}

export const SCHOOLS = {
  eyebrow: 'For departments & schools',
  title: 'Consistent, balanced planning across every teacher.',
  body: 'SchEDU gives your teachers a consistent, balanced way to plan — without forcing a heavy system on them. Everyone’s plans follow sensible pacing, so you get more predictable, higher-quality preparation across sections. Mobile-first, easy to adopt, and free for teachers to try.',
}

export const FOOTER = {
  blurb: 'Smarter lesson planning for teachers. Plan your whole term in minutes — not weekends.',
  columns: [
    {
      title: 'Product',
      links: [
        { label: 'Features', href: '#features' },
        { label: 'Pricing', href: '#pricing' },
        { label: 'How it works', href: '#how-it-works' },
        { label: 'For schools', href: '#schools' },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Log in', href: SITE.loginUrl },
        { label: 'Manage plan', href: SITE.appUrl },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy', href: '/privacy' },
        { label: 'Terms', href: '/terms' },
      ],
    },
  ],
}
