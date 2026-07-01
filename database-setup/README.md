# Database setup

Apply these SQL files **in strict numeric order** against a fresh Supabase /
Postgres project. The files are idempotent (`if not exists`, `drop policy if
exists`, guarded `do $$` blocks) so re-running the full set is safe.

## Canonical apply order (00 → 12)

| Order | File | Purpose |
|------:|------|---------|
| 00 | `00_users.sql` | `users` table, roles, base auth RLS, `handle_new_auth_user` |
| 01 | `01_enums.sql` | Shared enum types |
| 02 | `02_shared_functions.sql` | Common helpers (`set_updated_at`, etc.) |
| 03 | `03_schools.sql` | `schools`, `user_schools`, `sections`, `user_sections` |
| 04 | `04_academics.sql` | `courses`, `user_courses`, `subjects`, `units`, `chapters`, `lessons`, `plan_subject_content` |
| 05 | `05_planning.sql` | `lesson_plans`, `slots`, `blocks`, `school_calendar_events` |
| 06 | `06_rls.sql` | Row-level-security policies for all of the above |
| 07 | `07_activities.sql` | Activity / library tables |
| 08 | `08_billing.sql` | `subscriptions`, `usage_quotas`, webhook idempotency, quota RPCs |
| 09 | `09_onboarding.sql` | Onboarding columns + flows |
| 10 | `10_billing_v2.sql` | Tier limits, daily AI quota (`period_month` → `period_day`), `billing_events` |
| 11 | `11_departments.sql` | Departments, join codes, school-admin RPCs |
| 12 | `12_versions.sql` | Lesson-plan version history |

> Ordering matters: `10_billing_v2.sql` renames `usage_quotas.period_month` to
> `period_day`, and `04_academics.sql` must create `courses` before `subjects`
> references it. Do not reorder.

## Verifying a clean apply

Run `./apply.sh "$DATABASE_URL"` (see below) against a **scratch** database. It
applies 00 → 12 in order and fails on the first error. CI runs this on every PR.

## Seeds (`seeds/dev-only/`)

`seeds/dev-only/` contains **development-only** demo/test data with known
passwords. These are quarantined out of the migration path and are guarded so
they refuse to run unless you explicitly opt in. **Never apply them to
production.** See `seeds/dev-only/README.md`.
