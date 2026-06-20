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

export const PAYWALL_PLACEHOLDER = "https://scheduhq.com";

/**
 * Initiates the checkout flow for the given tier.
 * PH → opens PayMongo paywall placeholder in browser.
 * Non-PH → calls create-checkout-session edge fn, then opens Stripe Checkout URL.
 */
export async function startCheckout(
  tier: "tier1" | "tier2",
  regionCode?: string | null
): Promise<void> {
  const pricing = getLocalePricing(regionCode);

  if (pricing.gateway === "paymongo") {
    await Linking.openURL(`${PAYWALL_PLACEHOLDER}/upgrade?tier=${tier}`);
    return;
  }

  // Stripe flow
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      Alert.alert("Sign in required", "Please sign in to upgrade.");
      return;
    }

    const { data, error } = await supabase.functions.invoke("create-checkout-session", {
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
