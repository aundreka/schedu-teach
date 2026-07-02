import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../context/theme";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import { supabase } from "../../lib/supabase";
import { useSubscriptionContext } from "../../context/subscription";
import { Button, Card, ListRow } from "../../components/ui";
import { Spacing } from "../../constants/fonts";

const TIER_LABELS = { free: "Free Plan", tier1: "PRO Plan", tier2: "MAX Plan" } as const;

const OPTIONS = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
] as const;

export default function Settings() {
  const { theme, setTheme, colors: c } = useAppTheme();
  const sub = useSubscriptionContext();
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [initialEmail, setInitialEmail] = useState("");
  const [savedDetails, setSavedDetails] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
  });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  const currentLabel = OPTIONS.find((o) => o.value === theme)?.label ?? "System";

  const loadUserDetails = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error) throw error;
      if (!user) throw new Error("No signed-in user found.");

      setUserId(user.id);
      const authEmail = user.email ?? "";
      setInitialEmail(authEmail);

      const { data: row, error: profileErr } = await supabase
        .from("users")
        .select("first_name, last_name, username, email")
        .eq("userid", user.id)
        .maybeSingle();
      if (profileErr) throw profileErr;

      const nextDetails = {
        firstName: row?.first_name ?? "",
        lastName: row?.last_name ?? "",
        username: row?.username ?? "",
        email: row?.email ?? authEmail,
      };
      setSavedDetails(nextDetails);
      setFirstName(nextDetails.firstName);
      setLastName(nextDetails.lastName);
      setUsername(nextDetails.username);
      setEmail(nextDetails.email);
    } catch {
      // Do NOT blank the form on a failed load: a subsequent save would upsert
      // all-null values over the user's real profile. Flag the error instead and
      // block editing/saving until a successful reload.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUserDetails();
  }, [loadUserDetails]);

  const { refreshing, onRefresh } = usePullToRefresh(loadUserDetails);

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete account",
      "This permanently deletes your account and all your data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const { data: sessionData } = await supabase.auth.getSession();
              const token = sessionData?.session?.access_token;
              if (!token) throw new Error("Not signed in.");

              const res = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
                {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token}` },
                }
              );
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error((body as { error?: string }).error ?? "Unknown error");
              }
              await supabase.auth.signOut();
            } catch (err: unknown) {
              Alert.alert("Error", (err as Error)?.message ?? "Could not delete account.");
            }
          },
        },
      ]
    );
  };

  const handleSaveDetails = async () => {
    if (!userId) return;
    if (loadError) {
      Alert.alert("Can't save yet", "Your profile failed to load. Pull to refresh and try again.");
      return;
    }
    setSaving(true);
    try {
      const nextEmail = email.trim();
      const payload = {
        userid: userId,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        username: username.trim() || null,
        email: nextEmail || null,
      };

      const { error: profileErr } = await supabase.from("users").upsert(payload, {
        onConflict: "userid",
      });
      if (profileErr) throw profileErr;

      if (nextEmail && nextEmail !== initialEmail) {
        const { error: authErr } = await supabase.auth.updateUser({ email: nextEmail });
        if (authErr) throw authErr;
        setInitialEmail(nextEmail);
      }

      const nextSaved = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: username.trim(),
        email: nextEmail,
      };
      setSavedDetails(nextSaved);
      setIsEditing(false);
    } catch (err: unknown) {
      Alert.alert("Couldn't save", (err as Error)?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
      >
        <View style={styles.screenTopRow}>
          <Text style={[styles.screenTitle, { color: c.text }]}>Settings</Text>
        </View>

        {/* My Plan */}
        <Card padded={false} style={styles.listCard}>
          <ListRow
            title="My Plan"
            subtitle={`${TIER_LABELS[sub.tier]} · View usage & upgrade`}
            onPress={() => router.push("/profile/subscription")}
            divider={false}
          />
        </Card>

        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.title, { color: c.text }]}>User Details</Text>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={c.tint} />
            </View>
          ) : loadError ? (
            <View style={styles.detailsWrap}>
              <Text style={[styles.detailLabel, { color: c.mutedText, marginBottom: 12 }]}>
                We couldn&apos;t load your profile. Pull down to refresh and try again.
              </Text>
              <Button title="Retry" variant="secondary" onPress={() => void loadUserDetails()} />
            </View>
          ) : !isEditing ? (
            <View style={styles.detailsWrap}>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: c.mutedText }]}>First name</Text>
                <Text style={[styles.detailValue, { color: c.text }]}>{savedDetails.firstName || "-"}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: c.mutedText }]}>Last name</Text>
                <Text style={[styles.detailValue, { color: c.text }]}>{savedDetails.lastName || "-"}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: c.mutedText }]}>Username</Text>
                <Text style={[styles.detailValue, { color: c.text }]}>{savedDetails.username || "-"}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: c.mutedText }]}>Email</Text>
                <Text style={[styles.detailValue, { color: c.text }]}>{savedDetails.email || "-"}</Text>
              </View>

              <Button
                title="Edit"
                variant="secondary"
                onPress={() => setIsEditing(true)}
                accessibilityLabel="Edit user details"
              />
            </View>
          ) : (
            <View style={styles.formWrap}>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                placeholderTextColor={c.mutedText}
                style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
              />
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name"
                placeholderTextColor={c.mutedText}
                style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
              />
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="Username"
                autoCapitalize="none"
                placeholderTextColor={c.mutedText}
                style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
              />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={c.mutedText}
                style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
              />
              <Button
                title="Save"
                onPress={handleSaveDetails}
                loading={saving}
                accessibilityLabel="Save user details"
              />
              <Button
                title="Cancel"
                variant="secondary"
                disabled={saving}
                onPress={() => {
                  setFirstName(savedDetails.firstName);
                  setLastName(savedDetails.lastName);
                  setUsername(savedDetails.username);
                  setEmail(savedDetails.email);
                  setIsEditing(false);
                }}
              />
            </View>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.title, { color: c.text }]}>Appearance</Text>

          <Pressable
            onPress={() => setOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Theme: ${currentLabel}`}
            accessibilityHint="Opens the theme picker"
            style={[styles.dropdown, { backgroundColor: c.card, borderColor: c.border }]}
          >
            <Text style={{ color: c.text, fontSize: 14 }}>{currentLabel}</Text>
            <Ionicons name="chevron-down" size={18} color={c.mutedText} />
          </Pressable>
        </View>

        <Pressable
          onPress={handleDeleteAccount}
          style={styles.deleteRow}
          accessibilityRole="button"
          accessibilityLabel="Delete Account"
        >
          <Text style={[styles.deleteText, { color: c.danger }]}>Delete Account</Text>
        </Pressable>
      </ScrollView>

      {/* Modal */}
      <Modal transparent animationType="fade" visible={open}>
        <Pressable
          style={[styles.overlay, { backgroundColor: c.backdrop }]}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close theme picker"
        />

        <View style={[styles.sheet, { backgroundColor: c.card, borderColor: c.border }]}>
          {OPTIONS.map((opt, i) => {
            const active = opt.value === theme;
            return (
              <ListRow
                key={opt.value}
                title={opt.label}
                onPress={() => {
                  setTheme(opt.value);
                  setOpen(false);
                }}
                chevron={false}
                divider={i < OPTIONS.length - 1}
                right={active ? <Ionicons name="checkmark" size={18} color={c.tint} /> : undefined}
                accessibilityLabel={active ? `${opt.label}, selected` : opt.label}
                style={styles.option}
              />
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28, gap: 12 },
  screenTopRow: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  screenTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  listCard: { paddingHorizontal: Spacing.lg },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  loadingWrap: {
    minHeight: 64,
    justifyContent: "center",
    alignItems: "center",
  },
  detailsWrap: { gap: 10 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  formWrap: { gap: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  dropdown: {
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  overlay: {
    flex: 1,
  },

  sheet: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 32,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 6,
  },

  option: {
    paddingHorizontal: 16,
  },
  deleteRow: { alignItems: "center", paddingVertical: 8 },
  deleteText: { fontSize: 13 },
});
