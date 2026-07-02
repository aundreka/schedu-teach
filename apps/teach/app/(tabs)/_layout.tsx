import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs } from "expo-router";
import { type Href, router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppHeader from "../../components/header";
import { useAppTheme } from "../../context/theme";

type CreateOption = {
  key: "lessonplan" | "subject" | "lesson" | "activities";
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: Href;
};

const CREATE_OPTIONS: CreateOption[] = [
  {
    key: "lessonplan",
    label: "Lessonplan",
    icon: "reader-outline",
    route: "/(tabs)/create/lessonplan",
  },
  { key: "subject", label: "Subject", icon: "albums-outline", route: "/(tabs)/create/subject" },
  { key: "lesson", label: "Lesson", icon: "create-outline", route: "/(tabs)/create/lesson" },
  {
    key: "activities",
    label: "Activities",
    icon: "cube-outline",
    route: "/(tabs)/create/activities",
  },
];

export default function TabsLayout() {
  const { colors: c } = useAppTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  useEffect(() => {
    setCreateSheetOpen(false);
  }, [pathname]);

  const closeCreateSheet = useCallback(() => setCreateSheetOpen(false), []);
  const openCreateSheet = useCallback(() => setCreateSheetOpen(true), []);
  const goToCreate = useCallback((route: Href) => {
    setCreateSheetOpen(false);
    router.push(route);
  }, []);

  // Create-hub option colors come from the shared session-category ramp so
  // they stay in the same family as the calendar/library and recolor in dark.
  const optionColors = useMemo(() => {
    const cat = c.category;
    const tone = (t: { soft: string; onSoft: string; border: string }) => ({
      bg: t.soft,
      border: t.border,
      fg: t.onSoft,
    });
    return {
      lessonplan: tone(cat.lesson),
      subject: tone(cat.performanceTask),
      lesson: tone(cat.writtenWork),
      activities: tone(cat.exam),
    } as const;
  }, [c.category]);

  return (
    <>
      <Tabs
        screenOptions={{
          header: () => <AppHeader />,
          tabBarActiveTintColor: c.text,
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
          name="calendar"
          options={{
            title: "Calendar",
            tabBarIcon: ({ size, color }) => (
              <Ionicons name="calendar-outline" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="create"
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              openCreateSheet();
            },
          }}
          options={{
            title: "Create",
            tabBarIcon: ({ size, color }) => <Ionicons name="add" size={size} color={color} />,
          }}
        />

        <Tabs.Screen
          name="library"
          listeners={{
            tabPress: (e) => {
              if (pathname.startsWith("/library") && pathname !== "/library") {
                e.preventDefault();
                router.replace("/library");
              }
            },
          }}
          options={{
            title: "Library",
            tabBarIcon: ({ size, color }) => (
              <Ionicons name="book-outline" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="plans"
          options={{
            title: "Plans",
            href: "/plans",
            tabBarIcon: ({ size, color }) => (
              <Ionicons name="bookmark-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>

      <Modal visible={createSheetOpen} transparent animationType="fade" onRequestClose={closeCreateSheet}>
        <Pressable style={styles.overlay} onPress={closeCreateSheet}>
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: c.card,
                borderColor: c.border,
                marginBottom: 76 + insets.bottom,
              },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.row}>
              {CREATE_OPTIONS.map((option) => (
                <Pressable
                  key={option.key}
                  style={[
                    styles.option,
                    {
                      backgroundColor: optionColors[option.key].bg,
                      borderColor: optionColors[option.key].border,
                    },
                  ]}
                  onPress={() => goToCreate(option.route)}
                  accessibilityRole="button"
                  accessibilityLabel={`Create ${option.label.toLowerCase()}`}
                >
                  <Ionicons name={option.icon} size={24} color={optionColors[option.key].fg} />
                  <Text style={[styles.optionText, { color: optionColors[option.key].fg }]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.12)", // lighter than c.backdrop by design: the tab bar stays legible
    paddingHorizontal: 12,
  },
  sheet: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  option: {
    flex: 1,
    minHeight: 80,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  optionText: {
    fontSize: 12,
    fontWeight: "400",
  },
});
