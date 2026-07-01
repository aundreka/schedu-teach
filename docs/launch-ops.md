# Launch operations checklist

Operational (non-code) steps required to take ScheduTeach to production. The code
for each item is in place; these are the deploy/config actions a human must run.

## Database

- [ ] Provision a dedicated **production** Supabase project (separate from dev).
- [ ] Apply migrations in order: `./database-setup/apply.sh "$DATABASE_URL"`
      (canonical order 00 → 12, see `database-setup/README.md`).
- [ ] Do **not** run anything in `database-setup/seeds/dev-only/` against prod.
- [ ] Generate DB types and commit them:
      `supabase gen types typescript --linked > packages/supabase/src/database.types.ts`
      then re-export from `packages/supabase/src/index.ts` (currently an `export {}` stub).
- [ ] Verify there are no dev-seed accounts (`test.teacher`, the placeholder demo
      users) in the production `auth.users`.

## Edge functions (deploy + secrets)

Deploy: `supabase functions deploy <name>` for each of:
`username-login`, `create-paymongo-checkout`, `create-checkout-session`,
`paymongo-webhook`, `stripe-webhook`, `generate-activity`, `extract-text`,
`delete-account`.

Secrets (`supabase secrets set KEY=value`):

- **username-login**: uses `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_ANON_KEY` (all provided by the platform).
- **create-paymongo-checkout** (PH payments):
  `PAYMONGO_SECRET_KEY`, `PAYMONGO_TIER1_AMOUNT` (centavos, e.g. 9900),
  `PAYMONGO_TIER2_AMOUNT`, `PAYMONGO_SUCCESS_URL`, `PAYMONGO_CANCEL_URL`.
- **paymongo-webhook**: `PAYMONGO_WEBHOOK_SECRET`, `PAYMONGO_TIER1_PLAN_ID`,
  `PAYMONGO_TIER2_PLAN_ID`. Register the webhook endpoint in the PayMongo dashboard.
- **create-checkout-session / stripe-webhook**: `STRIPE_SECRET_KEY`,
  `STRIPE_TIER1_PRICE_ID`, `STRIPE_TIER2_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`.
  Register the Stripe webhook endpoint.

### PayMongo decision (one-time vs subscription)

`create-paymongo-checkout` currently creates a **one-time** Checkout Session that
works today. `paymongo-webhook` is written for **subscription.\*** events keyed on
`PAYMONGO_TIER{1,2}_PLAN_ID`. Before charging recurring fees, decide:
either (a) move checkout to the PayMongo Subscriptions API using those plan IDs, or
(b) keep one-time payments and adjust the webhook to checkout `payment.paid` events.

## App config

- [ ] Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` to the prod project.
- [ ] Set `EXPO_PUBLIC_BILLING_MANAGE_URL` to the real manage/cancel page (otherwise
      the subscription screen falls back to a support mailto).
- [ ] Reconcile pricing: PH MAX is ₱199 in `lib/pricing.ts` vs ₱149 elsewhere — pick one.

## Domain / web

- [ ] Register the production domain and deploy the success/cancel pages referenced
      by `PAYMONGO_SUCCESS_URL` / `PAYMONGO_CANCEL_URL` and the Stripe `success_url` /
      `cancel_url` (currently `https://scheduhq.com/checkout/...`).

## Observability (Sentry)

The app code is wired for Sentry (`lib/sentry.ts`, called from `ErrorBoundary` and
app startup) and is a graceful no-op until the native package is installed:

- [ ] `cd apps/teach && npx expo install @sentry/react-native`
- [ ] Add the plugin to `app.json`: `"plugins": ["@sentry/react-native/expo"]`
- [ ] Set `EXPO_PUBLIC_SENTRY_DSN` in the app env.
- [ ] Rebuild (prebuild / new dev client) — it's a native module.
- [ ] Verify a forced error on device reaches the Sentry dashboard.

## CI

- [ ] `.github/workflows/ci.yml` runs lint, scheduler tests, a clean migration apply,
      and the security regression checks. Make it a required status check on `main`.

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
