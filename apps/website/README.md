# SchEDU website — scheduhq.com

Marketing landing page for SchEDU. Next.js 15 (App Router) + Tailwind v4, part of the
`schedu-hq` Turborepo / pnpm workspace.

## Local development

```bash
pnpm dev:website     # → http://localhost:3000
```

## Deploying to Vercel (auto-deploy on push)

This app deploys on **Vercel** via the Git integration — every push to `main` ships to
production, every PR gets a preview URL. The app relies on Vercel features
(`x-vercel-ip-country` geolocation, dynamic SSR, the `/api/waitlist` route), so it must
run on a Node/serverless host — not a static export.

**One-time setup (Vercel dashboard):**

1. **Add New… → Project** and import the `aundreka/schedu` repo.
2. Set **Root Directory** to `apps/website`. Framework auto-detects as **Next.js**;
   leave Build/Install/Output at their defaults (Vercel runs the pnpm workspace install
   from the repo root).
3. Add **Environment Variables** (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — server-only key, used by `/api/waitlist` to persist signups
4. **Deploy.** After this, every `git push` to `main` redeploys automatically.

**Custom domain:** Project → **Settings → Domains** → add `scheduhq.com`, then point your
DNS at Vercel (apex `A`/`ALIAS` or the `CNAME` Vercel shows). `teach.scheduhq.com` will be
a separate project for `apps/teach-web`.

## Waitlist table

The `/api/waitlist` route upserts into a `waitlist` table. Until it exists (or the env vars
above are set), the form still works and just skips persistence. Schema:

```sql
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text,
  country text,
  created_at timestamptz not null default now()
);
```
