// @ts-nocheck

/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimitCheck, rateLimitHeaders } from "../_shared/rate-limit.ts";

// Deletes the authenticated user's account and all their data.
// Cascading deletes in the DB (lesson_plans, subscriptions, etc.) handle data cleanup.
//
// Security: only the authenticated user can delete their own account.
// The Supabase admin API is required to delete from auth.users.

Deno.serve(async (req: Request) => {
  if (req.method !== "DELETE" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Missing env vars" }, 500);
  }

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!jwt) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Verify the JWT to get the user.
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  // Throttle: account deletion is destructive and admin-privileged, so cap it hard
  // per user (a few retries at most). Keyed by authenticated id, not spoofable IP.
  const rl = rateLimitCheck(`delete-account:${userId}`, 3, 60_000);
  if (!rl.allowed) {
    return json({ error: "rate_limited" }, 429, rateLimitHeaders(rl));
  }

  // Delete the user from auth.users — cascades to all tables via FK ON DELETE CASCADE.
  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
  if (deleteErr) {
    // Log the specifics server-side; return a generic message to the client.
    console.error("delete-account: deleteUser failed", deleteErr.message);
    return json({ error: "Failed to delete account" }, 500);
  }

  return json({ ok: true });
});

function json(obj: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
