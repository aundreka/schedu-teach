// app/(auth)/signup.tsx
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Animated from "react-native-reanimated";

import { Button, EmptyState, Input } from "../../components/ui";
import { Typography } from "../../constants/fonts";
import { useAppTheme } from "../../context/theme";
import { enterUp } from "../../lib/motion";
import { savePendingProfile } from "../../lib/pending-profile";
// ✅ change this path if your supabase client lives elsewhere
import { supabase } from "../../lib/supabase";

// Small blocklist of the most common weak passwords. Not a substitute for a
// breach check, but blocks the obvious ones at sign-up.
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwerty123", "qwertyuiop", "111111111", "abc12345", "letmein123", "iloveyou1",
  "admin123", "welcome1", "welcome123", "passw0rd", "p@ssword1",
]);

export default function Signup() {
  const { colors: c, ready } = useAppTheme();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [signupComplete, setSignupComplete] = useState(false);

  const normalizedUsername = useMemo(() => username.trim().toLowerCase(), [username]);
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  const validate = () => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const un = normalizedUsername;
    const em = normalizedEmail;

    if (!fn || !ln || !un || !em || !password) return "Please fill out all fields.";
    if (un.length < 3) return "Username must be at least 3 characters.";
    if (!/^[a-z0-9._-]+$/.test(un)) return "Username can only use letters, numbers, ., _, and -";
    if (!em.includes("@")) return "Please enter a valid email.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
      return "Password must include at least one letter and one number.";
    if (COMMON_PASSWORDS.has(password.toLowerCase()))
      return "That password is too common. Please choose a stronger one.";
    return null;
  };

 const handleSignup = async () => {
  setErrorMsg(null);

  const v = validate();
  if (v) {
    setErrorMsg(v);
    return;
  }

  try {
    setBusy(true);

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          username: normalizedUsername,
        },
      },
    });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      setErrorMsg("Account created, but no user returned. Please try signing in.");
      return;
    }

    if (!data.session) {
      // "Confirm email" is on: there is no session yet, so the profile row
      // can't be written from here (anon has no UPDATE grant on users — by
      // design). Stash the chosen username locally; it is applied right after
      // the first successful sign-in (lib/pending-profile.ts).
      await savePendingProfile({
        email: normalizedEmail,
        username: normalizedUsername,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      setSignupComplete(true);
      return;
    }

    const { error: upErr } = await supabase
      .from("users")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        username: normalizedUsername,
        email: normalizedEmail,
      })
      .eq("userid", userId);

    if (upErr) {
      // 23505 = unique_violation (username/email already taken). Match on the
      // Postgres error code, not a fragile substring of the message text.
      if ((upErr as { code?: string }).code === "23505") {
        setErrorMsg("Username or email is already in use.");
      } else {
        setErrorMsg(upErr.message || "Profile setup failed.");
      }
      return;
    }

    router.replace("/(tabs)");
  } catch (e: any) {
    setErrorMsg(e?.message ?? "Sign up failed.");
  } finally {
    setBusy(false);
  }
};

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (signupComplete) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <EmptyState
          illustration={
            <Ionicons name="mail-unread-outline" size={64} color={c.tint} accessibilityElementsHidden={true} />
          }
          title="Check your email"
          body={`We sent a confirmation link to ${email.trim()}. Confirm it, then sign in — your username will be ready.`}
          ctaLabel="Go to sign in"
          onCta={() => router.replace("/(auth)")}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.topRow}>
          <Pressable
            onPress={() => router.back()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={20} color={c.text} accessibilityElementsHidden={true} />
            <Text style={{ color: c.text, fontWeight: "600" }}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: c.text }]}>Create account</Text>
          <Text style={[styles.subtitle, { color: c.mutedText }]}>
            Sign up to start generating lesson plans.
          </Text>
        </View>

        {/* Form Card */}
        <Animated.View
          entering={enterUp()}
          style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
        >
          <View style={styles.nameRow}>
            <Input
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              autoCapitalize="words"
              containerStyle={[styles.inputWrap, styles.half]}
              editable={!busy}
            />

            <Input
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              autoCapitalize="words"
              containerStyle={[styles.inputWrap, styles.half]}
              editable={!busy}
            />
          </View>

          <Input
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            autoCapitalize="none"
            containerStyle={styles.inputWrap}
            editable={!busy}
          />

          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            containerStyle={styles.inputWrap}
            editable={!busy}
          />

          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="Password (min 8 chars)"
            secureTextEntry
            containerStyle={styles.inputWrap}
            editable={!busy}
          />

          <Pressable
            onPress={handleSignup}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Sign Up"
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: c.tint },
              pressed && { opacity: 0.9 },
              busy && { opacity: 0.7 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={c.onTint} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: c.onTint }]}>Sign Up</Text>
            )}
          </Pressable>

          {errorMsg ? (
            <Text accessibilityLiveRegion="polite" style={[styles.error, { color: c.danger }]}>
              {errorMsg}
            </Text>
          ) : null}
        </Animated.View>

        {/* Footer */}
        <View style={styles.footerRow}>
          <Text style={{ color: c.mutedText }}>Already have an account? </Text>
          <Pressable
            onPress={() => router.replace("/(auth)")}
            disabled={busy}
            accessibilityRole="link"
            accessibilityLabel="Sign in"
          >
            <Text style={[styles.link, { color: c.tint }]}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 64,
    justifyContent: "center",
  },

  topRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 8,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },

  titleBlock: { marginTop: 10, marginBottom: 14 },
  title: { ...Typography.h1 },
  subtitle: { ...Typography.bodySm, marginTop: 6 },

  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },

  nameRow: {
    flexDirection: "row",
    gap: 10,
  },
  half: { flex: 1 },

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

  error: { ...Typography.bodySm, marginTop: 10 },

  footerRow: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  link: { fontWeight: "800" },
});
