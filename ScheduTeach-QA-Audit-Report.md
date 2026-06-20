# ScheduTeach (SchEDU Teach) — Production Readiness Review

**Comprehensive QA, UX/UI, Security & Database Audit**

| | |
|---|---|
| **Product** | ScheduTeach — teacher lesson-planning & scheduling app (Expo / React Native, Android-first) |
| **Reviewer role** | Senior QA Engineer · Product Manager · UX Designer · Teacher |
| **Review date** | 20 June 2026 |
| **Scope** | Full source + full database schema (`apps/teach`, `supabase/functions`, `database-setup/`) |
| **Verdict** | **Alpha — Do Not Launch publicly (Internal Testing Only)** |
| **Production Readiness Score** | **24 / 100** |

---

## Methodology & Scope Note

This is a full-source and full-schema audit. Every route, component, library, edge function, and all sixteen SQL files were traced end to end (UI → API → Database). The application was **not** executed on a physical device during this review, so pixel-level visual findings and live-network behaviour are inferred from the source code; every such inference is cited to `file:line` so it can be confirmed on device. Findings that strictly require runtime observation (exact contrast ratios, real-device reflow, animation behaviour) are flagged "verify on device."

**The single most important framing fact:** ScheduTeach is **not** a Learning Management System. It is a **teacher lesson-planning and scheduling tool** built around the Philippine DepEd academic calendar. The classic LMS feature set — students, parents, attendance, grade entry, messaging, announcements — **does not exist in this codebase**: there is no `students`, `parents`, `attendance`, `grades`, `enrollments`, `announcements`, or `messages` table, and no UI for any of them. This report scores what is actually built and reports the rest as a feature gap, rather than inventing reviews of screens that do not exist.

---

## A. Executive Summary

**What is built:** email/password and (currently broken) OAuth authentication, an onboarding wizard, subjects / chapters / lessons CRUD, a syllabus auto-parser, a DepEd-aware scheduling algorithm, a month + daily calendar, AI activity generation (Gemini), a "library" of written works / performance tasks / exams, lesson-plan versioning and rebalancing, a tiered billing system (PayMongo / Stripe webhooks plus quota-enforcing database functions), and a read-only school-admin dashboard.

The engineering beneath the billing/quota layer and the scheduling algorithm is genuinely sophisticated. However, the application is **not launch-ready**. There is a **critical privilege-escalation vulnerability**, **core authentication flows (username login, password reset, OAuth) are broken**, **payments do not work in the launch market (Philippines)**, **dark mode is unusable on several core screens**, and a number of headline features (vacancy fill, suspension display, version restore, admin CRUD, add-requirement) are **dead, stubbed, or silently fail**.

| Dimension | Score |
|---|---|
| Production readiness | **24 / 100** |
| Database health | **55 / 100** |
| Accessibility | **28 / 100** |
| Code maintainability | **48 / 100** |
| **Overall stage** | **Alpha** |
| **Launch recommendation** | **Internal Testing Only** |

---

## B. Critical Bugs — Launch Blockers

