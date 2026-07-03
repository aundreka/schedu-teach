# Launch operations checklist

Operational (non-code) steps required to take ScheduTeach to production.
Updated 2026-07-03 after the automated completion pass: everything reachable
from the repo + Supabase access token is done; the remaining items need
third-party dashboard credentials or a human decision.

Production Supabase project: **schedu-prod** (`rlaqermqpykxazfyfnpq`,
ap-southeast-1). The dev project remains **schedu** (`dqjfnmomvkxetzcescrf`).

## Database

- [x] Provision a dedicated **production** Supabase project — `schedu-prod` exists
      and is healthy.
- [x] Apply migrations in order (canonical order 00 → 13, see
      `database-setup/README.md`). Applied clean on 2026-07-03 via the Management
      API, including the RLS-recursion fix in `06_rls.sql` and the new
      `13_billing_expiry.sql`. (`12_versions.sql` needed an idempotency fix —
      `drop policy if exists` — now in the file.)
- [x] Nothing from `database-setup/seeds/dev-only/` was run against prod.
- [x] DB types generated from prod and committed:
      `packages/supabase/src/database.types.ts`, re-exported from
      `packages/supabase/src/index.ts`.
- [x] Verified `auth.users` on prod is empty — no dev-seed accounts.

## Edge functions (deploy + secrets)

- [x] All 8 functions deployed to prod and ACTIVE (2026-07-03):
      `username-login`, `create-paymongo-checkout`, `create-checkout-session`,
      `paymongo-webhook`, `stripe-webhook`, `generate-activity`, `extract-text`,
      `delete-account`. Smoke-tested: `username-login` returns a structured 401
      for bad credentials (function + DB round trip works).

Secrets still to set (`supabase secrets set --project-ref rlaqermqpykxazfyfnpq`)
— these need the PayMongo / Stripe / Google dashboards, so a human must do them:

- [ ] **create-paymongo-checkout**: `PAYMONGO_SECRET_KEY` (live key),
      `PAYMONGO_TIER1_AMOUNT=9900`, `PAYMONGO_TIER2_AMOUNT=19900`,
      `PAYMONGO_SUCCESS_URL`, `PAYMONGO_CANCEL_URL`.
- [ ] **paymongo-webhook**: `PAYMONGO_WEBHOOK_SECRET`. Register the webhook
      endpoint in the PayMongo dashboard and subscribe it to
      `checkout_session.payment.paid`. (`PAYMONGO_TIER{1,2}_PLAN_ID` are now
      optional — only needed if we later move to PayMongo subscriptions.)
- [ ] **create-checkout-session / stripe-webhook**: `STRIPE_SECRET_KEY`,
      `STRIPE_TIER1_PRICE_ID`, `STRIPE_TIER2_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`.
      Register the Stripe webhook endpoint.
- [ ] **generate-activity**: `GEMINI_API_KEY` (optional `GEMINI_MODEL`,
      defaults to `gemini-2.0-flash`).
- [ ] **extract-text**: `EXTRACTOR_URL` (the extractor service must itself be
      deployed somewhere production-grade).

`username-login` needs no manual secrets (platform-provided vars only) and is
already fully working on prod.

### PayMongo decision (one-time vs subscription) — RESOLVED

Decision: **(b) one-time payments**, implemented 2026-07-03.
`create-paymongo-checkout` keeps creating one-time Checkout Sessions;
`paymongo-webhook` now handles `checkout_session.payment.paid` and grants the
purchased tier for 30 days. `13_billing_expiry.sql` makes
`current_effective_tier()` / `get_subscription_status()` enforce
`current_period_end`, so a lapsed one-time purchase collapses to free and
surfaces as `expired`. The `subscription.*` handling is retained for a future
move to the PayMongo Subscriptions API.

## App config

- [x] `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_KEY` for prod are set in
      the **production** build profile of `apps/teach/eas.json` (publishable key —
      client-safe). Dev `.env` files still point at the dev project, on purpose.
- [ ] Set `EXPO_PUBLIC_BILLING_MANAGE_URL` to the real manage/cancel page once the
      domain exists (until then the subscription screen falls back to a support
      mailto — functional, not a dead link).
- [x] Pricing reconciled: every surface (app `lib/pricing.ts`, website
      `lib/pricing.ts`, product guide) says PRO ₱99 / MAX ₱199.

## Domain / web

- [ ] Register the production domain and deploy the success/cancel pages
      referenced by `PAYMONGO_SUCCESS_URL` / `PAYMONGO_CANCEL_URL` and the Stripe
      `success_url` / `cancel_url` (currently `https://scheduhq.com/checkout/...`).

## Observability (Sentry)

- [x] `@sentry/react-native` (~7.2.0) installed in `apps/teach`.
- [x] `"@sentry/react-native/expo"` added to `app.json` plugins.
- [ ] Create the Sentry project and set `EXPO_PUBLIC_SENTRY_DSN` in the app env
      (add it to the `eas.json` production `env` block).
- [ ] Rebuild (prebuild / new dev client) — it's a native module.
- [ ] Verify a forced error on device reaches the Sentry dashboard.

## CI

- [x] "Lint & scheduler tests" and "Clean migration apply (00 -> 13)" are
      required status checks on `main` (branch protection set 2026-07-03).
- [ ] **Push `main`** — the local branch is far ahead of `origin/main`; CI has
      never actually run on GitHub. The first push will exercise the required
      checks.
- Note: the CI lint step is scoped to `schedu-teach`; the Next.js apps
  (`website`, `teach-web`) still use the removed `next lint` and need migrating
  to the ESLint CLI before workspace-wide lint can gate CI.

## Pre-launch (human)

- [ ] Publish a Privacy Policy and Terms of Service (App Store / Play Store require
      both). Do not ship fabricated legal text — have these reviewed.
- [ ] Finalize the production EAS build (`apps/teach/eas.json`); complete iOS
      distribution + App Store submission config if shipping iOS.
- [ ] Full on-device regression: re-run the audit's per-screen scorecard and the
      teacher-workflow checklist on a production build before going public.
- [ ] On-device verification of the deferred scheduling work before it ships:
      engine unification, suspension rendering, rebalance requirement-count
      integrity, and server-side double-booking.
- [ ] End-to-end payment test on prod: PayMongo test-mode checkout →
      `checkout_session.payment.paid` webhook → tier active for 30 days →
      verify it collapses to free/`expired` after `current_period_end`.
