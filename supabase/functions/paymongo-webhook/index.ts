// @ts-nocheck

/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimitCheck, rateLimitHeaders } from "../_shared/rate-limit.ts";

// PayMongo webhook receiver.
//
// Flow:
//   1. Rate-limit by source IP (20/min) — defense against replay floods.
//   2. Read raw body (needed for HMAC) and verify Paymongo-Signature header.
//   3. Insert into paymongo_webhook_events as idempotency guard. Unique-violation on
//      event_id means we've already processed this event; return 200.
//   4. Dispatch on event_type and update public.subscriptions for the affected user.
//
// PayMongo identifies the user via attributes.metadata.user_id, which the paywall must
// set when creating the subscription/checkout session.
//
// Two payment models are handled:
//   - checkout_session.payment.paid — the LIVE model. create-paymongo-checkout makes a
//     one-time Checkout Session with metadata {user_id, tier}; a paid session grants that
//     tier for ONE_TIME_PERIOD_DAYS. Expiry is enforced at read time by
//     current_effective_tier / get_subscription_status (13_billing_expiry.sql).
//   - subscription.* — kept for a future move to the PayMongo Subscriptions API, keyed on
//     PAYMONGO_TIER{1,2}_PLAN_ID.

type Tier = "free" | "tier1" | "tier2";
type SubStatus = "active" | "canceled" | "past_due" | "expired";

// How long a one-time checkout payment keeps the tier active.
const ONE_TIME_PERIOD_DAYS = 30;

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const WEBHOOK_SECRET = Deno.env.get("PAYMONGO_WEBHOOK_SECRET");
    const TIER1_PLAN_ID = Deno.env.get("PAYMONGO_TIER1_PLAN_ID") ?? "";
    const TIER2_PLAN_ID = Deno.env.get("PAYMONGO_TIER2_PLAN_ID") ?? "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }
    if (!WEBHOOK_SECRET) {
      return json({ error: "Missing PAYMONGO_WEBHOOK_SECRET" }, 500);
    }

    const ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const rl = rateLimitCheck(`paymongo-webhook:${ip}`, 20, 60_000);
    if (!rl.allowed) {
      return json({ error: "rate_limited" }, 429, rateLimitHeaders(rl));
    }

    const signatureHeader = req.headers.get("paymongo-signature") ?? "";
    const rawBody = await req.text();

    const sigOk = await verifyPaymongoSignature(rawBody, signatureHeader, WEBHOOK_SECRET);
    if (!sigOk) {
      return json({ error: "invalid signature" }, 401, rateLimitHeaders(rl));
    }

    // Replay window: the signature stays valid forever, so reject events whose
    // signed timestamp is more than 5 minutes from now (idempotency already
    // blocks exact duplicates; this blocks stale-but-valid replays).
    const sigTs = Number(
      signatureHeader.split(",").find((s) => s.trim().startsWith("t="))?.split("=")[1]?.trim() ?? "",
    );
    if (!Number.isFinite(sigTs) || Math.abs(Date.now() / 1000 - sigTs) > 300) {
      return json({ error: "stale signature" }, 401, rateLimitHeaders(rl));
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return json({ error: "invalid json" }, 400, rateLimitHeaders(rl));
    }

    // PayMongo wraps the event in { data: { id, attributes: { type, data: { ... } } } }
    const eventId: string | undefined = event?.data?.id;
    const eventType: string | undefined = event?.data?.attributes?.type;
    if (!eventId || !eventType) {
      return json({ error: "missing event id or type" }, 400, rateLimitHeaders(rl));
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Idempotency: PK on event_id makes the insert atomic. Unique violation = replay.
    const { error: logErr } = await admin
      .from("paymongo_webhook_events")
      .insert({ event_id: eventId, event_type: eventType, payload: event });

    if (logErr) {
      if ((logErr as any).code === "23505") {
        return json({ ok: true, duplicate: true }, 200, rateLimitHeaders(rl));
      }
      return json(
        { error: "could not log event", details: logErr.message },
        500,
        rateLimitHeaders(rl)
      );
    }

    const result = await handleEvent({
      admin,
      eventType,
      eventData: event?.data?.attributes?.data ?? {},
      tier1PlanId: TIER1_PLAN_ID,
      tier2PlanId: TIER2_PLAN_ID,
    });

    return json({ ok: true, ...result }, 200, rateLimitHeaders(rl));
  } catch (e) {
    return json({ error: "server error", details: (e as Error)?.message ?? String(e) }, 500);
  }
});