1. **Privilege escalation — any user can make themselves superadmin.** The RLS policy *"users can update own profile"* (`database-setup/00_users.sql:84-88`) permits a user to update their own row with **no column restriction**, and `role` lives on that table with **no guarding trigger**. Any authenticated user can run `supabase.from('users').update({ role: 'superadmin' }).eq('userid', myId)` and immediately satisfy `is_current_user_admin()`. Exploitable today with nothing but the public anon key.
2. **`units` table has RLS disabled** (`database-setup/06_rls.sql:7-22` omits it) — any authenticated user can read and write all curriculum units across every tenant.
3. **`courses` / `user_courses` tables are never created** — they are referenced by a foreign key (`04_academics.sql:9`), RLS, indexes, and policies, but there is no `CREATE TABLE` anywhere in `database-setup/`. A clean production migration (00 → 11) will **fail**.
4. **Username login is impossible** — the sign-in screen reads `public.users` anonymously (`app/(auth)/index.tsx:45-49`), which RLS forbids; it always returns "Account not found."
5. **Password reset is broken end-to-end** — the reset email deep-links to `auth/update-password`, which does not resolve because `(auth)` is a route group (`app/(auth)/forgot-password.tsx:28`).
6. **OAuth login is broken** — redirects target the unreachable `(auth)/callback` route group and the browser result is never handled (`app/(auth)/index.tsx:34,92-109`).
7. **Payments are non-functional in the launch market (PH)** — the upgrade flow opens a placeholder URL `https://scheduhq.com/...` (`lib/pricing.ts:43,57`); the domain is unregistered and the web paywall is undeployed.
8. **Adding a Written Work / Performance Task requirement always fails** — the insert omits five NOT-NULL columns and violates `blocks_session_pair_check` (`app/(tabs)/plans/plan_detail.tsx:512-520` vs `05_planning.sql:72-78`).
9. **Dark mode is unusable** on `create/activities`, `block-editor`, and the `exam/ww/pt_detail` screens — hardcoded `#111111` / `#FFFFFF` ignore the real dark palette in `constants/colors.ts:10-17`.
10. **Settings can null out the user profile** — a failed load blanks the form (`app/profile/settings.tsx:84-89`) and a subsequent save upserts all-null fields.
11. **Seed / placeholder files create real accounts with hardcoded passwords** (including an `admin`) — `database-setup/placeholder.sql:38` and `09_test_account_seed.sql:48`. If ever applied to production, these are known-credential backdoors.

---

## C. High-Priority Issues

- **Institution "set primary" and "delete" silently fail** — `user_schools` has no UPDATE or DELETE RLS policy (`06_rls.sql:94-105`), so these multi-write flows affect zero rows while the UI reports success.
- **Admin "teachers on Pro" count and tier badges are always wrong** — `subscriptions` has no admin read policy (`08_billing.sql:97-100`), so cross-teacher joins return null.
- **Any school member can manage school-wide calendar events** (`06_rls.sql:464-482`); combined with `join_school_by_code` (no rate limit) this is a cross-user disruption vector.
- **Webhook fail-open** — an unmatched plan/price ID defaults paying users to `tier='free', status='active'` (`paymongo-webhook:127-129`, `stripe-webhook:136-138`).
- **Cross-tenant suspension query** — `getSlotsForDay` filters suspension events only by type and date, not by school/section/subject (`lib/rebalance-service.ts:824-860`).
- **Rebalance re-derives terms and requirement counts from surviving blocks** (`rebalance-service.ts:136-210`), so any delete can re-flow the whole plan and permanently lower requirement counts.
- **DepEd calendar hardcodes a single school year** (2026-2027) with month-boundary terms (`lib/deped-calendar.ts:26-37`); degrades silently afterward.
- **No server-side overlap enforcement** — conflict detection is in-memory editor-only; two devices can double-book a time.
- **"Restore version" is lossy** — it repositions surviving blocks but never re-adds deleted or removes added blocks (`rebalance-service.ts:786-808`), contradicting its own confirmation dialog.
- **Term edits are silently dropped** — `term` is omitted from the `lesson_plans.update` payload (`plan_detail.tsx`).
- **Incomplete JS-injection escaping** into the editor WebView (`library/lesson_editor.tsx:152-153`).
- **Syllabus auto-parser is heuristic and science-biased** — hardcoded vocabulary and OCR typo dictionaries, rewrites sequence numbers (`create/subject.tsx`).
- **`ww_detail` renders any block type** (no `session_category` filter, `library/ww_detail.tsx:196-200`).
- **Sign-up can orphan a half-created account** on profile-update failure and handles duplicate usernames by string-matching the error (`app/(auth)/sign-up.tsx:83-100`).
- **Performance: N+1 and unscoped fetches** — dashboard loads all slots/blocks for all plans every focus; library signs every image individually; subject detail fully reloads on focus and is unvirtualized.
- **No version history in the Library** — all lesson/exam/WW/PT saves are destructive overwrites.

