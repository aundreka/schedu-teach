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
import { useAppTheme } from "../../../context/theme";
import { usePullToRefresh } from "../../../hooks/usePullToRefresh";
import { supabase } from "../../../lib/supabase";

type PlanStatus = "ACTIVE" | "DRAFT" | "REVIEW" | "UPCOMING";

type Department = { department_id: string; name: string };

type PlanRow = {
  planId: string;
  title: string;
  teacherName: string;
  sectionName: string;
  subjectCode: string;
  departmentId: string | null;
  progress: number;
  status: PlanStatus;
  accent: string;
  updatedAt: string;
};

const STATUS_STYLES: Record<PlanStatus, { text: string; chipBg: string; chipText: string; bar: string }> = {
  ACTIVE:   { text: "ACTIVE",    chipBg: "#DFF5EB", chipText: "#146854", bar: "#35B97C" },
  DRAFT:    { text: "DRAFT",     chipBg: "#F8ECD9", chipText: "#7A4B10", bar: "#F0A12E" },
  REVIEW:   { text: "REVIEW",    chipBg: "#F7E4ED", chipText: "#8F2E57", bar: "#D7487B" },
  UPCOMING: { text: "UPCOMING",  chipBg: "#E2EFFD", chipText: "#114E8D", bar: "#3F88E2" },
};

const ACCENT_COLORS = ["#E34B55", "#3E87E0", "#35C18B", "#7B6FDE", "#F39C35"] as const;
const STATUS_FILTERS: (PlanStatus | "ALL")[] = ["ALL", "ACTIVE", "DRAFT", "REVIEW", "UPCOMING"];

