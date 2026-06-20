import { Stack, router, useRootNavigationState, useSegments } from "expo-router";
import { AppState, Image, StyleSheet, Text, View } from "react-native";
import { ThemeProvider as NavThemeProvider, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect, useRef } from "react";
import { ThemeProvider, useAppTheme } from "../context/theme";
import { SubscriptionProvider, useSubscriptionContext } from "../context/subscription";
import { supabase } from "../lib/supabase";
import ErrorBoundary from "../components/ErrorBoundary";
import { initSentry } from "../lib/sentry";

initSentry();

function BrandTitle({
  mutedText,
  tint,
}: {
  mutedText: string;
  tint: string;
}) {
  return (
    <View style={styles.brandWrap}>
      <Image source={require("../assets/images/icon.png")} style={styles.logo} />
      <View style={styles.brandTextRow}>
        <Text style={[styles.brandGray, { color: mutedText }]}>SCH</Text>
        <Text style={[styles.brandGreen, { color: tint }]}>EDU</Text>
      </View>
    </View>
  );
}

function AppNav() {
  const { scheme, colors: c } = useAppTheme();
  const subscription = useSubscriptionContext();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const firstSegment = segments[0] as string | undefined;
  const isAuthRoute = firstSegment === "(auth)";
  const isOnboardingRoute = firstSegment === "onboarding";
  const onboardingChecked = useRef(false);

  // Refresh subscription data when the app comes back to foreground
  // (e.g. user returns from Stripe/PayMongo checkout in browser).
  const { refetch } = subscription;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refetch();
    });
    return () => sub.remove();
  }, [refetch]);

  useEffect(() => {
    if (!navigationState?.key) return;

    let active = true;

    const redirectToAuthIfMissing = (hasSession: boolean) => {
      if (!active || hasSession || isAuthRoute) return;
      router.replace("/(auth)");
    };

    const checkOnboarding = async (userId: string) => {
      if (!active || onboardingChecked.current) return;
      if (isAuthRoute || isOnboardingRoute) return;

      const { data, error } = await supabase
        .from("users")
        .select("onboarded_at, role")
        .eq("userid", userId)
        .maybeSingle();
      if (!active || error) return;

      onboardingChecked.current = true;
      if (!data?.onboarded_at) {
        router.replace("/onboarding" as any);
        return;
      }

      const role = data?.role as string | null | undefined;
      if (role === "admin" || role === "superadmin") {
        const isAdminRoute = firstSegment === "(admin)";
        if (!isAdminRoute) {
          router.replace("/(admin)" as any);
        }
      }
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
      redirectToAuthIfMissing(!!session);
      if (session?.user?.id) void checkOnboarding(session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      redirectToAuthIfMissing(!!session);
      if (session?.user?.id) {
        onboardingChecked.current = false;
        void checkOnboarding(session.user.id);
      } else {
        onboardingChecked.current = false;
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthRoute, isOnboardingRoute, navigationState?.key]);

  return (
    <NavThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: c.card,
          },
          headerShadowVisible: false,
          headerTintColor: c.text,
          headerTitleAlign: "left",
          headerTitle: () => <BrandTitle mutedText={c.mutedText} tint={c.tint} />,
          headerBackTitle: "Back",
          headerBackTitleStyle: {
            fontSize: 15,
          },
          headerBackButtonDisplayMode: "default",
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: true }} />
      </Stack>
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider>
        <SubscriptionProvider>
          <ErrorBoundary><AppNav /></ErrorBoundary>
        </SubscriptionProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  brandWrap: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 28, height: 28, resizeMode: "contain" },
  brandTextRow: { flexDirection: "row", alignItems: "baseline" },
  brandGray: { fontSize: 22, letterSpacing: 1, fontWeight: "600" },
  brandGreen: { fontSize: 22, letterSpacing: 1, fontWeight: "700" },
});
