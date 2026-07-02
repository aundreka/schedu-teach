import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ErrorState } from "../../../components/ui";
import { AvatarPalette, OnAvatar } from "../../../constants/colors";
import { Typography } from "../../../constants/fonts";
import { useAppTheme } from "../../../context/theme";
import { usePullToRefresh } from "../../../hooks/usePullToRefresh";
import { supabase } from "../../../lib/supabase";

type ThemeColors = ReturnType<typeof useAppTheme>["colors"];

type Department = {
  department_id: string;
  name: string;
};

type TeacherRow = {
  userId: string;
  initials: string;
  name: string;
  departmentId: string | null;
  departmentName: string;
  planCount: number;
  tier: "free" | "tier1" | "tier2";
  hasActivePlan: boolean;
  hasAnyPlan: boolean;
};

type TierStyle = { label: string; bg: string; fg: string };

function getTierStyles(c: ThemeColors): Record<string, TierStyle> {
  return {
    tier2: { label: "PRO", bg: c.tierMaxBg, fg: c.tierMaxFg },
    tier1: { label: "T1", bg: c.infoSoft, fg: c.info },
    free: { label: "FREE", bg: c.surfaceAlt, fg: c.mutedText },
  };
}

function getPaletteColor(seed: string, palette: readonly string[]) {
  const hash = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function formatInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "NA";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function formatName(first?: string | null, last?: string | null) {
  const parts = [first?.trim(), last?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Unknown";
}

function toLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── Animated pill (Pattern D) ────────────────────────────────────────────────

type AnimatedPillProps = {
  label: string;
  isActive: boolean;
  onPress: () => void;
  activeBg: string;
  activeFg: string;
  inactiveBg: string;
  inactiveFg: string;
};

function AnimatedPill({ label, isActive, onPress, activeBg, activeFg, inactiveBg, inactiveFg }: AnimatedPillProps) {
  const progress = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(isActive ? 1 : 0, { duration: 180 });
  }, [isActive, progress]);

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [inactiveBg, activeBg]),
  }));

  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [inactiveFg, activeFg]),
  }));

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: isActive }}>
      <Animated.View style={[styles.pill, bgStyle]}>
        <Animated.Text style={[styles.pillText, textStyle]}>{label}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Teacher list row (Pattern B) ────────────────────────────────────────────

type TeacherListRowProps = {
  teacher: TeacherRow;
  index: number;
  isLast: boolean;
  borderColor: string;
  textColor: string;
  mutedColor: string;
};

