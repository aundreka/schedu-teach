import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import React, { useEffect, useState } from "react";
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

const getParamsFromUrl = (url: string) => {
  const queryPart = url.includes("?") ? url.slice(url.indexOf("?") + 1).split("#")[0] : "";
  const hashPart = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
  return new URLSearchParams([queryPart, hashPart].filter(Boolean).join("&"));
};

export default function UpdatePassword() {
  const { colors: c, ready } = useAppTheme();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const incomingUrl = Linking.useURL();

  useEffect(() => {
    let cancelled = false;

    const restoreRecoverySession = async () => {
      try {
        setRestoringSession(true);
        setErrorMsg(null);

        const initialUrl = incomingUrl ?? (await Linking.getInitialURL()) ?? "";
        const params = initialUrl ? getParamsFromUrl(initialUrl) : null;

        const accessToken = params?.get("access_token");
        const refreshToken = params?.get("refresh_token");
        const errorCode = params?.get("error_code");
        const errorDescription = params?.get("error_description");

        if (errorCode || errorDescription) {
          if (!cancelled) {
            setSessionReady(false);
            setErrorMsg(errorDescription || errorCode || "Recovery link is invalid.");
          }
          return;
        }

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            if (!cancelled) {
              setSessionReady(false);
              setErrorMsg(error.message || "Could not verify recovery link.");
            }
            return;
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!cancelled) {
          setSessionReady(!!session);
          if (!session) {
            setErrorMsg("Recovery session not found. Request a new reset link.");
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setSessionReady(false);
          setErrorMsg(e?.message ?? "Could not restore recovery session.");
        }
      } finally {
        if (!cancelled) setRestoringSession(false);
      }
    };

    void restoreRecoverySession();

    return () => {
      cancelled = true;
    };
  }, [incomingUrl]);

  const handleUpdatePassword = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!password || !confirmPassword) {
      setErrorMsg("Please enter and confirm your new password.");
      return;
    }

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    try {
      setBusy(true);

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setSuccessMsg("Password updated successfully.");
      setTimeout(() => router.replace("/(tabs)"), 900);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not update password.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready || restoringSession) {
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
            onPress={() => router.replace("/(auth)")}
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
          <Text style={[styles.title, { color: c.text }]}>Set new password</Text>
          <Text style={[styles.subtitle, { color: c.mutedText }]}>
            Choose a new password for your schEDU account.
          </Text>
        </View>

        <Animated.View
          entering={enterUp()}
          style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
        >
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="New password"
            secureTextEntry
            containerStyle={styles.inputWrap}
            editable={sessionReady && !busy}
          />

          <Input
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm new password"
            secureTextEntry
            containerStyle={styles.inputWrap}
            editable={sessionReady && !busy}
          />

          <Pressable
            onPress={handleUpdatePassword}
            disabled={!sessionReady || busy}
            accessibilityRole="button"
            accessibilityLabel="Update Password"
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: c.tint },
              pressed && { opacity: 0.9 },
              (!sessionReady || busy) && { opacity: 0.7 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={c.onTint} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: c.onTint }]}>Update Password</Text>
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
});
