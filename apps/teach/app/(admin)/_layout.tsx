import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Tabs, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "../../context/theme";
import { supabase } from "../../lib/supabase";

export default function AdminLayout() {
  const { colors: c } = useAppTheme();
  const insets = useSafeAreaInsets();

  // Server-verified admin gate. The (admin) routes must not render for a
  // non-admin who deep-links here. role lives on public.users and is guarded
  // against self-escalation (database-setup/00_users.sql), so this DB read is
  // an authoritative check, not a client-forgeable one.
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        if (active) setAuthorized(false);
        return;
      }
      const { data, error } = await supabase
        .from("users")
        .select("role")
        .eq("userid", session.user.id)
        .maybeSingle();
      if (!active) return;
      const role = data?.role as string | null | undefined;
      setAuthorized(!error && (role === "admin" || role === "superadmin"));
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authorized === false) router.replace("/(tabs)" as any);
  }, [authorized]);

  if (authorized !== true) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.background }}>
        <ActivityIndicator color={c.tint} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.tint,
        tabBarInactiveTintColor: c.mutedText,
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: c.card,
          borderTopColor: c.border,
          height: 70 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="teachers"
        options={{
          title: "Teachers",
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: "Plans",
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="reader-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Settings",
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
