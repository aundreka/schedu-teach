import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Persist early-access signups.
 *
 * Requires (in apps/website/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (server-only; bypasses RLS for the insert)
 *
 * Expected table:
 *   create table public.waitlist (
 *     id uuid primary key default gen_random_uuid(),
 *     email text not null unique,
 *     role text,
 *     country text,
 *     created_at timestamptz not null default now()
 *   );
 *
 * If env is not configured the route still returns success so the UI works
 * in development — it just logs a warning instead of persisting.
 */
export async function POST(req: Request) {
  let body: { email?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase() ?? ''
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 422 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.warn('[waitlist] Supabase env not configured — signup not persisted:', email)
    return NextResponse.json({ ok: true, persisted: false })
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } })
    const country = req.headers.get('x-vercel-ip-country') ?? null
    const { error } = await supabase
      .from('waitlist')
      .upsert(
        { email, role: body.role ?? null, country },
        { onConflict: 'email', ignoreDuplicates: true },
      )

    if (error) {
      console.error('[waitlist] insert failed:', error.message)
      return NextResponse.json({ error: 'Could not save right now. Try again shortly.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, persisted: true })
  } catch (err) {
    console.error('[waitlist] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
