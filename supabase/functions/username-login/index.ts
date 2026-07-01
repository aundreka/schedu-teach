// @ts-nocheck

/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimitCheck, rateLimitHeaders } from "../_shared/rate-limit.ts";

// Username + password sign-in.
//
// The client cannot resolve a username -> email itself: public.users is
// RLS-protected and an anon SELECT returns nothing ("Account not found"), and
// opening anon SELECT would leak every user's email by username. So we resolve
// and authenticate entirely server-side and hand back a session.
//
// Anti-enumeration: a missing username and a wrong password return the same
// generic error, so this endpoint never reveals whether a username exists.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    return json({ error: "Server misconfigured" }, 500);
  }

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return json({ error: "Username and password are required" }, 400);
  }

  // Rate-limit by username to blunt credential-stuffing. IP-based limiting is
  // spoofable; username keying caps attempts per account.
  const rl = rateLimitCheck(`username-login:${username.toLowerCase()}`, 10, 60_000);
  if (!rl.allowed) {
    return json({ error: "Too many attempts. Try again shortly." }, 429, rateLimitHeaders(rl));
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Resolve the email server-side (service role bypasses RLS).
  const { data: row } = await admin
    .from("users")
    .select("email")
    .ilike("username", username)
    .limit(1)
    .maybeSingle();

  const email = row?.email ?? null;
  const GENERIC = "Invalid username or password.";

  if (!email) {
    return json({ error: GENERIC }, 401, rateLimitHeaders(rl));
  }

  // Authenticate with an anon client so we get a real user session back.
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !signIn?.session) {
    return json({ error: GENERIC }, 401, rateLimitHeaders(rl));
  }

  return json(
    {
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    },
    200,
    rateLimitHeaders(rl),
  );
});

function json(obj: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extraHeaders },
  });
}
