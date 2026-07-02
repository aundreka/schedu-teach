import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Linking from "expo-linking";
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

import { Input } from "../../components/ui";
import { Typography } from "../../constants/fonts";
import { useAppTheme } from "../../context/theme";
import { enterUp } from "../../lib/motion";
import { supabase } from "../../lib/supabase";

export default function ForgotPassword() {
  const { colors: c, ready } = useAppTheme();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const redirectTo = useMemo(() => Linking.createURL("auth/update-password"), []);

  const handleResetRequest = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!normalizedEmail) {
      setErrorMsg("Please enter your email address.");
      return;
    }

    if (!normalizedEmail.includes("@")) {
      setErrorMsg("Please enter a valid email.");
      return;
    }

    try {
      setBusy(true);

      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setSuccessMsg("If an account exists for that email, a reset link has been sent.");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not send reset email.");
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

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
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
          <Text style={[styles.title, { color: c.text }]}>Forgot password</Text>
          <Text style={[styles.subtitle, { color: c.mutedText }]}>
            Enter the email linked to your account and we&apos;ll send you a reset link.
          </Text>
        </View>

        <Animated.View
          entering={enterUp()}
          style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
        >
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            containerStyle={styles.inputWrap}
            editable={!busy}
          />

          <Pressable
            onPress={handleResetRequest}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Send Reset Link"
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
              <Text style={[styles.primaryBtnText, { color: c.onTint }]}>Send Reset Link</Text>
            )}
          </Pressable>

          {errorMsg ? (
            <Text accessibilityLiveRegion="polite" style={[styles.error, { color: c.danger }]}>
              {errorMsg}
            </Text>
          ) : null}
          {successMsg ? (
            <Text accessibilityLiveRegion="polite" style={[styles.success, { color: c.tint }]}>
              {successMsg}
            </Text>
          ) : null}
        </Animated.View>

        <View style={styles.footerRow}>
          <Text style={{ color: c.mutedText }}>Remembered your password? </Text>
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
  success: { ...Typography.bodySm, marginTop: 10 },

  footerRow: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  link: { fontWeight: "800" },
});