async function handleEvent({
  admin,
  eventType,
  eventData,
  tier1PlanId,
  tier2PlanId,
}: {
  admin: any;
  eventType: string;
  eventData: any;
  tier1PlanId: string;
  tier2PlanId: string;
}) {
  const attrs = eventData?.attributes ?? {};

  if (eventType === "checkout_session.payment.paid") {
    return handleCheckoutPaid({ admin, attrs });
  }

  const userId: string | undefined = attrs?.metadata?.user_id;
  const planId: string | undefined = attrs?.plan_id ?? attrs?.plan?.id;
  const customerId: string | undefined = attrs?.customer_id ?? attrs?.customer?.id;
  const remoteSubId: string | undefined = eventData?.id;
  const periodStart = secToIso(attrs?.current_period_start);
  const periodEnd = secToIso(attrs?.current_period_end);
  const cancelAtPeriodEnd = !!attrs?.cancel_at_period_end;

  let tier: Tier = "free";
  let tierKnown = false;
  if (planId && planId === tier1PlanId) {
    tier = "tier1";
    tierKnown = true;
  } else if (planId && planId === tier2PlanId) {
    tier = "tier2";
    tierKnown = true;
  }

  let status: SubStatus;
  let activating = false;
  switch (eventType) {
    case "subscription.created":
    case "subscription.updated":
    case "subscription.resumed":
    case "subscription.payment.paid":
      status = "active";
      activating = true;
      break;
    case "subscription.cancelled":
    case "subscription.expired":
      status = "canceled";
      tier = "free";
      break;
    case "subscription.past_due":
    case "subscription.payment.failed":
      status = "past_due";
      break;
    default:
      // Unknown event types are still logged (via the earlier insert) but don't mutate state.
      return { handled: false, eventType, reason: "unhandled event type" };
  }

  if (!userId) {
    return { handled: false, eventType, reason: "missing metadata.user_id" };
  }

  // Fail CLOSED: never grant an active subscription whose plan we can't resolve
  // to a known tier. Writing tier='free' + status='active' here would silently
  // downgrade a paying customer. Skip the mutation and surface it for triage.
  if (activating && !tierKnown) {
    return { handled: false, eventType, reason: `unknown plan_id: ${planId ?? "none"}` };
  }

  const { error } = await admin
    .from("subscriptions")
    .update({
      tier,
      status,
      paymongo_customer_id: customerId ?? null,
      paymongo_subscription_id: remoteSubId ?? null,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
    })
    .eq("user_id", userId);

  if (error) {
    return { handled: false, eventType, error: error.message };
  }

  // Write a user-readable billing event.
  const tierLabel = tier === "tier1" ? "PRO" : tier === "tier2" ? "MAX" : "Free";
  let description: string;
  let amountCents: number | null = null;
  const currency = (attrs?.currency as string | undefined) ?? "PHP";

  switch (eventType) {
    case "subscription.payment.paid": {
      amountCents = typeof attrs?.amount === "number" ? attrs.amount : null;
      description = `Payment received — ${tierLabel} Plan`;
      break;
    }
    case "subscription.created":
      description = `${tierLabel} Plan activated`;
      break;
    case "subscription.updated":
    case "subscription.resumed":
      description = `${tierLabel} Plan updated`;
      break;
    case "subscription.cancelled":
    case "subscription.expired":
      description = "Subscription canceled";
      break;
    case "subscription.past_due":
    case "subscription.payment.failed":
      description = "Payment failed";
      break;
    default:
      description = eventType;
  }

  await admin.from("billing_events").insert({
    user_id:      userId,
    event_type:   eventType,
    tier:         tier === "free" ? null : tier,
    amount_cents: amountCents,
    currency:     currency.toUpperCase(),
    description,
  });

  return { handled: true, eventType, tier, status };
}

