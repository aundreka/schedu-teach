// @ts-nocheck

/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Stripe webhook handler.
//
// Handles subscription lifecycle events to keep the DB tier in sync with Stripe.
// Required secret: STRIPE_WEBHOOK_SECRET (from Stripe dashboard → Webhooks → signing secret)
//
// Events handled:
//   customer.subscription.created  → tier active
//   customer.subscription.updated  → tier / status updated
//   customer.subscription.deleted  → tier free, status canceled
//   invoice.payment_succeeded       → billing_event written (amount_paid)
//   invoice.payment_failed          → status past_due, billing_event written
//
// user_id is embedded in subscription.metadata.user_id at checkout-session creation time.
// For invoice events, the subscription row is looked up by stripe_subscription_id.
//
// Register this webhook in Stripe dashboard:
//   URL: https://<project>.supabase.co/functions/v1/stripe-webhook
//   Events: customer.subscription.*, invoice.payment_succeeded, invoice.payment_failed

type Tier = "free" | "tier1" | "tier2";
type SubStatus = "active" | "canceled" | "past_due" | "expired";

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const SUPABASE_URL     = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const WEBHOOK_SECRET   = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const TIER1_PRICE_ID   = Deno.env.get("STRIPE_TIER1_PRICE_ID") ?? "";
    const TIER2_PRICE_ID   = Deno.env.get("STRIPE_TIER2_PRICE_ID") ?? "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ error: "Missing Supabase env vars" }, 500);
    }
    if (!WEBHOOK_SECRET) {
      return json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, 500);
    }

    const signatureHeader = req.headers.get("stripe-signature") ?? "";
    const rawBody = await req.text();

    const sigOk = await verifyStripeSignature(rawBody, signatureHeader, WEBHOOK_SECRET);
    if (!sigOk) return json({ error: "Invalid signature" }, 401);

    // Replay window: reject events whose signed timestamp is more than 5 minutes
    // from now. Idempotency blocks exact duplicates; this blocks stale replays.
    const sigTs = Number(
      signatureHeader.split(",").find((s) => s.trim().startsWith("t="))?.split("=")[1]?.trim() ?? "",
    );
    if (!Number.isFinite(sigTs) || Math.abs(Date.now() / 1000 - sigTs) > 300) {
      return json({ error: "Stale signature" }, 401);
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const eventId: string | undefined = event?.id;
    const eventType: string | undefined = event?.type;
    if (!eventId || !eventType) return json({ error: "Missing event id or type" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Idempotency: unique PK on event_id prevents double-processing replays.
    const { error: logErr } = await admin
      .from("stripe_webhook_events")
      .insert({ event_id: eventId, event_type: eventType, payload: event });

    if (logErr) {
      if ((logErr as any).code === "23505") {
        return json({ ok: true, duplicate: true }, 200);
      }
      return json({ error: "Could not log event", details: logErr.message }, 500);
    }

    const result = await handleEvent({ admin, eventType, eventData: event?.data?.object ?? {}, tier1PriceId: TIER1_PRICE_ID, tier2PriceId: TIER2_PRICE_ID });
    return json({ ok: true, ...result }, 200);
  } catch (e) {
    return json({ error: "Server error", details: (e as Error)?.message ?? String(e) }, 500);
  }
});

async function handleEvent({
  admin,
  eventType,
  eventData,
  tier1PriceId,
  tier2PriceId,
}: {
  admin: any;
  eventType: string;
  eventData: any;
  tier1PriceId: string;
  tier2PriceId: string;
}) {
  switch (eventType) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      return handleSubscriptionEvent({ admin, eventType, subscription: eventData, tier1PriceId, tier2PriceId });
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      return handleInvoiceEvent({ admin, eventType, invoice: eventData });
    }
    default:
      return { handled: false, reason: "unhandled event type" };
  }
}