function TeacherListRow({ teacher, index, isLast, borderColor, textColor, mutedColor }: TeacherListRowProps) {
  const { colors: c } = useAppTheme();
  const avatarColor = getPaletteColor(teacher.userId, AvatarPalette);
  const statusColor = teacher.hasActivePlan ? c.tint : teacher.hasAnyPlan ? c.warning : c.faintText;
  const tierStyles = getTierStyles(c);
  const tierStyle = tierStyles[teacher.tier] ?? tierStyles.free;

  return (
    <Animated.View
      entering={FadeInDown.duration(280).delay(index * 55)}
      style={[styles.row, !isLast && { borderBottomWidth: 1, borderBottomColor: borderColor }]}
    >
      <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
        <Text style={styles.avatarText}>{teacher.initials}</Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={[styles.teacherName, { color: textColor }]} numberOfLines={1}>{teacher.name}</Text>
        <Text style={[styles.teacherSub, { color: mutedColor }]} numberOfLines={1}>
          {teacher.departmentName}
          {teacher.planCount > 0 ? ` · ${teacher.planCount} plan${teacher.planCount === 1 ? "" : "s"}` : " · No plans"}
        </Text>
      </View>
      <View style={[styles.tierBadge, { backgroundColor: tierStyle.bg }]}>
        <Text style={[styles.tierText, { color: tierStyle.fg }]}>{tierStyle.label}</Text>
      </View>
      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
    </Animated.View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function TeachersScreen() {
  const { colors: c } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  const screenBg = c.surfaceAlt;
  const cardBg = c.card;
  const borderColor = c.border;
  const inputBg = c.card;
  const pillActiveBg = c.tintSoft;
  const pillActiveFg = c.category.lesson.onSoft;
  const pillInactiveBg = c.card;
  const pillInactiveFg = c.mutedText;

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data: schoolRows } = await supabase
        .from("user_schools")
        .select("school_id, is_primary")
        .eq("user_id", user.id)
        .order("is_primary", { ascending: false })
        .limit(1);

      const sid = schoolRows?.[0]?.school_id as string | undefined;
      if (!sid) {
        setTeachers([]);
        setDepartments([]);
        setLoading(false);
        return;
      }
      const today = toLocalDateString();

      const [membershipsResult, deptResult, plansResult] = await Promise.all([
        supabase
          .from("user_schools")
          .select(
            "user_id, department_id, user:users(userid, first_name, last_name, role), subscription:subscriptions(tier)"
          )
          .eq("school_id", sid),
        supabase
          .from("departments")
          .select("department_id, name")
          .eq("school_id", sid)
          .order("name"),
        supabase
          .from("lesson_plans")
          .select("lesson_plan_id, user_id, start_date, end_date")
          .eq("school_id", sid),
      ]);

      if (membershipsResult.error) throw membershipsResult.error;
      if (deptResult.error) throw deptResult.error;
      if (plansResult.error) throw plansResult.error;

      const depts = (deptResult.data ?? []) as Department[];
      setDepartments(depts);

      const deptMap = new Map(depts.map((d) => [d.department_id, d.name]));

      const plans = (plansResult.data ?? []) as {
        lesson_plan_id: string;
        user_id: string;
        start_date: string;
        end_date: string;
      }[];

      const planCountByUser = new Map<string, number>();
      const activePlanUsers = new Set<string>();
      for (const plan of plans) {
        planCountByUser.set(plan.user_id, (planCountByUser.get(plan.user_id) ?? 0) + 1);
        if (plan.start_date <= today && plan.end_date >= today) {
          activePlanUsers.add(plan.user_id);
        }
      }

      const rows: TeacherRow[] = [];
      for (const membership of membershipsResult.data ?? []) {
        const u = Array.isArray(membership.user) ? membership.user[0] : membership.user;
        const sub = Array.isArray(membership.subscription)
          ? membership.subscription[0]
          : membership.subscription;
        if (!u || (u.role !== "teacher")) continue;

        const uid = String(membership.user_id);
        const fullName = formatName(u.first_name, u.last_name);
        const deptId = membership.department_id as string | null;
        const planCount = planCountByUser.get(uid) ?? 0;

        rows.push({
          userId: uid,
          initials: formatInitials(fullName),
          name: fullName,
          departmentId: deptId,
          departmentName: deptId ? (deptMap.get(deptId) ?? "—") : "—",
          planCount,
          tier: (sub?.tier ?? "free") as "free" | "tier1" | "tier2",
          hasActivePlan: activePlanUsers.has(uid),
          hasAnyPlan: planCount > 0,
        });
      }

      rows.sort((a, b) =>
        b.planCount !== a.planCount ? b.planCount - a.planCount : a.name.localeCompare(b.name)
      );
      setTeachers(rows);
      setLoadKey((k) => k + 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Please try again.";
      Alert.alert("Unable to load teachers", message);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { refreshing, onRefresh } = usePullToRefresh(loadData);

  const filtered = useMemo(() => {
    let result = teachers;
    if (selectedDept) {
      result = result.filter((t) => t.departmentId === selectedDept);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) => t.name.toLowerCase().includes(q));
    }
    return result;
  }, [teachers, selectedDept, search]);

  const stats = useMemo(() => {
    const total = teachers.length;
    const active = teachers.filter((t) => t.hasActivePlan).length;
    const noPlans = teachers.filter((t) => !t.hasAnyPlan).length;
    return { total, active, noPlans };
  }, [teachers]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: screenBg }]} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <ActivityIndicator color={c.tint} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: screenBg }]} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <ErrorState title="Unable to load teachers" onRetry={loadData} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: screenBg }]} edges={["top", "bottom"]}>
      <ScrollView
        key={loadKey}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
      >
        <Animated.View entering={FadeInDown.duration(300)} style={styles.header}>
          <Text style={[styles.title, { color: c.text }]}>Teachers</Text>
          <Text style={[styles.subtitle, { color: c.mutedText }]}>
            {stats.total} total · {stats.active} active · {stats.noPlans} without plans
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(280).delay(60)}
          style={[styles.searchRow, { backgroundColor: inputBg, borderColor }]}
        >
          <Ionicons name="search-outline" size={18} color={c.mutedText} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="Search teachers…"
            placeholderTextColor={c.mutedText}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={c.mutedText} />
            </Pressable>
          )}
        </Animated.View>

        {departments.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
          >
            <AnimatedPill
              label="All"
              isActive={selectedDept === null}
              onPress={() => setSelectedDept(null)}
              activeBg={pillActiveBg}
              activeFg={pillActiveFg}
              inactiveBg={pillInactiveBg}
              inactiveFg={pillInactiveFg}
            />
            {departments.map((dept) => (
              <AnimatedPill
                key={dept.department_id}
                label={dept.name}
                isActive={selectedDept === dept.department_id}
                onPress={() => setSelectedDept(selectedDept === dept.department_id ? null : dept.department_id)}
                activeBg={pillActiveBg}
                activeFg={pillActiveFg}
                inactiveBg={pillInactiveBg}
                inactiveFg={pillInactiveFg}
              />
            ))}
          </ScrollView>
        )}

        <View style={[styles.listCard, { backgroundColor: cardBg, borderColor, shadowColor: c.shadow }]}>
          {filtered.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.mutedText }]}>
              {teachers.length === 0
                ? "No teachers in this school yet."
                : "No teachers match your search."}
            </Text>
          ) : (
            filtered.map((teacher, index) => (
              <TeacherListRow
                key={teacher.userId}
                teacher={teacher}
                index={index}
                isLast={index === filtered.length - 1}
                borderColor={borderColor}
                textColor={c.text}
                mutedColor={c.mutedText}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 36, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { gap: 4 },
  title: { ...Typography.display },
  subtitle: { ...Typography.bodySm },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  searchInput: { ...Typography.body, flex: 1 },
  pillRow: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  pillText: { ...Typography.bodyMedium },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 1,
  },
  emptyText: {
    ...Typography.bodyMedium,
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...Typography.h2, color: OnAvatar },
  rowMain: { flex: 1, gap: 2 },
  teacherName: { ...Typography.bodyMedium },
  teacherSub: { ...Typography.bodySm },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tierText: { ...Typography.label },
  statusDot: { width: 11, height: 11, borderRadius: 6 },
});