// One-time Checkout Session paid: grant metadata.tier for ONE_TIME_PERIOD_DAYS.
// attrs is the checkout session's attributes, carrying the metadata that
// create-paymongo-checkout attached plus the settled payments.
async function handleCheckoutPaid({ admin, attrs }: { admin: any; attrs: any }) {
  const eventType = "checkout_session.payment.paid";
  const userId: string | undefined = attrs?.metadata?.user_id;
  const metaTier: string | undefined = attrs?.metadata?.tier;

  if (!userId) {
    return { handled: false, eventType, reason: "missing metadata.user_id" };
  }
  // Fail CLOSED: only grant tiers we recognize (same principle as the plan_id check).
  if (metaTier !== "tier1" && metaTier !== "tier2") {
    return { handled: false, eventType, reason: `unknown metadata.tier: ${metaTier ?? "none"}` };
  }
  const tier: Tier = metaTier;

  const now = new Date();
  const periodEnd = new Date(now.getTime() + ONE_TIME_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const { error } = await admin
    .from("subscriptions")
    .update({
      tier,
      status: "active" satisfies SubStatus,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
    })
    .eq("user_id", userId);

  if (error) {
    return { handled: false, eventType, error: error.message };
  }

  const payment = attrs?.payments?.[0]?.attributes;
  const lineItem = attrs?.line_items?.[0];
  const amountCents: number | null =
    typeof payment?.amount === "number" ? payment.amount
    : typeof lineItem?.amount === "number" ? lineItem.amount
    : null;
  const currency: string = (payment?.currency ?? lineItem?.currency ?? "PHP").toUpperCase();

  const tierLabel = tier === "tier1" ? "PRO" : "MAX";
  await admin.from("billing_events").insert({
    user_id:      userId,
    event_type:   eventType,
    tier,
    amount_cents: amountCents,
    currency,
    description:  `Payment received — ${tierLabel} Plan (${ONE_TIME_PERIOD_DAYS} days)`,
  });

  return { handled: true, eventType, tier, status: "active" };
}

// PayMongo signature header format:
//   Paymongo-Signature: t=<unix-timestamp>,te=<test-sig-hex>,li=<live-sig-hex>
// Signed payload is `${timestamp}.${rawBody}` HMAC-SHA256 with the webhook secret.
async function verifyPaymongoSignature(
  rawBody: string,
  header: string,
  secret: string
): Promise<boolean> {
  if (!header) return false;

  const parts: Record<string, string> = {};
  for (const seg of header.split(",")) {
    const idx = seg.indexOf("=");
    if (idx === -1) continue;
    parts[seg.slice(0, idx).trim()] = seg.slice(idx + 1).trim();
  }

  const timestamp = parts["t"];
  const liveSig = parts["li"];
  const testSig = parts["te"];
  if (!timestamp || (!liveSig && !testSig)) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${rawBody}`));
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const candidates = [liveSig, testSig].filter(Boolean) as string[];
  return candidates.some((c) => safeEqualHex(expected, c));
}

// Constant-time hex comparison (lowercased).
function safeEqualHex(a: string, b: string): boolean {
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return diff === 0;
}

function secToIso(secs: unknown): string | null {
  if (typeof secs !== "number" || !Number.isFinite(secs)) return null;
  return new Date(secs * 1000).toISOString();
}

function json(obj: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
