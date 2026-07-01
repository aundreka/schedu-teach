import { Alert, Linking } from "react-native";
import { supabase } from "./supabase";

export type PricingGateway = "paymongo" | "stripe";
export type SubscriptionTier = "free" | "tier1" | "tier2";

export type LocalePricing = {
  gateway: PricingGateway;
  currency: string;
  tier1Price: string;
  tier2Price: string;
};

// Prices are set to be roughly equivalent in purchasing-power terms.
// PH users pay via PayMongo; everyone else via Stripe Checkout.
const LOCALE_MAP: Record<string, LocalePricing> = {
  PH: { gateway: "paymongo", currency: "₱",   tier1Price: "₱99",    tier2Price: "₱199"   },
  US: { gateway: "stripe",   currency: "$",   tier1Price: "$5",     tier2Price: "$10"    },
  CA: { gateway: "stripe",   currency: "CA$", tier1Price: "CA$7",   tier2Price: "CA$14"  },
  GB: { gateway: "stripe",   currency: "£",   tier1Price: "£4",     tier2Price: "£8"     },
  AU: { gateway: "stripe",   currency: "A$",  tier1Price: "A$8",    tier2Price: "A$15"   },
  NZ: { gateway: "stripe",   currency: "NZ$", tier1Price: "NZ$9",   tier2Price: "NZ$18"  },
  SG: { gateway: "stripe",   currency: "S$",  tier1Price: "S$7",    tier2Price: "S$14"   },
  JP: { gateway: "stripe",   currency: "¥",   tier1Price: "¥700",   tier2Price: "¥1,400" },
  KR: { gateway: "stripe",   currency: "₩",   tier1Price: "₩6,500", tier2Price: "₩13,000"},
  // European Union — used as fallback for any EU country code not listed above
  EU: { gateway: "stripe",   currency: "€",   tier1Price: "€4",     tier2Price: "€9"     },
};

const EU_COUNTRIES = new Set([
  "AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI","FR","GR","HR","HU",
  "IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK",
]);

export function getLocalePricing(regionCode?: string | null): LocalePricing {
  if (!regionCode) return LOCALE_MAP.US;
  const code = regionCode.toUpperCase();
  if (LOCALE_MAP[code]) return LOCALE_MAP[code];
  if (EU_COUNTRIES.has(code)) return LOCALE_MAP.EU;
  return LOCALE_MAP.US;
}

/**
 * URL for managing/canceling a subscription. Configured via
 * EXPO_PUBLIC_BILLING_MANAGE_URL; falls back to a support mailto so the link is
 * never a dead placeholder domain.
 */
export function getBillingManageUrl(): string {
  return (
    process.env.EXPO_PUBLIC_BILLING_MANAGE_URL ??
    "mailto:support@schedu.ph?subject=Manage%20or%20cancel%20subscription"
  );
}

/**
 * Initiates the checkout flow for the given tier.
 * PH → create-paymongo-checkout edge fn, then opens the PayMongo checkout URL.
 * Non-PH → create-checkout-session edge fn, then opens the Stripe Checkout URL.
 *
 * Both gateways resolve a hosted checkout URL server-side (the secret keys never
 * touch the client) and the user completes payment in the browser.
 */
export async function startCheckout(
  tier: "tier1" | "tier2",
  regionCode?: string | null
): Promise<void> {
  const pricing = getLocalePricing(regionCode);
  const fn = pricing.gateway === "paymongo" ? "create-paymongo-checkout" : "create-checkout-session";

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      Alert.alert("Sign in required", "Please sign in to upgrade.");
      return;
    }

    const { data, error } = await supabase.functions.invoke(fn, {
      headers: { Authorization: `Bearer ${token}` },
      body: { tier },
    });

    if (error || !data?.url) {
      Alert.alert(
        "Checkout unavailable",
        "Could not start checkout. Please try again later."
      );
      return;
    }

    await Linking.openURL(data.url);
  } catch {
    Alert.alert("Checkout unavailable", "Could not start checkout. Please try again later.");
  }
}
