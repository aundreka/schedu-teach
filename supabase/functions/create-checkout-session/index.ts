// @ts-nocheck

/// <reference lib="deno.ns" />
/// <reference lib="dom" />

// create-checkout-session — generates a Stripe Checkout Session URL for non-PH users.
//
// Philippine users use the PayMongo paywall at scheduhq.com instead; this function is
// only called when the client's locale is non-PH (see lib/pricing.ts in the app).
//
// ⚠ IMPORTANT: The Stripe *webhook* handler is not yet implemented. After a user
// completes Stripe checkout, the DB subscription tier will NOT be updated automatically
// until supabase/functions/stripe-webhook/index.ts is built and deployed. In the
// meantime, manually update the subscriptions table via the Supabase dashboard.
//
// Required secrets (set via `supabase secrets set`):
//   STRIPE_SECRET_KEY        — sk_live_... or sk_test_...
//   STRIPE_TIER1_PRICE_ID    — price_... for PRO plan
//   STRIPE_TIER2_PRICE_ID    — price_... for MAX plan

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimitCheck, rateLimitHeaders } from "../_shared/rate-limit.ts";

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const SUPABASE_URL     = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const STRIPE_KEY       = Deno.env.get("STRIPE_SECRET_KEY");
    const TIER1_PRICE_ID   = Deno.env.get("STRIPE_TIER1_PRICE_ID");
    const TIER2_PRICE_ID   = Deno.env.get("STRIPE_TIER2_PRICE_ID");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ error: "Missing Supabase env vars" }, 500);
    }
    if (!STRIPE_KEY || !TIER1_PRICE_ID || !TIER2_PRICE_ID) {
      return json({ error: "Stripe secrets not configured" }, 500);
    }

    // Verify the JWT.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!jwt) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const user = userData.user;

    // Rate limit: 10 checkout attempts per minute per user.
    const rl = rateLimitCheck(`create-checkout:${user.id}`, 10, 60_000);
    if (!rl.allowed) {
      return json(
        { error: "rate_limited", retry_after_ms: rl.resetAt - Date.now() },
        429,
        rateLimitHeaders(rl)
      );
    }

    const body = await req.json().catch(() => ({}));
    const tier = body?.tier;
    if (tier !== "tier1" && tier !== "tier2") {
      return json({ error: "tier must be 'tier1' or 'tier2'" }, 400);
    }

    const priceId = tier === "tier1" ? TIER1_PRICE_ID : TIER2_PRICE_ID;

    // Create a Stripe Checkout Session via raw fetch (no Stripe SDK needed in Deno).
    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("line_items[0][price]", priceId);
    params.set("line_items[0][quantity]", "1");
    params.set("success_url", "https://scheduhq.com/checkout/success");
    params.set("cancel_url", "https://scheduhq.com/checkout/cancel");
    // Embed user_id so the future Stripe webhook handler can identify the user.
    params.set("subscription_data[metadata][user_id]", user.id);
    params.set("subscription_data[metadata][tier]", tier);
    if (user.email) params.set("customer_email", user.email);

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const stripeData = await stripeRes.json().catch(() => ({}));
    if (!stripeRes.ok) {
      const msg = stripeData?.error?.message ?? stripeRes.statusText;
      return json({ error: "Stripe error", details: msg }, 502, rateLimitHeaders(rl));
    }

    return json({ url: stripeData.url }, 200, rateLimitHeaders(rl));
  } catch (err) {
    return json({ error: "Server error", details: (err as Error)?.message ?? String(err) }, 500);
  }
});

function json(obj: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