---

## D. Medium-Priority Issues

- Session persistence not explicitly configured (`lib/supabase.ts:18`); verify sessions survive cold start.
- Onboarding/admin route gating is racy (`app/_layout.tsx` and `app/index.tsx` both redirect).
- `ErrorBoundary` only logs to console (no Sentry) and uses dark hardcoded colors with failing contrast.
- Hardcoded tier/feature tables in the paywall and subscription screens can drift from server limits.
- Errors swallowed into empty states across nearly every loader.
- No webhook timestamp/freshness window; replays limited only by event-id idempotency.
- Rate limiting is per-isolate and IP-based on a spoofable `x-forwarded-for` (`_shared/rate-limit.ts`).
- `extract-text` has no rate limit and leaks the extractor URL and upstream error text.
- Admin term-card date math is inverted ("0 days left", wrong progress %) (`(admin)/index.tsx:264-277`).
- Plan status computed differently on dashboard vs plans list.
- AI prompt injection / unbounded input (cost risk) in `generate-activity`.
- Dead buttons & fake controls — plans filter is `() => {}`; the exam stepper is non-pressable `View`s.
- Fabricated demo data shown to real new users (Home, calendar).
- Migration ordering hazard (`09_test_account_seed.sql:123` vs `10_billing_v2.sql:243`).
- `plan_history.tsx` is a 0-byte file (latent crash if routed).
- Inconsistent creation status defaults (draft vs published) across paths.
- Orphaned storage objects on failed inserts.

---

## E. Low-Priority Issues

- No `accessibilityLabel` / `accessibilityRole` on icon-only controls anywhere; toast has no live region.
- WebView remount keyed on `html.length` (fragile).
- Env-var name mismatch in `lib/supabase.ts:6` vs its error message.
- Duplicate helpers (four `formatTime12`, two `todayISO`); pervasive local-vs-UTC date handling.
- Stale scaffolding comments; `@ts-nocheck` on every edge function.
- Cache files written to `cacheDirectory` are never cleaned up.

---

## F. Security Findings

Each finding lists Severity / Impact / Likelihood / Recommendation.