function getPaletteColor(seed: string, palette: readonly string[]) {
  const hash = seed.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function toLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function clampPercent(v: number) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function getPlanStatus(
  startDate: string,
  endDate: string,
  dbStatus: string,
  progress: number,
  today: string
): PlanStatus {
  if (startDate > today) return "UPCOMING";
  if (endDate < today) return "DRAFT";
  if (dbStatus === "draft" && progress >= 80) return "REVIEW";
  if (dbStatus === "draft") return "DRAFT";
  return "ACTIVE";
}

function formatName(first?: string | null, last?: string | null) {
  const parts = [first?.trim(), last?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Unknown";
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
    <Pressable onPress={onPress}>
      <Animated.View style={[styles.pill, bgStyle]}>
        <Animated.Text style={[styles.pillText, textStyle]}>{label}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Plan list row (Pattern B) ────────────────────────────────────────────────

type PlanRowItemProps = {
  plan: PlanRow;
  index: number;
  isLast: boolean;
  borderColor: string;
  textColor: string;
  mutedColor: string;
};

function PlanRowItem({ plan, index, isLast, borderColor, textColor, mutedColor }: PlanRowItemProps) {
  const ss = STATUS_STYLES[plan.status];
  return (
    <Animated.View
      entering={FadeInDown.duration(280).delay(index * 50)}
      style={[styles.planRow, !isLast && { borderBottomWidth: 1, borderBottomColor: borderColor }]}
    >
      <View style={[styles.accentBar, { backgroundColor: plan.accent }]} />
      <View style={styles.planMain}>
        <View style={styles.planTopRow}>
          <View style={styles.planTextWrap}>
            <Text style={[styles.planTitle, { color: textColor }]} numberOfLines={1}>{plan.title}</Text>
            <Text style={[styles.planSub, { color: mutedColor }]} numberOfLines={1}>
              {plan.teacherName} · {plan.sectionName}
            </Text>
          </View>
          <View style={styles.planMeta}>
            <View style={[styles.chip, { backgroundColor: ss.chipBg }]}>
              <Text style={[styles.chipText, { color: ss.chipText }]}>{ss.text}</Text>
            </View>
            <View style={styles.progressWrap}>
              <View style={[styles.progressTrack, { backgroundColor: "#E6E9EE" }]}>
                <View style={[styles.progressFill, { width: `${plan.progress}%`, backgroundColor: ss.bar }]} />
              </View>
              <Text style={[styles.progressLabel, { color: mutedColor }]}>{plan.progress}%</Text>
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function PlansScreen() {
  const { colors: c, scheme } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PlanStatus | "ALL">("ALL");
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  const screenBg = scheme === "dark" ? "#11161C" : "#F5F3EE";
  const cardBg = scheme === "dark" ? "#171E27" : "#FFFFFF";
  const borderColor = scheme === "dark" ? "#222B35" : "#E8E1D7";
  const inputBg = scheme === "dark" ? "#171E27" : "#FFFFFF";
  const pillActiveBg = scheme === "dark" ? "#243B30" : "#DFF5EB";
  const pillActiveFg = "#146854";
  const pillInactiveBg = scheme === "dark" ? "#1A2330" : "#F0EDE8";
  const pillInactiveFg = c.mutedText;

  const loadData = useCallback(async () => {
    setLoading(true);
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
        setPlans([]);
        setDepartments([]);
        setLoading(false);
        return;
      }

      const today = toLocalDateString();

      const [plansResult, membershipsResult, , deptResult] = await Promise.all([
        supabase
          .from("lesson_plans")
          .select(
            "lesson_plan_id, user_id, title, status, start_date, end_date, updated_at, subject:subjects(code), section:sections(name)"
          )
          .eq("school_id", sid)
          .order("updated_at", { ascending: false }),
        supabase
          .from("user_schools")
          .select("user_id, department_id, user:users(first_name, last_name)")
          .eq("school_id", sid),
        supabase
          .from("blocks")
          .select("lesson_plan_id, slot_id")
          .in(
            "lesson_plan_id",
            // We'll re-filter after getting plans; pass a placeholder to avoid empty .in()
            ["00000000-0000-0000-0000-000000000000"]
          ),
        supabase
          .from("departments")
          .select("department_id, name")
          .eq("school_id", sid)
          .order("name"),
      ]);

      if (plansResult.error) throw plansResult.error;
      if (membershipsResult.error) throw membershipsResult.error;
      if (deptResult.error) throw deptResult.error;

      const depts = (deptResult.data ?? []) as Department[];
      setDepartments(depts);

      const rawPlans = (plansResult.data ?? []) as {
        lesson_plan_id: string;
        user_id: string;
        title: string;
        status: string;
        start_date: string;
        end_date: string;
        updated_at: string;
        subject: { code?: string | null } | { code?: string | null }[] | null;
        section: { name?: string | null } | { name?: string | null }[] | null;
      }[];

      const planIds = rawPlans.map((p) => p.lesson_plan_id);

      const blocksActual = planIds.length
        ? await supabase
            .from("blocks")
            .select("lesson_plan_id, slot_id")
            .in("lesson_plan_id", planIds)
        : { data: [] as { lesson_plan_id: string; slot_id: string | null }[], error: null };

      if (blocksActual.error) throw blocksActual.error;

      const blocksByPlan = new Map<string, { slot_id: string | null }[]>();
      for (const b of blocksActual.data ?? []) {
        const arr = blocksByPlan.get(b.lesson_plan_id) ?? [];
        arr.push(b);
        blocksByPlan.set(b.lesson_plan_id, arr);
      }

      const membershipByUser = new Map<string, { departmentId: string | null; name: string }>();
      for (const m of membershipsResult.data ?? []) {
        const u = Array.isArray(m.user) ? m.user[0] : m.user;
        const uid = String(m.user_id);
        membershipByUser.set(uid, {
          departmentId: (m.department_id as string | null) ?? null,
          name: formatName(u?.first_name, u?.last_name),
        });
      }

      const rows: PlanRow[] = rawPlans.map((plan) => {
        const planBlocks = blocksByPlan.get(plan.lesson_plan_id) ?? [];
        const assigned = planBlocks.filter((b) => Boolean(b.slot_id)).length;
        const progress = planBlocks.length > 0 ? clampPercent((assigned / planBlocks.length) * 100) : 0;
        const status = getPlanStatus(plan.start_date, plan.end_date, plan.status, progress, today);
        const subject = Array.isArray(plan.subject) ? plan.subject[0] : plan.subject;
        const section = Array.isArray(plan.section) ? plan.section[0] : plan.section;
        const member = membershipByUser.get(plan.user_id);

        return {
          planId: plan.lesson_plan_id,
          title: `${subject?.code ?? "PLAN"} — ${plan.title}`,
          teacherName: member?.name ?? "Unknown",
          sectionName: section?.name ?? "—",
          departmentId: member?.departmentId ?? null,
          progress,
          status,
          accent: getPaletteColor(plan.lesson_plan_id, ACCENT_COLORS),
          updatedAt: plan.updated_at,
        };
      });

      setPlans(rows);
      setLoadKey((k) => k + 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Please try again.";
      Alert.alert("Unable to load plans", message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { refreshing, onRefresh } = usePullToRefresh(loadData);

  const filtered = useMemo(() => {
    let result = plans;
    if (statusFilter !== "ALL") result = result.filter((p) => p.status === statusFilter);
    if (selectedDept) result = result.filter((p) => p.departmentId === selectedDept);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) || p.teacherName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [plans, statusFilter, selectedDept, search]);

  const stats = useMemo(() => {
    const total = plans.length;
    const active = plans.filter((p) => p.status === "ACTIVE").length;
    const avgCompletion =
      plans.length > 0
        ? clampPercent(plans.reduce((sum, p) => sum + p.progress, 0) / plans.length)
        : 0;
    return { total, active, avgCompletion };
  }, [plans]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: screenBg }]} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <ActivityIndicator color={c.tint} />
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
          <Text style={[styles.title, { color: c.text }]}>Lesson Plans</Text>
          <Text style={[styles.subtitle, { color: c.mutedText }]}>
            {stats.total} total · {stats.active} active · {stats.avgCompletion}% avg completion
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(280).delay(60)}
          style={[styles.searchRow, { backgroundColor: inputBg, borderColor }]}
        >
          <Ionicons name="search-outline" size={18} color={c.mutedText} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="Search by plan or teacher…"
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRow}
        >
          {STATUS_FILTERS.map((filter) => (
            <AnimatedPill
              key={filter}
              label={filter}
              isActive={statusFilter === filter}
              onPress={() => setStatusFilter(filter)}
              activeBg={pillActiveBg}
              activeFg={pillActiveFg}
              inactiveBg={pillInactiveBg}
              inactiveFg={pillInactiveFg}
            />
          ))}
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

        <View style={[styles.listCard, { backgroundColor: cardBg, borderColor }]}>
          {filtered.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.mutedText }]}>
              {plans.length === 0 ? "No lesson plans in this school yet." : "No plans match your search."}
            </Text>
          ) : (
            filtered.map((plan, index) => (
              <PlanRowItem
                key={plan.planId}
                plan={plan}
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
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.8 },
  subtitle: { fontSize: 14, fontWeight: "500" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },
  pillRow: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  pillText: { fontSize: 14, fontWeight: "600" },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#A79B89",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 1,
  },
  emptyText: { fontSize: 15, fontWeight: "500", paddingHorizontal: 24, paddingVertical: 22 },
  planRow: {
    flexDirection: "row",
    paddingVertical: 18,
    paddingRight: 16,
    paddingLeft: 12,
  },
  accentBar: { width: 5, borderRadius: 999, marginVertical: 4, marginRight: 14 },
  planMain: { flex: 1 },
  planTopRow: { flexDirection: "row", gap: 12 },
  planTextWrap: { flex: 1, gap: 2 },
  planTitle: { fontSize: 16, fontWeight: "500" },
  planSub: { fontSize: 13, fontWeight: "500" },
  planMeta: { alignItems: "flex-end", justifyContent: "space-between", minWidth: 108, gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  chipText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  progressWrap: { alignItems: "flex-end", width: 90, gap: 3 },
  progressTrack: { width: "100%", height: 5, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  progressLabel: { fontSize: 13, fontWeight: "600" },
});
