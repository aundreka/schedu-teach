import React, { createContext, useContext } from "react";
import { useSubscription, SubscriptionState } from "../hooks/useSubscription";

// Subscription context — wraps useSubscription so the RPC runs once at the root
// and is shared by the header badge, paywall modals, and subscription screen
// without triggering duplicate network calls.

type SubscriptionContextValue = SubscriptionState;

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const subscription = useSubscription();
  return (
    <SubscriptionContext.Provider value={subscription}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscriptionContext(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error("useSubscriptionContext must be used inside SubscriptionProvider");
  }
  return ctx;
}