async function handleSubscriptionEvent({
  admin,
  eventType,
  subscription,
  tier1PriceId,
  tier2PriceId,
}: {
  admin: any;
  eventType: string;
  subscription: any;
  tier1PriceId: string;
  tier2PriceId: string;
}) {
  const userId: string | undefined = subscription?.metadata?.user_id;
  if (!userId) return { handled: false, reason: "missing metadata.user_id" };

  const stripeSubId: string = subscription?.id ?? "";
  const priceId: string = subscription?.items?.data?.[0]?.price?.id ?? "";
  const cancelAtPeriodEnd: boolean = !!subscription?.cancel_at_period_end;
  const periodStart = secToIso(subscription?.current_period_start);
  const periodEnd   = secToIso(subscription?.current_period_end);

  let tier: Tier = "free";
  let tierKnown = false;
  if (priceId && priceId === tier1PriceId) {
    tier = "tier1";
    tierKnown = true;
  } else if (priceId && priceId === tier2PriceId) {
    tier = "tier2";
    tierKnown = true;
  }

  let status: SubStatus;
  if (eventType === "customer.subscription.deleted") {
    status = "canceled";
    tier   = "free";
  } else {
    const stripeStatus: string = subscription?.status ?? "active";
    status = stripeStatus === "past_due" ? "past_due"
           : stripeStatus === "canceled" || stripeStatus === "unpaid" ? "canceled"
           : "active";
    if (status === "canceled") tier = "free";

    // Fail CLOSED: never grant an active/past_due subscription whose price we
    // can't resolve to a known tier — that would silently downgrade a paying
    // customer to free. Skip the mutation and surface it for triage.
    if (status !== "canceled" && !tierKnown) {
      return { handled: false, reason: `unknown price_id: ${priceId || "none"}` };
    }
  }

  const { error } = await admin
    .from("subscriptions")
    .update({
      tier,
      status,
      stripe_customer_id:      subscription?.customer ?? null,
      stripe_subscription_id:  stripeSubId || null,
      current_period_start:    periodStart,
      current_period_end:      periodEnd,
      cancel_at_period_end:    cancelAtPeriodEnd,
    })
    .eq("user_id", userId);

  if (error) return { handled: false, error: error.message };

  const tierLabel = tier === "tier1" ? "PRO" : tier === "tier2" ? "MAX" : "Free";
  const description = eventType === "customer.subscription.deleted"
    ? "Subscription canceled"
    : `${tierLabel} Plan ${eventType === "customer.subscription.created" ? "activated" : "updated"}`;

  await admin.from("billing_events").insert({
    user_id:      userId,
    event_type:   eventType,
    tier:         tier === "free" ? null : tier,
    amount_cents: null,
    currency:     null,
    description,
  });

  return { handled: true, tier, status };
}

async function handleInvoiceEvent({
  admin,
  eventType,
  invoice,
}: {
  admin: any;
  eventType: string;
  invoice: any;
}) {
  const stripeSubId: string = invoice?.subscription ?? "";
  if (!stripeSubId) return { handled: false, reason: "no subscription id on invoice" };

  // Look up the user by stripe_subscription_id in our DB.
  const { data: subRow } = await admin
    .from("subscriptions")
    .select("user_id, tier")
    .eq("stripe_subscription_id", stripeSubId)
    .maybeSingle();

  if (!subRow?.user_id) {
    return { handled: false, reason: "subscription not found by stripe_subscription_id" };
  }

  const userId: string = subRow.user_id;
  const tier: Tier = subRow.tier ?? "free";
  const tierLabel = tier === "tier1" ? "PRO" : tier === "tier2" ? "MAX" : "Free";
  const amountCents: number | null = typeof invoice?.amount_paid === "number" ? invoice.amount_paid : null;
  const currency: string = (invoice?.currency ?? "usd").toUpperCase();

  if (eventType === "invoice.payment_failed") {
    await admin
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("user_id", userId);
  }

  await admin.from("billing_events").insert({
    user_id:      userId,
    event_type:   eventType,
    tier:         tier === "free" ? null : tier,
    amount_cents: eventType === "invoice.payment_succeeded" ? amountCents : null,
    currency:     eventType === "invoice.payment_succeeded" ? currency : null,
    description:  eventType === "invoice.payment_succeeded"
      ? `Payment received — ${tierLabel} Plan`
      : "Payment failed",
  });

  return { handled: true, eventType };
}

// Stripe-Signature header format: t=<unix>,v1=<hmac>[,v0=<hmac>]
// Signed payload: `${t}.${rawBody}` HMAC-SHA256 with STRIPE_WEBHOOK_SECRET.
async function verifyStripeSignature(rawBody: string, header: string, secret: string): Promise<boolean> {
  if (!header) return false;

  const parts: Record<string, string> = {};
  for (const seg of header.split(",")) {
    const idx = seg.indexOf("=");
    if (idx === -1) continue;
    parts[seg.slice(0, idx).trim()] = seg.slice(idx + 1).trim();
  }

  const timestamp = parts["t"];
  const v1sig     = parts["v1"];
  if (!timestamp || !v1sig) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${rawBody}`));
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return safeEqualHex(expected, v1sig);
}

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

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
