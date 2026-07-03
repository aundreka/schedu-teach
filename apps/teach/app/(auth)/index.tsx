// app/(auth)/index.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import Animated from "react-native-reanimated";

import { Typography } from "../../constants/fonts";
import { useAppTheme } from "../../context/theme";
import { Input } from "../../components/ui";
import { enterUp } from "../../lib/motion";
// ✅ change this path if your supabase client lives elsewhere
import { supabase } from "../../lib/supabase";
import { completePendingProfile } from "../../lib/pending-profile";

type Provider = "google" | "apple" | "facebook";

export default function AuthIndex() {
  const { colors: c, ready } = useAppTheme();

  const [identifier, setIdentifier] = useState(""); // username OR email
  const [password, setPassword] = useState("");

  const [loadingEmailPass, setLoadingEmailPass] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const redirectTo = useMemo(() => Linking.createURL("auth/callback"), []);

  const isEmail = (v: string) => v.includes("@");

  const handlePasswordSignIn = async () => {
    setErrorMsg(null);

    const id = identifier.trim();
    if (!id || !password) {
      setErrorMsg("Please enter your username/email and password.");
      return;
    }

    try {
      setLoadingEmailPass(true);

      if (isEmail(id)) {
        const { error } = await supabase.auth.signInWithPassword({
          email: id,
          password,
        });
        if (error) {
          setErrorMsg(error.message);
          return;
        }
      } else {
        // Username login: public.users is RLS-protected so the client cannot
        // resolve username -> email. The username-login edge function does the
        // lookup + sign-in server-side and returns a session to set locally.
        const { data, error } = await supabase.functions.invoke("username-login", {
          body: { username: id, password },
        });
        if (error || !data?.access_token || !data?.refresh_token) {
          setErrorMsg((data as any)?.error ?? "Invalid username or password.");
          return;
        }
        const { error: sessionErr } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (sessionErr) {
          setErrorMsg(sessionErr.message);
          return;
        }
      }

      // ✅ signed in — finish any profile stashed during a confirm-email
      // signup (writes the chosen username now that a session exists), then
      // send to the main area.
      await completePendingProfile();
      router.replace("/(tabs)");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Sign in failed.");
    } finally {
      setLoadingEmailPass(false);
    }
  };

  const handleOAuth = async (provider: Provider) => {
    setErrorMsg(null);
    try {
      setLoadingProvider(provider);

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (error) setErrorMsg(error.message);
      // OAuth will return via deep link; session listener can be elsewhere (e.g., root layout).
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Sign in failed.");
    } finally {
      setLoadingProvider(null);
    }
  };

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const busy = loadingEmailPass || !!loadingProvider;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        {/* Brand (similar layout to your reference image) */}
        <View style={styles.brandRow}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.brandLogo}
            accessibilityElementsHidden={true}
          />
          <View>
            <Text style={[styles.brandTitle, { color: c.text }]}>schEDU</Text>
            <Text style={[styles.brandTag, { color: c.mutedText }]}>Smarter Lesson Planning</Text>
          </View>
        </View>

        {/* Card */}
        <Animated.View
          entering={enterUp()}
          style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
        >
          <Input
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="Username or email"
            autoCapitalize="none"
            containerStyle={styles.inputWrap}
            editable={!busy}
          />

          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            containerStyle={styles.inputWrap}
            editable={!busy}
          />

          <Pressable
            onPress={handlePasswordSignIn}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Sign In"
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: c.tint },
              pressed && { opacity: 0.9 },
              busy && { opacity: 0.7 },
            ]}
          >
            {loadingEmailPass ? (
              <ActivityIndicator color={c.onTint} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: c.onTint }]}>Sign In</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.push("/(auth)/forgot-password")}
            disabled={busy}
            accessibilityRole="link"
            accessibilityLabel="Forgot password?"
            style={{ alignSelf: "flex-start", marginTop: 10 }}
          >
            <Text style={[styles.link, { color: c.mutedText }]}>Forgot password?</Text>
          </Pressable>

          {errorMsg ? (
            <Text accessibilityLiveRegion="polite" style={[styles.error, { color: c.danger }]}>
              {errorMsg}
            </Text>
          ) : null}
        </Animated.View>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
          <Text style={[styles.dividerText, { color: c.mutedText }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
        </View>

        {/* Small icon-only OAuth buttons (horizontal) */}
        <View style={styles.oauthRow}>
          <IconAuthButton
            icon="logo-google"
            onPress={() => handleOAuth("google")}
            loading={loadingProvider === "google"}
            disabled={busy}
            c={c}
          />

          {Platform.OS === "ios" && (
            <IconAuthButton
              icon="logo-apple"
              onPress={() => handleOAuth("apple")}
              loading={loadingProvider === "apple"}
              disabled={busy}
              c={c}
            />
          )}

          <IconAuthButton
            icon="logo-facebook"
            onPress={() => handleOAuth("facebook")}
            loading={loadingProvider === "facebook"}
            disabled={busy}
            c={c}
          />
        </View>

        {/* Register */}
        <View style={styles.registerRow}>
          <Text style={{ color: c.mutedText }}>Don’t have an Account? </Text>
          <Pressable
            onPress={() => router.push("/(auth)/sign-up")}
            disabled={busy}
            accessibilityRole="link"
            accessibilityLabel="Register"
          >
            <Text style={[styles.registerLink, { color: c.tint }]}>Register</Text>
          </Pressable>
        </View>

        {/* Legal */}
        <Text style={[styles.legalText, { color: c.mutedText }]}>
          By continuing, you agree to our{" "}
          <Text
            style={[styles.legalLink, { color: c.tint }]}
            onPress={() => router.push("/legal/terms")}
            accessibilityRole="link"
          >
            Terms of Service
          </Text>{" "}
          and{" "}
          <Text
            style={[styles.legalLink, { color: c.tint }]}
            onPress={() => router.push("/legal/privacy")}
            accessibilityRole="link"
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

function IconAuthButton({
  icon,
  onPress,
  loading,
  disabled,
  c,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
  c: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Sign in with ${String(icon).replace(/^logo-/, "")}`}
      style={({ pressed }) => [
        styles.iconBtn,
        { borderColor: c.border, backgroundColor: c.card },
        pressed && { opacity: 0.9 },
        disabled && { opacity: 0.7 },
      ]}
    >
      {loading ? (
        <ActivityIndicator />
      ) : (
        <Ionicons name={icon} size={18} color={c.text} accessibilityElementsHidden={true} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },

  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    justifyContent: "center",
    marginBottom: 18,
  },
  brandLogo: {
    width: 42,
    height: 42,
  },
  brandTitle: { ...Typography.display, letterSpacing: 0.5 },
  brandTag: { ...Typography.caption, marginTop: -2 },

  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },

  inputWrap: {
    marginBottom: 10,
  },

  primaryBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryBtnText: { ...Typography.body, fontWeight: "700" },

  link: { ...Typography.bodySm, textDecorationLine: "underline" },

  error: { ...Typography.bodySm, marginTop: 10 },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 18,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { ...Typography.caption },

  oauthRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 16,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  registerLink: { fontWeight: "700" },

  legalText: {
    ...Typography.caption,
    textAlign: "center",
    marginTop: 16,
    paddingHorizontal: 12,
  },
  legalLink: { textDecorationLine: "underline" },
});
