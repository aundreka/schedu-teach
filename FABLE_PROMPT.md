# schEDU — Production-Readiness Design & Build Prompt (for Fable)

> Paste this whole file as the prompt. Run it **inside the repo** so the agent can read
> the token files and `ScheduTeach-QA-Audit-Report.md`.

---

## ROLE
You are a senior product designer + React Native engineer. Your job is to take an
existing, functional-but-rough Expo/React Native app from "alpha" to genuinely
production-ready — with a cohesive, modern visual design system, real graphics (not
text + emoji), polished UI, delightful and purposeful animations, rock-solid UX, and
every feature working end to end. **Design quality is the #1 priority, closely followed
by functional robustness.**

## THE PRODUCT
schEDU (aka ScheduTeach): a mobile lesson-planning & scheduling app for Philippine
DepEd teachers across all levels — elementary, junior high, senior high, and college.
Android-first (also iOS). The differentiators are (1) a DepEd-calendar-aware scheduler
that auto-distributes lessons/quizzes/performance-tasks/exams across the school year and
rebalances around holidays, and (2) AI activity generation tied to the curriculum. It is
a teacher's personal planning companion — **NOT** an LMS (no students/grades/attendance).

---

## DESIGN PHILOSOPHY — read twice, this is the point of the engagement
The app currently looks like a functional prototype: monolithic forms, boxes inside
boxes, and uneven polish. I want it to feel **MODERN, INTENTIONAL, OPINIONATED, and
PRETTY** — the calm confidence of Linear / Things / Cron / Notion, with a native iOS
feel and genuine visual delight. Not "more decoration" — better decisions.

