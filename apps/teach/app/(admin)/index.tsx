import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { router } from "expo-router";
import AnimatedPressable from "../../components/AnimatedPressable";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorState } from "../../components/ui";
import { AvatarPalette, OnAvatar } from "../../constants/colors";
import { Typography } from "../../constants/fonts";
import { useAppTheme } from "../../context/theme";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import { supabase } from "../../lib/supabase";

type ThemeColors = ReturnType<typeof useAppTheme>["colors"];

/** Semantic tone for a summary-card note; resolved to a theme color at render. */
type NoteTone = "positive" | "warning" | "muted";

type SummaryCard = {
  label: string;
  value: string;
  note: string;
  noteTone: NoteTone;
};

type PlanStatus = "ACTIVE" | "DRAFT" | "REVIEW" | "UPCOMING";

type LessonPlanItem = {
  lessonPlanId: string;
  title: string;
  subtitle: string;
  progress: number;
  status: PlanStatus;
  updatedAt: string;
};

/** Semantic teacher activity state; resolved to a theme color at render. */
type TeacherTone = "active" | "hasPlans" | "idle";

type TeacherItem = {
  userId: string;
  initials: string;
  name: string;
  subtitle: string;
  plans: number;
  avatarColor: string;
  statusTone: TeacherTone;
};

type ActivityItem = {
  title: string;
  time: string;
  status: PlanStatus;
};

type TermCardData = {
  label: string;
  detail: string;
  progress: number;
};

type DashboardData = {
  greetingName: string;
  schoolName: string;
  termCard: TermCardData;
  summaryCards: SummaryCard[];
  lessonPlans: LessonPlanItem[];
  teachers: TeacherItem[];
  activities: ActivityItem[];
};

type TeacherProfile = {
  userId: string;
  fullName: string;
  firstName: string;
  initials: string;
  role: string;
  createdAt: string | null;
};

type LessonPlanRow = {
  lesson_plan_id: string;
  user_id: string;
  title: string;
  status: "draft" | "published";
  start_date: string;
  end_date: string;
  term: string;
  academic_year: string | null;
  created_at: string;
  updated_at: string;
  subject?: { code?: string | null; title?: string | null } | null;
  section?: { name?: string | null } | null;
};

type BlockRow = {
  lesson_plan_id: string;
  slot_id: string | null;
};

type SubjectRow = {
  subject_id: string;
  code: string;
  title: string;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
};

type MembershipRow = {
  created_at: string;
  user_id: string;
  user?: {
    userid?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    role?: string | null;
    created_at?: string | null;
  } | null;
};

type StatusStyle = { text: string; chipBg: string; chipText: string; bar: string };

function getStatusStyles(c: ThemeColors): Record<PlanStatus, StatusStyle> {
  return {
    ACTIVE: { text: "ACTIVE", chipBg: c.tintSoft, chipText: c.category.lesson.onSoft, bar: c.tint },
    DRAFT: { text: "DRAFT", chipBg: c.warningSoft, chipText: c.category.writtenWork.onSoft, bar: c.warning },
    REVIEW: { text: "REVIEW", chipBg: c.dangerSoft, chipText: c.danger, bar: c.danger },
    UPCOMING: { text: "UPCOMING", chipBg: c.infoSoft, chipText: c.info, bar: c.info },
  };
}

/** Identity ramp for plan accent bars, drawn from the category tokens so it adapts per scheme. */
function getAccentPalette(c: ThemeColors): readonly string[] {
  return [
    c.category.exam.base,
    c.category.performanceTask.base,
    c.category.lesson.base,
    c.category.buffer.base,
    c.category.writtenWork.base,
  ];
}

const EMPTY_DASHBOARD: DashboardData = {
  greetingName: "Admin",
  schoolName: "",
  termCard: {
    label: "NO ACTIVE TERM",
    detail: "Create a lesson plan to populate this dashboard",
    progress: 0,
  },
  summaryCards: [
    { label: "TEACHERS", value: "0", note: "No teachers yet", noteTone: "muted" },
    { label: "SYLLABUSES", value: "0", note: "No subjects yet", noteTone: "muted" },
    { label: "LESSON PLANS", value: "0", note: "No plans yet", noteTone: "muted" },
    { label: "COMPLETION", value: "0%", note: "No scheduled blocks", noteTone: "muted" },
  ],
  lessonPlans: [],
  teachers: [],
  activities: [],
};

function extractOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function toLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toDateLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00`);
}

function formatMonthDay(value: string) {
  return parseDateOnly(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

function differenceInDays(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatName(firstName?: string | null, lastName?: string | null) {
  const parts = [firstName?.trim(), lastName?.trim()].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return "Unknown User";
}

function formatInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "NA";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function roleLabel(role: string) {
  if (role === "superadmin") return "Super Admin";
  if (role === "admin") return "Admin";
  return "Teacher";
}

function formatTermLabel(term: string | null | undefined) {
  if (!term) return "CURRENT TERM";
  return term.replace(/_/g, " ").toUpperCase();
}

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function progressForPlan(blocks: BlockRow[]) {
  if (blocks.length === 0) return 0;
  const assigned = blocks.filter((block) => Boolean(block.slot_id)).length;
  return clampPercent((assigned / blocks.length) * 100);
}

function getPlanStatus(plan: LessonPlanRow, progress: number, today: string): PlanStatus {
  if (plan.start_date > today) return "UPCOMING";
  if (plan.status === "draft" && progress >= 80) return "REVIEW";
  if (plan.status === "draft") return "DRAFT";
  return "ACTIVE";
}

function getPaletteColor(seed: string, palette: readonly string[]) {
  const hash = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function buildTermCard(plans: LessonPlanRow[], today: string): TermCardData {
  const current = [...plans]
    .filter((plan) => plan.start_date <= today && plan.end_date >= today)
    .sort((a, b) => a.end_date.localeCompare(b.end_date))[0];
  const upcoming = [...plans]
    .filter((plan) => plan.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];

  if (current) {
    const totalDays = Math.max(1, differenceInDays(parseDateOnly(current.start_date), parseDateOnly(current.end_date)) + 1);
    const elapsedDays = Math.max(0, totalDays - (differenceInDays(new Date(), parseDateOnly(current.end_date)) + 1));
    const daysLeft = Math.max(0, differenceInDays(new Date(), parseDateOnly(current.end_date)));
    return {
      label: formatTermLabel(current.term),
      detail: `Ends ${formatMonthDay(current.end_date)} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
      // Inclusive term math; on the final day (today >= end_date) show 100%.
      progress: today >= current.end_date ? 100 : clampPercent((elapsedDays / totalDays) * 100),
    };
  }

  if (upcoming) {
    const daysUntil = Math.max(0, differenceInDays(new Date(), parseDateOnly(upcoming.start_date)));
    return {
      label: formatTermLabel(upcoming.term),
      detail: `Starts ${formatMonthDay(upcoming.start_date)} · in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
      progress: 8,
    };
  }

  return EMPTY_DASHBOARD.termCard;
}

// ─── Animated sub-components ─────────────────────────────────────────────────

type SummaryCardItemProps = { card: SummaryCard; index: number; cardBg: string; borderColor: string; textColor: string; mutedColor: string };
function SummaryCardItem({ card, index, cardBg, borderColor, textColor, mutedColor }: SummaryCardItemProps) {
  const { colors: c } = useAppTheme();
  const noteColor =
    card.noteTone === "positive"
      ? c.category.lesson.onSoft
      : card.noteTone === "warning"
        ? c.category.writtenWork.onSoft
        : c.mutedText;
  return (
    <Animated.View
      entering={FadeInDown.duration(280).delay(index * 60)}
      style={[styles.summaryCard, { backgroundColor: cardBg, borderColor, shadowColor: c.shadow }]}
    >
      <Text style={[styles.summaryLabel, { color: mutedColor }]}>{card.label}</Text>
      <Text style={[styles.summaryValue, { color: textColor }]}>{card.value}</Text>
      <Text style={[styles.summaryNote, { color: noteColor }]}>{card.note}</Text>
    </Animated.View>
  );
}

type PlanRowItemProps = { plan: LessonPlanItem; index: number; isLast: boolean; borderColor: string; textColor: string; mutedColor: string };
function PlanRowItem({ plan, index, isLast, borderColor, textColor, mutedColor }: PlanRowItemProps) {
  const { colors: c } = useAppTheme();
  const statusStyle = getStatusStyles(c)[plan.status];
  const accent = getPaletteColor(plan.lessonPlanId, getAccentPalette(c));
  return (
    <Animated.View
      entering={FadeInDown.duration(280).delay(index * 50)}
      style={[styles.planRow, !isLast && { borderBottomWidth: 1, borderBottomColor: borderColor }]}
    >
      <View style={[styles.planAccent, { backgroundColor: accent }]} />
      <View style={styles.planMain}>
        <View style={styles.planTopRow}>
          <View style={styles.planTextWrap}>
            <Text style={[styles.planTitle, { color: textColor }]} numberOfLines={1}>{plan.title}</Text>
            <Text style={[styles.planSubtitle, { color: mutedColor }]} numberOfLines={1}>{plan.subtitle}</Text>
          </View>
          <View style={styles.planMeta}>
            <View style={[styles.statusChip, { backgroundColor: statusStyle.chipBg }]}>
              <Text style={[styles.statusChipText, { color: statusStyle.chipText }]}>{statusStyle.text}</Text>
            </View>
            <View style={styles.progressWrap}>
              <View style={[styles.progressTrack, { backgroundColor: c.hairline }]}>
                <View style={[styles.progressFill, { width: `${plan.progress}%`, backgroundColor: statusStyle.bar }]} />
              </View>
              <Text style={[styles.progressValue, { color: mutedColor }]}>{`${plan.progress}%`}</Text>
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

type TeacherRowItemProps = { teacher: TeacherItem; index: number; isLast: boolean; borderColor: string; textColor: string; mutedColor: string };
function TeacherRowItem({ teacher, index, isLast, borderColor, textColor, mutedColor }: TeacherRowItemProps) {
  const { colors: c } = useAppTheme();
  const statusColor =
    teacher.statusTone === "active" ? c.tint : teacher.statusTone === "hasPlans" ? c.warning : c.faintText;
  return (
    <Animated.View
      entering={FadeInDown.duration(280).delay(index * 55)}
      style={[styles.teacherRow, !isLast && { borderBottomWidth: 1, borderBottomColor: borderColor }]}
    >
      <View style={[styles.teacherAvatar, { backgroundColor: teacher.avatarColor }]}>
        <Text style={styles.teacherAvatarText}>{teacher.initials}</Text>
      </View>
      <View style={styles.teacherMain}>
        <Text style={[styles.teacherName, { color: textColor }]}>{teacher.name}</Text>
        <Text style={[styles.teacherSubtitle, { color: mutedColor }]}>{teacher.subtitle}</Text>
      </View>
      <View style={styles.teacherMeta}>
        <Text style={[styles.teacherPlanCount, { color: textColor }]}>{teacher.plans}</Text>
        <Text style={[styles.teacherPlanLabel, { color: mutedColor }]}>plans</Text>
      </View>
      <View style={[styles.teacherStatusDot, { backgroundColor: statusColor }]} />
    </Animated.View>
  );
}

type ActivityRowItemProps = { activity: ActivityItem; index: number; isLast: boolean; borderColor: string; textColor: string; mutedColor: string };
function ActivityRowItem({ activity, index, isLast, borderColor, textColor, mutedColor }: ActivityRowItemProps) {
  const { colors: c } = useAppTheme();
  const dotColor = getStatusStyles(c)[activity.status].bar;
  return (
    <Animated.View
      entering={FadeInDown.duration(280).delay(index * 50)}
      style={[styles.activityRow, !isLast && { borderBottomWidth: 1, borderBottomColor: borderColor }]}
    >
      <View style={[styles.activityDot, { backgroundColor: dotColor }]} />
      <View style={styles.activityMain}>
        <Text style={[styles.activityTitle, { color: textColor }]}>{activity.title}</Text>
        <Text style={[styles.activityTime, { color: mutedColor }]}>{activity.time}</Text>
      </View>
    </Animated.View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AdminDashboardScreen() {
  const { colors: c } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData>(EMPTY_DASHBOARD);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("No signed-in user found.");

      const [{ data: profileRow, error: profileError }, { data: schoolRows, error: schoolsError }] =
        await Promise.all([
          supabase
            .from("users")
            .select("first_name, last_name")
            .eq("userid", user.id)
            .maybeSingle(),
          supabase
            .from("user_schools")
            .select("is_primary, school:schools(school_id, name)")
            .eq("user_id", user.id)
            .order("is_primary", { ascending: false })
            .limit(1),
        ]);

      if (profileError) throw profileError;
      if (schoolsError) throw schoolsError;

      const primaryMembership = schoolRows?.[0];
      const school = extractOne(primaryMembership?.school);
      if (!school?.school_id) {
        setDashboard({
          ...EMPTY_DASHBOARD,
          greetingName: profileRow?.first_name?.trim() || "Admin",
        });
        return;
      }

      const schoolId = String(school.school_id);
      const today = toLocalDateString();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoIso = weekAgo.toISOString();

      const [membershipsResult, subjectsResult, lessonPlansResult] = await Promise.all([
        supabase
          .from("user_schools")
          .select("created_at, user_id, user:users(userid, first_name, last_name, role, created_at)")
          .eq("school_id", schoolId),
        supabase
          .from("subjects")
          .select("subject_id, code, title, status, created_at, updated_at")
          .eq("school_id", schoolId)
          .order("code", { ascending: true }),
        supabase
          .from("lesson_plans")
          .select(
            "lesson_plan_id, user_id, title, status, start_date, end_date, term, academic_year, created_at, updated_at, subject:subjects(code, title), section:sections(name)"
          )
          .eq("school_id", schoolId)
          .order("updated_at", { ascending: false }),
      ]);

      if (membershipsResult.error) throw membershipsResult.error;
      if (subjectsResult.error) throw subjectsResult.error;
      if (lessonPlansResult.error) throw lessonPlansResult.error;

      const memberships = ((membershipsResult.data ?? []) as MembershipRow[]).map((row) => ({
        ...row,
        user: extractOne(row.user),
      }));
      const subjects = (subjectsResult.data ?? []) as SubjectRow[];
      const lessonPlans = ((lessonPlansResult.data ?? []) as any[]).map((row) => ({
        ...row,
        subject: extractOne(row.subject),
        section: extractOne(row.section),
      })) as LessonPlanRow[];

      const lessonPlanIds = lessonPlans.map((plan) => plan.lesson_plan_id);
      const blocks = lessonPlanIds.length
        ? await supabase
            .from("blocks")
            .select("lesson_plan_id, slot_id")
            .in("lesson_plan_id", lessonPlanIds)
        : { data: [] as BlockRow[], error: null };

      if (blocks.error) throw blocks.error;

      const blocksByPlan = new Map<string, BlockRow[]>();
      for (const block of (blocks.data ?? []) as BlockRow[]) {
        const rows = blocksByPlan.get(block.lesson_plan_id) ?? [];
        rows.push(block);
        blocksByPlan.set(block.lesson_plan_id, rows);
      }

      const teacherProfiles = memberships
        .map((row) => {
          const member = row.user;
          const role = String(member?.role ?? "");
          const fullName = formatName(member?.first_name, member?.last_name);
          return {
            userId: String(row.user_id),
            fullName,
            firstName: String(member?.first_name ?? fullName.split(" ")[0] ?? "Admin"),
            initials: formatInitials(fullName),
            role,
            createdAt: member?.created_at ? String(member.created_at) : null,
          } satisfies TeacherProfile;
        })
        .filter((profile) => profile.role === "teacher");

      const teacherById = new Map(teacherProfiles.map((profile) => [profile.userId, profile]));
      const termCard = buildTermCard(lessonPlans, today);

      const planProgressById = new Map<string, number>();
      for (const plan of lessonPlans) {
        planProgressById.set(plan.lesson_plan_id, progressForPlan(blocksByPlan.get(plan.lesson_plan_id) ?? []));
      }

      const plansPerTeacher = new Map<string, number>();
      let activeTeacherCount = 0;
      for (const plan of lessonPlans) {
        plansPerTeacher.set(plan.user_id, (plansPerTeacher.get(plan.user_id) ?? 0) + 1);
      }
      for (const profile of teacherProfiles) {
        const hasActivePlan = lessonPlans.some(
          (plan) => plan.user_id === profile.userId && plan.start_date <= today && plan.end_date >= today
        );
        if (hasActivePlan) activeTeacherCount += 1;
      }

      const visiblePlans = [...lessonPlans]
        .sort((a, b) => {
          const aCurrent = a.start_date <= today && a.end_date >= today ? 0 : a.start_date > today ? 1 : 2;
          const bCurrent = b.start_date <= today && b.end_date >= today ? 0 : b.start_date > today ? 1 : 2;
          if (aCurrent !== bCurrent) return aCurrent - bCurrent;
          return b.updated_at.localeCompare(a.updated_at);
        })
        .slice(0, 5)
        .map((plan) => {
          const teacher = teacherById.get(plan.user_id);
          const progress = planProgressById.get(plan.lesson_plan_id) ?? 0;
          const status = getPlanStatus(plan, progress, today);
          const subjectCode = String(plan.subject?.code ?? "PLAN");
          const sectionName = String(plan.section?.name ?? "No section");
          const teacherName = teacher?.fullName ?? "Unknown Teacher";

          return {
            lessonPlanId: plan.lesson_plan_id,
            title: `${subjectCode} - ${plan.title}`,
            subtitle: `${teacherName} · ${sectionName}`,
            progress,
            status,
            updatedAt: plan.updated_at,
          } satisfies LessonPlanItem;
        });

      const teachers = teacherProfiles
        .map((teacher) => {
          const planCount = plansPerTeacher.get(teacher.userId) ?? 0;
          const hasActivePlan = lessonPlans.some(
            (plan) => plan.user_id === teacher.userId && plan.start_date <= today && plan.end_date >= today
          );

          return {
            userId: teacher.userId,
            initials: teacher.initials,
            name: teacher.fullName,
            subtitle: `${roleLabel(teacher.role)}${planCount > 0 ? ` · ${planCount} plan${planCount === 1 ? "" : "s"}` : ""}`,
            plans: planCount,
            avatarColor: getPaletteColor(teacher.userId, AvatarPalette),
            statusTone: hasActivePlan ? "active" : planCount > 0 ? "hasPlans" : "idle",
          } satisfies TeacherItem;
        })
        .sort((a, b) => (b.plans !== a.plans ? b.plans - a.plans : a.name.localeCompare(b.name)))
        .slice(0, 4);

      const recentActivities = [...lessonPlans]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 4)
        .map((plan) => {
          const teacher = teacherById.get(plan.user_id);
          const teacherName = teacher?.fullName ?? "A teacher";
          const progress = planProgressById.get(plan.lesson_plan_id) ?? 0;
          const activityVerb = plan.created_at === plan.updated_at ? "created" : "updated";
          const status = getPlanStatus(plan, progress, today);
          return {
            title: `${teacherName} ${activityVerb} ${plan.title}`,
            time: formatRelativeTime(plan.updated_at),
            status,
          } satisfies ActivityItem;
        });

      const teacherCount = teacherProfiles.length;
      const newTeachersThisWeek = teacherProfiles.filter(
        (teacher) => teacher.createdAt && teacher.createdAt >= weekAgoIso
      ).length;
      const pendingSyllabuses = subjects.filter((subject) => subject.status === "draft").length;
      const newPlansThisWeek = lessonPlans.filter((plan) => plan.created_at >= weekAgoIso).length;
      const averageCompletion =
        lessonPlans.length > 0
          ? clampPercent(
              lessonPlans.reduce((sum, plan) => sum + (planProgressById.get(plan.lesson_plan_id) ?? 0), 0) /
                lessonPlans.length
            )
          : 0;

      const summaryCards: SummaryCard[] = [
        {
          label: "TEACHERS",
          value: String(teacherCount),
          note:
            newTeachersThisWeek > 0
              ? `+${newTeachersThisWeek} this week`
              : teacherCount > 0
                ? `${activeTeacherCount} active now`
                : "No teachers yet",
          noteTone: teacherCount > 0 ? "positive" : "muted",
        },
        {
          label: "SYLLABUSES",
          value: String(subjects.length),
          note:
            pendingSyllabuses > 0
              ? `${pendingSyllabuses} pending`
              : subjects.length > 0
                ? "All published"
                : "No subjects yet",
          noteTone: pendingSyllabuses > 0 ? "warning" : "positive",
        },
        {
          label: "LESSON PLANS",
          value: String(lessonPlans.length),
          note:
            newPlansThisWeek > 0
              ? `+${newPlansThisWeek} this week`
              : lessonPlans.length > 0
                ? "No new plans this week"
                : "No plans yet",
          noteTone: lessonPlans.length > 0 ? "positive" : "muted",
        },
        {
          label: "COMPLETION",
          value: `${averageCompletion}%`,
          note:
            lessonPlans.length > 0
              ? `${visiblePlans.filter((plan) => plan.status === "ACTIVE").length} active plans`
              : "No scheduled blocks",
          noteTone: averageCompletion >= 70 ? "positive" : "warning",
        },
      ];

      setDashboard({
        greetingName: profileRow?.first_name?.trim() || "Admin",
        schoolName: String(school.name ?? ""),
        termCard,
        summaryCards,
        lessonPlans: visiblePlans,
        teachers,
        activities: recentActivities,
      });
    } catch (err: any) {
      Alert.alert("Unable to load dashboard", err?.message ?? "Please try again.");
      setDashboard(EMPTY_DASHBOARD);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const { refreshing, onRefresh } = usePullToRefresh(loadDashboard);

  const now = useMemo(() => new Date(), []);
  const dateLabel = toDateLabel(now);
  const greeting = greetingForHour(now.getHours());
  const screenBg = c.surfaceAlt;
  const cardBg = c.card;
  const sectionCardBg = c.card;
  const borderColor = c.border;

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: screenBg }]} edges={["bottom"]}>
        <View style={styles.center}>
          <ActivityIndicator color={c.tint} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: screenBg }]} edges={["bottom"]}>
        <View style={styles.center}>
          <ErrorState title="Unable to load dashboard" onRetry={loadDashboard} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: screenBg }]} edges={["bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
      >
        <Animated.View entering={FadeIn.duration(380)} style={styles.heroHeader}>
          <Text style={[styles.dateText, { color: c.mutedText }]}>{dateLabel}</Text>
          <Text style={[styles.greetingText, { color: c.text }]}>{`${greeting}, ${dashboard.greetingName}`}</Text>
          {dashboard.schoolName ? (
            <Text style={[styles.schoolNameText, { color: c.mutedText }]}>{dashboard.schoolName}</Text>
          ) : null}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(320).delay(60)}
          style={[styles.termCard, { backgroundColor: c.tintSoft, borderColor: c.category.lesson.border }]}
        >
          <Text style={[styles.termLabel, { color: c.category.lesson.onSoft }]}>{dashboard.termCard.label}</Text>
          <Text style={[styles.termMeta, { color: c.category.lesson.onSoft }]}>{dashboard.termCard.detail}</Text>
          <View style={[styles.termTrack, { backgroundColor: c.category.lesson.border }]}>
            <View style={[styles.termFill, { backgroundColor: c.tint, width: `${dashboard.termCard.progress}%` }]} />
          </View>
        </Animated.View>

        <View style={styles.summaryGrid}>
          {dashboard.summaryCards.map((card, i) => (
            <SummaryCardItem
              key={card.label}
              card={card}
              index={i}
              cardBg={cardBg}
              borderColor={borderColor}
              textColor={c.text}
              mutedColor={c.mutedText}
            />
          ))}
        </View>

        <Animated.View entering={FadeInDown.duration(260).delay(300)} style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Lesson plans</Text>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="See all lesson plans"
            onPress={() => router.navigate("/(admin)/plans" as any)}
          >
            <Text style={[styles.seeAllText, { color: c.tintDeep }]}>See all</Text>
          </AnimatedPressable>
        </Animated.View>

        <View style={[styles.listCard, { backgroundColor: sectionCardBg, borderColor, shadowColor: c.shadow }]}>
          {dashboard.lessonPlans.length > 0 ? (
            dashboard.lessonPlans.map((plan, index) => (
              <PlanRowItem
                key={plan.lessonPlanId}
                plan={plan}
                index={index}
                isLast={index === dashboard.lessonPlans.length - 1}
                borderColor={borderColor}
                textColor={c.text}
                mutedColor={c.mutedText}
              />
            ))
          ) : (
            <Text style={[styles.emptyText, { color: c.mutedText }]}>No lesson plans found for this school.</Text>
          )}
        </View>

        <Animated.View entering={FadeInDown.duration(260).delay(360)} style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Teachers</Text>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="See all teachers"
            onPress={() => router.navigate("/(admin)/teachers" as any)}
          >
            <Text style={[styles.seeAllText, { color: c.tintDeep }]}>See all</Text>
          </AnimatedPressable>
        </Animated.View>

        <View style={[styles.listCard, { backgroundColor: sectionCardBg, borderColor, shadowColor: c.shadow }]}>
          {dashboard.teachers.length > 0 ? (
            dashboard.teachers.map((teacher, index) => (
              <TeacherRowItem
                key={teacher.userId}
                teacher={teacher}
                index={index}
                isLast={index === dashboard.teachers.length - 1}
                borderColor={borderColor}
                textColor={c.text}
                mutedColor={c.mutedText}
              />
            ))
          ) : (
            <Text style={[styles.emptyText, { color: c.mutedText }]}>No teachers found in this school.</Text>
          )}
        </View>

        <Animated.View entering={FadeInDown.duration(260).delay(420)} style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Recent activity</Text>
        </Animated.View>

        <View style={[styles.listCard, { backgroundColor: sectionCardBg, borderColor, shadowColor: c.shadow }]}>
          {dashboard.activities.length > 0 ? (
            dashboard.activities.map((activity, index) => (
              <ActivityRowItem
                key={`${activity.title}-${activity.time}`}
                activity={activity}
                index={index}
                isLast={index === dashboard.activities.length - 1}
                borderColor={borderColor}
                textColor={c.text}
                mutedColor={c.mutedText}
              />
            ))
          ) : (
            <Text style={[styles.emptyText, { color: c.mutedText }]}>No recent activity yet.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 36,
    gap: 18,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  heroHeader: {
    gap: 2,
  },
  dateText: {
    ...Typography.bodyMedium,
  },
  greetingText: {
    ...Typography.display,
  },
  schoolNameText: {
    ...Typography.bodyMedium,
  },
  termCard: {
    borderWidth: 1.5,
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 22,
    gap: 10,
  },
  termLabel: {
    ...Typography.h3,
    letterSpacing: 0.5,
  },
  termMeta: {
    ...Typography.body,
  },
  termTrack: {
    marginTop: 6,
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
  },
  termFill: {
    height: "100%",
    borderRadius: 999,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  summaryCard: {
    width: "47.5%",
    minHeight: 152,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 22,
    justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 1,
  },
  summaryLabel: {
    ...Typography.label,
    marginBottom: 10,
  },
  summaryValue: {
    ...Typography.display,
    fontSize: 44,
    lineHeight: 46,
    letterSpacing: -1.2,
  },
  summaryNote: {
    marginTop: 2,
    ...Typography.bodySm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sectionTitle: {
    ...Typography.h2,
  },
  seeAllText: {
    ...Typography.bodyMedium,
  },
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
  planRow: {
    flexDirection: "row",
    paddingVertical: 20,
    paddingRight: 16,
    paddingLeft: 14,
  },
  planAccent: {
    width: 5,
    borderRadius: 999,
    marginVertical: 4,
    marginRight: 18,
  },
  planMain: {
    flex: 1,
  },
  planTopRow: {
    flexDirection: "row",
    gap: 12,
  },
  planTextWrap: {
    flex: 1,
    gap: 2,
  },
  planTitle: {
    ...Typography.h3,
  },
  planSubtitle: {
    ...Typography.bodySm,
  },
  planMeta: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    minWidth: 112,
    gap: 10,
  },
  statusChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusChipText: {
    ...Typography.label,
  },
  progressWrap: {
    alignItems: "flex-end",
    width: 96,
    gap: 4,
  },
  progressTrack: {
    width: "100%",
    height: 5,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  progressValue: {
    ...Typography.bodySm,
  },
  teacherRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  teacherAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 18,
  },
  teacherAvatarText: {
    ...Typography.h1,
    color: OnAvatar,
  },
  teacherMain: {
    flex: 1,
    gap: 2,
  },
  teacherName: {
    ...Typography.h3,
  },
  teacherSubtitle: {
    ...Typography.bodySm,
  },
  teacherMeta: {
    alignItems: "flex-end",
    minWidth: 54,
    marginLeft: 12,
  },
  teacherPlanCount: {
    ...Typography.h2,
  },
  teacherPlanLabel: {
    ...Typography.bodySm,
    marginTop: -2,
  },
  teacherStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: 18,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  activityDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 5,
    marginRight: 18,
  },
  activityMain: {
    flex: 1,
    gap: 6,
  },
  activityTitle: {
    ...Typography.bodyMedium,
  },
  activityTime: {
    ...Typography.bodySm,
  },
});