1. **Role self-escalation** — *Critical* / full admin takeover / High (trivial via the public anon key) / add a `BEFORE UPDATE` trigger rejecting `NEW.role <> OLD.role` for non-admins, or move `role` off the user-writable table and `REVOKE UPDATE(role)`.
2. **`units` RLS disabled** — *High* / cross-tenant read/write of curriculum / High / enable RLS and add a subject-membership policy mirroring `chapters`.
3. **Schema not reproducible (courses missing)** — *High (operational)* / production migration fails / High on cutover / add `CREATE TABLE courses/user_courses` or remove the references.
4. **Username-lookup leak risk** — *Medium* / if anyone "fixes" username login by opening anon SELECT on `users`, it leaks emails by username / Medium / resolve username→email via a `security definer` RPC returning an opaque token.
5. **Webhook fail-open + no replay window** — *High / Medium* / revenue loss; stale-but-valid replays accepted / Medium / fail closed on unknown plan/price; reject `|now − t| > 300s`.
6. **Ineffective rate limiting** — *Medium* / per-isolate in-memory + spoofable IP; `extract-text` and `delete-account` unthrottled / Medium / shared store; rely on signature + idempotency, not IP.
7. **Client-side-only admin gating** — *Medium* / any user can render `(admin)` by deep link (RLS otherwise protects data — except finding #1 nullifies that) / Medium / add a server-verified role gate.
8. **Prompt injection / unbounded AI input** — *Medium (abuse, not breach)* / user text overrides the system prompt and can balloon token cost / Medium / cap input length; keep the system prompt authoritative.
9. **Information disclosure** — *Low–Medium* / edge functions echo upstream error `details` and `extractorUrl` to clients / Medium / return generic client errors, log server-side.
10. **Weak password policy** — *Low–Medium* / 8-char minimum only / High to occur / add a strength/breach check.

**Positive confirmations (verified):** webhooks verify HMAC signatures with constant-time comparison and are idempotent; `delete-account` deletes only the authenticated id (no IDOR); quota functions execute as the user (not service role); `subscriptions` / `usage_quotas` / `billing_events` have client INSERT/UPDATE/DELETE revoked. **Aside from finding #1, there is no client-reachable path to self-grant a subscription tier.**

---

## G. Database Audit

**Overall:** the schema is, structurally, the strongest part of the project — consistent `public_id` patterns, thorough indexing, sensible foreign-key `on delete` rules, meaningful `CHECK` constraints, `updated_at` triggers, tier-enforcing `security definer` RPCs, and webhook idempotency tables. It nonetheless carries several serious correctness and security defects.

### Database Findings

| # | Issue | Affected tables | Risk | Recommendation |
|---|---|---|---|---|
| DB-1 | `users` self-update has no column restriction; `role` is unguarded | `users` + all RLS that trusts role | **Critical** | Guard the `role` column (trigger or REVOKE) |
| DB-2 | RLS never enabled | `units` | **High–Critical** | Enable RLS + subject-membership policy |
| DB-3 | Tables referenced but never created | `courses`, `user_courses` | **Critical** (cutover) | Add `CREATE TABLE` or remove references |
| DB-4 | No UPDATE/DELETE policy → set-primary & delete silently fail | `user_schools` | **High** | Add UPDATE/DELETE policies |
| DB-5 | No admin read policy → admin tier data always 0 | `subscriptions` | **High** | Admin read policy or a `security definer` RPC |
| DB-6 | Any member can manage school-wide events | `school_calendar_events` | **High** | Scope writes to creator/admin |
| DB-7 | Webhook defaults unknown plan/price to free | `subscriptions` | **High** | Fail closed |
| DB-8 | Seed/placeholder create known-credential accounts | `auth.users` | **Critical if run in prod** | Quarantine from prod |
| DB-9 | Migration ordering hazard (`period_month` dropped) | `usage_quotas` | **Medium** | Document & enforce 00→11 |
| DB-10 | `is_default` modeling + non-atomic multi-writes | `schools`, `user_schools`, `lesson_plans` | **Medium** | Move to `security definer` RPCs |
| DB-11 | No audit/history except plan rebalance; "restore" lossy | `lesson_plan_versions` and all detail tables | **Medium** | General audit log; fix restore |

### Scalability assessment

- **1,000 users:** fine.
- **10,000 users:** mostly fine; watch the unscoped dashboard fetch and N+1 image signing (both client-side, not DB).
- **100,000 users:** the per-isolate in-memory rate limiter and the `x-forwarded-for`-based webhook limiting must move to a shared store; the RLS helper subqueries are `stable` (cached per-statement) and acceptable. Indexing is good; no materialized aggregates required yet.

**Database Health Score: 55 / 100. Database Production Readiness: Alpha.**

**Required DB changes before launch:** (1) guard `users.role`; (2) enable RLS + policy on `units`; (3) add `courses`/`user_courses`; (4) add UPDATE/DELETE policies on `user_schools`; (5) admin read policy on `subscriptions`; (6) scope `school_calendar_events` writes; (7) make webhooks fail closed; (8) quarantine seed/placeholder from prod; (9) verify migration order; (10) move multi-writes server-side.

---

## H. Per-Screen Scorecard

Scores are 1–10. "Func" reflects whether the screen's actions work end to end (UI → API → DB).

| Screen | Purpose | UX | UI | Func | Headline issues |
|---|---|---|---|---|---|
| Sign-in | Email/username + OAuth | 4 | 6 | **2** | Username login impossible; OAuth dead; no show-password/keyboard submit |
| Sign-up | Register | 5 | 6 | **4** | Duplicate handled by string-match; orphan account on partial failure |
| Forgot / Update password | Reset flow | 5 | 6 | **2** | Reset link deep-links to an unreachable route group |
| Onboarding | 2-step wizard | 6 | 6 | 7 | Skip silently drops input; no curriculum-size validation |
| Home | Upcoming + overview | 7 | 6 | 6 | Shows fabricated demo data to new users; unscoped fetch |
| Calendar (month) | Month grid | 6 | 5 | **3** | Vacancy banner dead; suspended dots never supplied; demo always injected |
| Calendar (daily) | Day timeline + CRUD | 6 | 4 | **4** | Demo days blank except one date; light-mode-only editor; no overlap guard |
| Block editor | Create/edit block | 5 | 3 | 4 | Can't create exam/buffer; Android date picker wrong; hardcoded colors |
| Suspend sheet | Suspend a day | 5 | 6 | **2** | Suspends but never renders as suspended; cross-tenant query |
| Create activity (AI) | AI generator | 6 | **3** | 6 | Unusable in dark mode; orphaned storage on failure; best error handling |
| Create lesson | New lesson | 5 | 6 | 5 | Free-text chapter/lesson numbers; silent "General" chapter |
| Create lesson plan | Build plan | 6 | 4 | 5 | Non-transactional multi-table write → partial/duplicate plans |
| Create subject | Subject + syllabus parse | 6 | 7 | 5 | Heuristic science-biased parser; dev debug alert |
| Library index | Subject grid | 6 | 6 | 5 | N+1 image signing; errors swallowed |
| Subject detail | Chapters/lessons/items | 5 | 6 | **4** | Full reload every focus; unvirtualized; relabel overwrites sort |
| Lesson editor | Rich-text edit | 5 | 5 | 4 | Incomplete JS-injection escaping; destructive overwrite |
| Exam/WW/PT detail | View generated item | 5 | **3** | 4 | Dark-mode broken; `ww_detail` renders any block type; no versions |
| Plans list | Plan cards | 6 | 6 | 5 | Filter button no-op; drops rows missing subject_code |
| Plan detail | Requirements/rebalance | 5 | 5 | **2** | Add requirement always fails; Term edit lost; restore lossy; fake stepper |
| Plan history | Version history | — | — | **0** | 0-byte file — latent crash |
| Profile | Institutions, sign-out | 5 | 6 | **3** | Set-primary & delete silently fail under RLS; new institution hardcoded "university" |
| Institution edit | Edit/delete school | 5 | 6 | **3** | Delete cascade non-atomic & RLS-unsafe; edit not scoped to creator |
| Settings | Profile edit, delete acct | 4 | 6 | **3** | Can null out the profile; no error handling |
| Subscription | My Plan | 6 | 5 | 4 | Hardcoded tier table; PH upgrade is a placeholder URL |
| Admin dashboard | School overview | 5 | 5 | 4 | Term date math inverted; rows look tappable but aren't |
| Admin teachers | Roster | 5 | 6 | **3** | Tier badge always FREE; read-only |
| Admin plans | All plans | 5 | 6 | 4 | Wasted placeholder query; status differs from dashboard; read-only |
| Admin settings | School/depts/join code | 6 | 5 | 6 | "X of Y on Pro" ~always 0; depts CRUD works; no admin sign-out |

**Cross-cutting UI / accessibility:** dark mode broken on several core screens; no accessibility labels on icon-only buttons anywhere; no keyboard submit or show-password on auth; pervasive error-swallowing that disguises failures as "no data."

---

## I. Teacher Workflow Testing

| Workflow | Works? | Notes |
|---|---|---|
| Register | Partial | No password strength; fragile duplicate handling; no confirm-email message |
| Login (email) | ✅ | Fine |
| Login (username) | ❌ Broken | Anon cannot read `users` under RLS |
| Login (Google/Apple/FB) | ❌ Broken | Callback route group unreachable; no result handling |
| Reset password | ❌ Broken | Reset email deep-links to an unreachable route |
| Complete profile | ⚠️ | Can be nulled by save-after-failed-load |
| Create class (institution + section) | ⚠️ | New institution hardcoded "university"; set-primary silently fails |
| Edit class | ⚠️ | Edit not scoped to creator → "saved" while 0 rows change |
| Archive / delete class | ❌ likely fails | Cascade non-atomic; missing RLS DELETE policy |
| Add / edit / import students | ❌ Not implemented | No student model |
| Create / edit / reschedule schedule | ⚠️ | Works, but non-transactional; two different engines |
| Handle conflicts (holidays) | ❌ Visually broken | Compresses schedule but never renders as suspended |
| Create assessments | ✅ (text only) | No points/scoring/structured grading |
| Enter / edit grades, reports | ❌ Not implemented | No grades model |
| Send announcements / contact students/parents | ❌ Not implemented | No communication model |
| Export data / analytics | ❌ Not implemented | No export anywhere |

**Net:** the *planning* workflows are mostly present (with serious bugs). Every *classroom-management* workflow (students, attendance, grading, communication, reporting) is **entirely absent**.

---

## J. Feature Gap Analysis

- **Must-have (missing):** working username/OAuth login and password reset; functional PH payment; export/print a lesson plan; honest empty states; password-strength validation; email-confirmation gating; an admin sign-out path.
- **Should-have:** attendance, gradebook/scoring, student roster, announcements (only if positioning as a classroom platform); admin write/CRUD (currently read-only by design); notification preferences.
- **Nice-to-have:** parent access, analytics dashboards, calendar (.ics) export, collaborative/department plan sharing.

---

## K. Competitive Positioning

As a **planner**, ScheduTeach has a real differentiator: a DepEd-calendar-aware scheduler that auto-distributes lessons, quizzes, performance tasks, and exams, then rebalances around suspensions — plus AI activity generation tied to the curriculum. None of Google Classroom, Canvas, Moodle, or Schoology offers automatic schedule generation as a first-class feature; that is the moat.

Against those platforms it lacks everything classroom-facing (roster, gradebook, submissions, attendance, announcements, parent portal, analytics). This is acceptable **only if** the product is positioned strictly as a teacher's personal planning companion. Decide the positioning before launch and make the marketing match.

---

## L. End-to-End Feature Verification — Stubbed / Fake / Dead

- **Vacancy "fill open slots"** — fully wired UI but `vacancies` is never populated; entire feature unreachable.
- **Suspension display** — suspend writes `school_calendar_events`, but the UI reads suspension state from `metadata.lock_reason`, which that path never sets.
- **Add WW/PT requirement** — insert violates DB constraints; always fails.
- **Restore version** — lossy no-op for adds/deletes.
- **Term edit** — UI updates but the value is never persisted.
- **Plans filter button** — dead (`() => {}`); **exam stepper** — non-pressable `View`s.
- **`plan_history.tsx`** — 0-byte file (latent crash).
- **`components/pdf-extractor.tsx`** — orphaned, superseded screen.
- **`packages/supabase/src/index.ts`** — `export {}` stub → the whole codebase is untyped against the DB.
- **Demo/fake data** shown to real new users (Home, calendar).
- **Admin teachers/plans** — read-only by design.
- **Two scheduling engines** — creation uses the legacy engine; the modular engine that the tests cover is never used to create a plan (only to rebalance, via re-derived rules).

---

## M. Top 50 Improvements Before Launch

1. Guard `users.role` against self-update (trigger or column REVOKE).
2. Enable RLS + membership policy on `units`.
3. Add `CREATE TABLE courses/user_courses`; test a clean 00→11 apply on a scratch DB.
4. Add UPDATE/DELETE RLS policies on `user_schools` (fixes set-primary & delete).
5. Make both webhooks fail closed on unknown plan/price IDs.
6. Fix username login (server-side `security definer` resolver) or remove the username field.
7. Fix the password-reset deep link (add a non-grouped route or correct the redirect).
8. Fix OAuth callback routing + handle the browser auth result.
9. Wire the PH PayMongo paywall, or hard-disable the upgrade UI for PH.
10. Fix the add-WW/PT-requirement insert (required columns + valid subcategory).
11. Make dark mode work on `activities`, `block-editor`, and `exam/ww/pt_detail`.
12. Stop save-after-failed-load from nulling the profile; add real error handling to Settings.
13. Quarantine `placeholder.sql` and the test seed from prod; rotate/remove hardcoded passwords.
14. Verify session persistence across cold start (explicit AsyncStorage adapter).
15. Admin read policy on `subscriptions` (or compute Pro counts via a `security definer` RPC).
16. Scope `school_calendar_events` writes to creator/admin; rate-limit `join_school_by_code`.
17. Make set-primary, institution delete, and plan creation atomic `security definer` RPCs.
18. Pick one scheduling engine; delete or fully wire the other.
19. Implement the vacancy-fill feature or remove its dead UI.
20. Make suspension actually render (unify on `school_calendar_events`).
21. Fix cross-tenant `getSlotsForDay` (filter by school/section/subject).
22. Fix "restore version" to truly restore, or rename it "reposition."
23. Include `term` in the plan update payload.
24. Add a category filter to `ww_detail`.
25. Replace fake demo data with honest empty states + the existing CTA.
26. Wire Sentry and report from `ErrorBoundary` + `componentDidCatch`.
27. Add password-strength validation at sign-up.
28. Add "confirm your email" messaging after sign-up and email change.
29. Add an admin sign-out path.
30. Fix the inverted admin term-date math; unify plan-status logic across screens.
31. Add webhook timestamp tolerance (±5 min).
32. Move rate limiting to a shared store; stop trusting `x-forwarded-for`.
33. Add rate limits to `extract-text` and `delete-account`; stop leaking the extractor URL/upstream errors.
34. Cap AI input length; keep the system prompt authoritative.
35. Generate and ship DB types (`packages/supabase`); remove `@ts-nocheck`.
36. Fix or remove the no-op plans filter and fake exam stepper.
37. Delete or complete `plan_history.tsx` and the orphan `pdf-extractor.tsx`.
38. Scope the dashboard fetch by date range; batch image signing.
39. Virtualize the subject-detail tree.
40. Add accessibility labels/roles to all icon-only controls + a toast live region.
41. Use platform-correct date/time pickers (Android dialog vs inline spinner).
42. Reconcile pricing: PH MAX ₱199 (code) vs ₱149 (business) — pick one.
43. Sync hardcoded paywall/tier tables to server limits or fetch them.
44. Stop `useSubscription` from downgrading to free limits on transient RPC failure.
45. Add lesson-plan export/print (PDF).
46. De-duplicate the four detail screens into one component.
47. Standardize date handling (one local-vs-UTC convention; one helper set).
48. Make creation `status` consistent (draft vs published) across paths.
49. Clean up orphaned storage on failed inserts; sweep the cache directory.
50. Publish privacy policy + Terms of Service; finalize EAS build + provision the prod Supabase project.

---

## N. Scores & Recommendation

| Metric | Score |
|---|---|
| **Production Readiness** | **24 / 100** |
| Database Health | 55 / 100 |
| Accessibility | 28 / 100 |
| Code Maintainability | 48 / 100 |
| **Stage** | **Alpha** |

### Launch Recommendation: **Internal Testing Only — Do Not Launch publicly**

Do not run even a closed beta until at minimum launch-blockers B1–B10 are fixed — above all the role-escalation hole, the `units`/`courses` schema defects, and the three broken login paths. Once those are resolved and PH payments work, this becomes a credible **closed beta** candidate. The scheduler and billing foundations are strong; the surrounding application needs one more focused hardening cycle before thousands of teachers depend on it.

---

*This report reflects static source and schema analysis as of 20 June 2026. Findings marked "verify on device" require runtime confirmation on a physical Android device.*