**ART DIRECTION (locked): Friendly geometric + soft gradients.**
Clean rounded shapes, consistent ~2px line weight, generous corner radius. Brand green
(#22C55E) as the primary accent plus a small warm secondary palette. Subtle gradients.
Flat geometric spot illustrations (no mascot/characters required). Calm, modern,
professional, approachable. Everything themeable SVG so it stays crisp and recolors for
light/dark. Cohesion over quantity.

Principles, in priority order:

**1. FUNNELS, NOT FORMS.** Replace big scroll-everything screens with guided,
step-by-step flows — like a well-designed quiz funnel: ONE decision per step, a clear
progress indicator, big tap targets, momentum. Applies to ALL create flows:
- Create Subject → Step 1: name + level/section → Step 2: upload syllabus (make this the
  hero moment) → Step 3: review & edit the auto-parsed curriculum.
- Create Lesson / Lesson Plan / Activity → same staged, one-thing-at-a-time pattern.
  (Create Activity already has steps — extend that language everywhere.)
The user should always feel "I do this one thing, then the next," never "here's a wall
of 12 fields, good luck."

**2. KILL NESTED CONTAINERS.** Several screens are card-inside-card-inside-card
(subscription/My Plan, plan detail, activity detail). Cap surface nesting at ONE level of
elevation. Group with WHITESPACE, dividers, and typographic hierarchy — not by drawing
another rounded box around everything. Flat, calm, breathable.

**3. INTENTIONAL HIERARCHY per screen.** Decide the ONE thing each screen is for, make it
obvious, and give it one primary action; everything else recedes (progressive
disclosure). Example — Plan Detail should open with a confident summary header + a
*visualized* schedule (a real week/timeline), not a grid of stat-chips and a row of
equal-weight buttons stuffed in nested cards.

**4. RHYTHM & RESTRAINT.** A real type scale (don't mix 5 near-identical sizes), a
spacing scale used consistently, generous margins, few accent colors, purposeful use of
the brand green (primary actions + success — not everywhere).

**5. MOTION WITH MEANING.** Animations guide attention and reward action (funnel step
transitions, list stagger, spring sheets, success moments), never just move things
around. Fast, 60fps, reduce-motion aware.

**6. REAL GRAPHICS, NOT TEXT + EMOJI.** Build ONE consistent illustration system (in the
locked art direction) and apply it throughout:
- **Empty & error states:** every empty/error screen gets a custom spot illustration
  (empty library, no-plans-yet, no-results, offline) instead of a lone sentence.
- **Onboarding / first-run & paywall:** hero illustrations that sell the value
  (auto-scheduling, AI activities, DepEd calendar). My Plan/upgrade should feel
  aspirational — tier cards with iconography and a subtle hero, not a plain pricing table.
- **Subject & library cards:** elevate the flat colored squares → cover art / generative
  patterns / gradient + glyph per subject color, rich and scannable at a glance.
- **Schedule as a graphic:** calendar and Plan Detail schedule should be a real designed
  timeline/visualization (color-coded blocks, a "today" marker, term/quarter progress) —
  a picture of the school year, not a text list.
- **Data & progress:** usage/limits, "Week X of Term Y," plan progress as designed
  progress rings / bars / small charts, not just "1/20" text.
- **Moments of delight:** tasteful motion-graphics for success beats — first plan
  generated, activity created, plan completed (a short Lottie / confetti / animated
  checkmark), used sparingly so it stays special.
- **Iconography:** one consistent icon set (standardize on @expo/vector-icons / Ionicons),
  replacing any emoji and mismatched icons.

**Tech for graphics (keep it performant & bundle-friendly):** react-native-svg for
vector illustrations/patterns (crisp, themeable, tiny); expo-image for any raster
(caching + blurhash placeholders); expo-linear-gradient for gradients;
lottie-react-native for delight, used sparingly. Prefer scalable SVG so illustrations
recolor with light/dark theme.

> Deliver a short **design-direction proposal** (words + token changes + 2-3 redesigned
> screens described in text — especially a Create funnel and Plan Detail — plus 2-3
> example spot illustrations and one subject-card treatment) and get my sign-off **before**
> mass edits.

---

## TECH STACK & WHERE THINGS LIVE (read these first)
- Expo SDK 54, React Native, TypeScript, expo-router. pnpm monorepo; **THE APP IS `apps/teach`**.
- Backend is Supabase (Postgres + RLS + edge functions). **DO NOT** change the DB schema,
  RLS policies, or edge-function request/response contracts — treat the backend as fixed.
- Design tokens already exist — extend these, don't fork them:
  - `apps/teach/constants/colors.ts` (light/dark palettes; brand green tint #22C55E)
  - `apps/teach/constants/fonts.ts` (Typography, Spacing, Radius scales)
  - `apps/teach/context/theme.ts` (`useAppTheme()` → `{ colors, scheme }`)
  - Animations use `react-native-reanimated`. Reusable `components/AnimatedPressable`.
- Screens (each is a target for the UI/UX pass):
  - **Auth:** `(auth)/index` (sign in), `sign-up`, `forgot-password`, `update-password`, `callback`
  - **Home:** `(tabs)/index`   **Calendar:** `(tabs)/calendar/{index=month, daily}`
  - **Library:** `(tabs)/library/{index=subject grid, subject_detail, lesson_detail, lesson_editor, ww_detail, pt_detail, exam_detail}`
  - **Plans:** `(tabs)/plans/{index, plan_detail}`
  - **Create:** `(tabs)/create/{subject (syllabus upload), lesson, lessonplan, activities}`
  - **Billing/Profile:** `profile/{index, settings, subscription (My Plan), institution}`
  - **Admin (read-only):** `(admin)/*`
- **READ FOR CONTEXT:** `ScheduTeach-QA-Audit-Report.md` (full QA/UX/a11y audit with
  file:line issues) and the `todo` file at repo root.

## CURRENT STATE (honest)
Works, but visually inconsistent and rough. Recurring problems to fix:
- Inconsistent visual language (spacing, type scale, radii, shadows, color usage drift
  screen to screen) — doesn't feel like one designed product.
- Dark mode broken/partial on several screens — hardcoded hex instead of theme tokens.
- Accessibility gaps: icon-only buttons with no label/role; no toast live region; some
  controls not exposed to the a11y tree.
- Errors swallowed into blank/empty screens instead of real empty/error/loading states.
- Animations inconsistent and occasionally janky; not systematic.
- Rich-text lesson content in a WebView (fragile); some lists unvirtualized + reload on focus.
- Mostly text + emoji where there should be real graphics/illustrations.

---

## YOUR MISSION (in this order)
1. **AUDIT + DESIGN DIRECTION (deliver before mass edits):** walk every screen; write a
   concise UI/UX audit grouped by screen cluster. Propose the tightened design system in
   words + concrete token changes + a component spec for primitives (Button, Card, Input,
   Chip/Badge, Sheet/Modal, ListRow, SectionHeader, EmptyState, Toast, Skeleton) + the
   illustration/asset system (with samples). Get sign-off, then execute.
2. **DESIGN-SYSTEM IMPLEMENTATION:** build/consolidate reusable primitives so screens
   compose from them. Eliminate hardcoded colors — everything flows from theme tokens and
   is flawless in BOTH light and dark mode. One consistent spacing/type/radius/shadow language.
3. **SCREEN-BY-SCREEN UI/UX UPGRADE** (Auth → Home → Calendar → Library → Plans → Create →
   Billing/Profile): elevate hierarchy, spacing, typography; add the graphics system;
   every screen handles loading (skeletons) / empty (illustrated + CTA) / error
   (retryable) explicitly. Rebuild the Create flows as guided funnels; de-nest Plan Detail
   and My Plan.
4. **ANIMATION & MICRO-INTERACTION LAYER:** consistent motion system — route transitions,
   list stagger, press feedback, spring sheets, tab changes, success/error moments,
   pull-to-refresh, skeleton shimmer. Purposeful and fast; 60fps on mid-range Android;
   respect reduce-motion.
5. **FUNCTIONALITY & ROBUSTNESS:** fix dead/stubbed/broken controls; guard against
   crashes (undefined data, missing imports, null profiles); standardize date/time
   handling; de-duplicate near-identical screens; validate all forms with friendly errors.
6. **ACCESSIBILITY & PERFORMANCE:** accessibilityLabel/Role on all interactive elements;
   WCAG AA contrast; dynamic-type friendly; toast live regions; virtualize long lists;
   batch/cache network (no N+1 image signing, no full reloads on focus).

## GUARDRAILS
- Keep the brand (green, "schEDU", the calendar-S logo). Modernize, don't rebrand.
- No hardcoded colors — theme tokens only; light + dark must both be flawless.
- Match existing expo-router structure, file naming, and RN idioms. TypeScript strict; do
  not add `@ts-nocheck`. **Don't touch Supabase schema/RLS or edge-function contracts.**
- Keep changes reviewable: small, self-contained commits per screen/cluster with a
  one-line rationale each. Verify on a simulator/device in BOTH light and dark before moving on.

## DEFINITION OF DONE (production-ready)
- [ ] One coherent design system; every screen composes from shared primitives.
- [ ] Real graphics/illustrations throughout (empty states, onboarding, paywall, subject
      cards, schedule viz, progress) — no emoji-as-UI, no bare text blocks.
- [ ] Create flows are guided funnels; Plan Detail / My Plan de-nested and intentional.
- [ ] Light AND dark mode perfect on every screen; zero hardcoded colors.
- [ ] Consistent, tasteful motion system; nothing janky; reduce-motion respected.
- [ ] Every screen has proper loading / empty / error states.
- [ ] No crashes; every control works; forms validate with friendly errors.
- [ ] Accessibility labels/roles + AA contrast throughout; long lists virtualized.
- [ ] Smooth on a mid-range Android device.

> Start by exploring the repo (`apps/teach`, the token files, and
> `ScheduTeach-QA-Audit-Report.md`), then give me the audit + design-direction proposal.
> Do not begin mass edits until we align on direction.

---

## APPENDIX — KNOWN LANDMINES (found while working in this repo; verify + don't repeat)

**CRASH-PRONE PATTERNS**
- Reanimated exports used without importing them = hard crash. `create/subject.tsx` and
  `create/lesson.tsx` used `FadeInDown` with no import → "Property 'FadeInDown' doesn't
  exist" render crash (already patched). SWEEP every screen for the same class of bug
  (any Reanimated entering/exiting animation or helper used but not imported).
- `components/AnimatedPressable` GOTCHA: its `style` prop goes to the OUTER Pressable, but
  children render inside an INNER `Animated.View`. So any flex/row LAYOUT for the children
  must be passed via `animatedStyle`, NOT `style` — otherwise children stack vertically.
  This silently broke the Home "Upcoming/Overview" chevron (it wrapped below the title).
  Check every AnimatedPressable usage.
- Guard against undefined/null data crashing screens (null profile, empty lists, missing
  lesson content).

**DARK MODE (currently broken/partial)**
- Source of truth: `apps/teach/constants/colors.ts` (light + dark palettes exist; dark is
  underused). Theme via `context/theme.ts` `useAppTheme()`.
- Hunt hardcoded hex used as text/background and replace with theme tokens. Known
  offenders: `components/calendar/block-editor.tsx` (had #1F2937 / #111827 text →
  dark-on-dark; patched at usage but audit fully), and the library detail screens
  `library/{ww_detail,pt_detail,exam_detail}.tsx` + `create/activities.tsx` (the
  deliberately white "paper" document preview there is intentional — leave that, fix the chrome).

**FUNCTIONAL BUGS / ROBUSTNESS**
- Errors get swallowed into blank/empty screens across most loaders. Home in particular
  spins FOREVER if a fetch fails (no error state). Add explicit loading / empty /
  error(retry) states everywhere.
- Subscription/tier context does NOT refetch on user change — after switching accounts
  in-app the tier badge/My Plan shows the previous user's tier until a full app reload.
  Refetch on auth-state change.
- `library/{ww_detail,pt_detail,exam_detail}.tsx` are near-duplicate screens — unify into
  one component.
- Lesson rich text renders in a WebView keyed on html length → fragile remounts and a
  blank-then-content flash. Make it robust (or move to a native rich renderer).

**PERFORMANCE**
- Library index signs each image individually (N+1); `library/subject_detail.tsx` fully
  reloads on every focus and its tree isn't virtualized. Batch/cache + virtualize.

**ACCESSIBILITY / QUALITY**
- Icon-only buttons lack accessibilityLabel/Role; toast has no live region; several text
  controls (bottom-tab labels, "Sign Out", the library "Current" filter) are plain RN
  `<Text>` inside Pressables and aren't exposed to the accessibility tree (also breaks
  automated UI testing). Fix labels/roles across the app.
- New/empty users are shown fabricated demo data on Home and the calendar — replace with
  honest, illustrated empty states + the existing "create your first plan" CTA.
- Screen push transitions sometimes render mid-slide (jank). Standardize a transition config.

**HARD BOUNDARY**
- The Supabase schema, RLS policies, and edge-function contracts are FIXED and already
  hardened (a prior pass fixed an RLS infinite-recursion bug, webhook fail-open, etc.).
  Do NOT modify the database or edge functions — treat the backend as a stable contract.
