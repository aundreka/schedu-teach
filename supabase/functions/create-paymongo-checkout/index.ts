// @ts-nocheck

/// <reference lib="deno.ns" />
/// <reference lib="dom" />

// create-paymongo-checkout — generates a PayMongo hosted Checkout Session URL
// for Philippine users (the Stripe path covers everyone else; see lib/pricing.ts).
//
// This replaces the dead placeholder paywall (https://scheduhq.com/upgrade) that
// shipped before. It returns a real checkout_url the app opens in the browser.
//
// Required secrets (set via `supabase secrets set`):
//   PAYMONGO_SECRET_KEY      — sk_live_... or sk_test_...
//   PAYMONGO_TIER1_AMOUNT    — PRO price in centavos (e.g. 9900 for ₱99)
//   PAYMONGO_TIER2_AMOUNT    — MAX price in centavos (e.g. 19900 for ₱199)
//   PAYMONGO_SUCCESS_URL     — page to return to after payment (e.g. https://schedu.ph/checkout/success)
//   PAYMONGO_CANCEL_URL      — page to return to on cancel
//
// metadata.user_id and metadata.tier are attached so paymongo-webhook can map the
// resulting payment back to the user. This creates a one-time Checkout Session:
// paymongo-webhook handles checkout_session.payment.paid and grants the tier for
// 30 days (expiry enforced by 13_billing_expiry.sql). A future move to recurring
// billing would switch to the PayMongo Subscriptions API using
// PAYMONGO_TIER{1,2}_PLAN_ID — the webhook already handles subscription.* events.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimitCheck, rateLimitHeaders } from "../_shared/rate-limit.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const PAYMONGO_KEY = Deno.env.get("PAYMONGO_SECRET_KEY");
    const TIER1_AMOUNT = Number(Deno.env.get("PAYMONGO_TIER1_AMOUNT") ?? "0");
    const TIER2_AMOUNT = Number(Deno.env.get("PAYMONGO_TIER2_AMOUNT") ?? "0");
    const SUCCESS_URL = Deno.env.get("PAYMONGO_SUCCESS_URL");
    const CANCEL_URL = Deno.env.get("PAYMONGO_CANCEL_URL");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ error: "Missing Supabase env vars" }, 500);
    }
    if (!PAYMONGO_KEY || !TIER1_AMOUNT || !TIER2_AMOUNT || !SUCCESS_URL || !CANCEL_URL) {
      return json({ error: "PayMongo secrets not configured" }, 500);
    }

    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!jwt) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const user = userData.user;

    const rl = rateLimitCheck(`create-paymongo-checkout:${user.id}`, 10, 60_000);
    if (!rl.allowed) {
      return json({ error: "rate_limited" }, 429, rateLimitHeaders(rl));
    }

    const body = await req.json().catch(() => ({}));
    const tier = body?.tier;
    if (tier !== "tier1" && tier !== "tier2") {
      return json({ error: "tier must be 'tier1' or 'tier2'" }, 400);
    }

    const amount = tier === "tier1" ? TIER1_AMOUNT : TIER2_AMOUNT;
    const planLabel = tier === "tier1" ? "ScheduTeach PRO" : "ScheduTeach MAX";

    // PayMongo uses HTTP Basic auth: base64(secret_key + ":").
    const authHeader = `Basic ${btoa(`${PAYMONGO_KEY}:`)}`;

    const payload = {
      data: {
        attributes: {
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          line_items: [
            {
              currency: "PHP",
              amount,
              quantity: 1,
              name: planLabel,
            },
          ],
          payment_method_types: ["gcash", "card", "paymaya"],
          success_url: SUCCESS_URL,
          cancel_url: CANCEL_URL,
          description: `${planLabel} subscription`,
          metadata: { user_id: user.id, tier },
        },
      },
    };

    const res = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Log details server-side; return a generic client error (no upstream leak).
      console.error("PayMongo checkout error", JSON.stringify(data));
      return json({ error: "Could not start checkout" }, 502, rateLimitHeaders(rl));
    }

    const url = data?.data?.attributes?.checkout_url;
    if (!url) return json({ error: "Could not start checkout" }, 502, rateLimitHeaders(rl));

    return json({ url }, 200, rateLimitHeaders(rl));
  } catch (err) {
    console.error("create-paymongo-checkout server error", (err as Error)?.message);
    return json({ error: "Server error" }, 500);
  }
});

function json(obj: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extraHeaders },
  });
}
