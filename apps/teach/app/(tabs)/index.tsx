// app/(tabs)/index.tsx
//
// Home dashboard. Two stacked sections:
//   • Upcoming — the soonest day (on or after today) that has scheduled blocks
//     across ALL of the teacher's lesson plans, one card per (plan, time slot)
//     with chips for each block placed in that slot.
//   • Overview — the rich detail content of the soonest block on that day
//     (lessons render their tiptap content in a WebView; written work and
//     performance tasks fall back to the block's description text).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import AnimatedPressable from "../../components/AnimatedPressable";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type {
  JsonObject,
  SessionCategory,
  SessionSubcategory,
} from "../../algorithm/00_types";
import {
  formatLongDate,
  formatTime12,
  labelBlocks,
  loadUserPlansWithLessons,
  toneFor,
  todayISO,
  type DayBlock,
  type RawBlockGroup,
} from "../../components/calendar";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui";
import { PlanSeed } from "../../components/illustrations";
import { useLoadState } from "../../hooks/useLoadState";
import { Radius, Spacing, Typography } from "../../constants/fonts";
import { useAppTheme } from "../../context/theme";
import { getTermForDate } from "../../lib/deped-calendar";
import {
  extractLessonContent,
  normalizeToHtml,
  tiptapDocumentHtml,
  type WebMessage,
} from "../../lib/lesson-editor";
import { subscribeToLessonPlanRefresh } from "../../lib/lesson-plan-refresh";
import { supabase } from "../../lib/supabase";
import { formatTermProgress } from "../../lib/term-progress";

type ClassCard = {
  id: string;
  lessonPlanId: string;
  subjectCode: string;
  subjectTitle: string;
  subtitle: string;
  color: string;
  startTime: string;
  endTime: string;
  blocks: DayBlock[];
};

type UpcomingData = {
  dateISO: string;
  cards: ClassCard[];
  firstBlock: DayBlock | null;
};

type OverviewKind = "lesson" | "text" | "empty";

type OverviewContent = {
  kind: OverviewKind;
  title: string;
  html: string; // for "lesson"
  text: string; // for "text"
};

function parseWebHeight(event: WebViewMessageEvent): number | null {
  try {
    const data = JSON.parse(event.nativeEvent.data) as WebMessage;
    if (data.type !== "height") return null;
    const next = Number(data.height);
    return Number.isFinite(next) ? Math.max(180, Math.ceil(next)) : null;
  } catch {
    return null;
  }
}

function chipLabel(block: DayBlock): string {
  const prefix = block.label && block.label !== "—" ? block.label : "";
  if (block.category === "lesson") {
    const num = prefix.replace(/^L/, "");
    const head = num ? `Lesson ${num}` : "Lesson";
    return `${head}: ${block.title}`;
  }
  const m = prefix.match(/^([A-Za-z]+)(\d+)?$/);
  const head = m ? (m[2] ? `${m[1]} ${m[2]}` : m[1]) : prefix;
  return head ? `${head}: ${block.title}` : block.title;
}

function timeRange(start: string, end: string): string {
  return `${formatTime12(start)} to ${formatTime12(end)}`;
}

function normTime(value: unknown): string {
  const m = String(value ?? "").match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return "00:00:00";
  return `${m[1].padStart(2, "0")}:${m[2]}:${(m[3] ?? "00").padStart(2, "0")}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function metadataScopeIds(metadata: JsonObject | null | undefined, fallback: string | null): string[] {
  const raw = metadata?.scope_lesson_ids;
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);
  return fallback ? [fallback] : [];
}

function groupCards(entries: DayBlock[]): ClassCard[] {
  const byKey = new Map<string, ClassCard>();
  for (const entry of entries) {
    const key = `${entry.lessonPlanId}::${entry.startTime}::${entry.endTime}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.blocks.push(entry);
    } else {
      byKey.set(key, {
        id: key,
        lessonPlanId: entry.lessonPlanId,
        subjectCode: entry.subjectCode,
        subjectTitle: entry.subjectTitle,
        subtitle: entry.subtitle,
        color: entry.color,
        startTime: entry.startTime,
        endTime: entry.endTime,
        blocks: [entry],
      });
    }
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.startTime.localeCompare(b.startTime) ||
    a.endTime.localeCompare(b.endTime) ||
    a.subjectCode.localeCompare(b.subjectCode),
  );
}

async function loadSoonestData(userId: string, fromISO: string): Promise<UpcomingData | null> {
  const plans = await loadUserPlansWithLessons(userId);
  if (plans.length === 0) return null;

  const planIds = plans.map((p) => p.lessonPlanId);
  const [{ data: slotRows }, { data: blockRows }] = await Promise.all([
    // Only future slots matter for "upcoming"; past slots are dropped by the
    // date < fromISO check below anyway, so scope the fetch instead of loading
    // every slot across every plan on each focus.
    supabase
      .from("slots")
      .select("slot_id, lesson_plan_id, slot_date")
      .in("lesson_plan_id", planIds)
      .gte("slot_date", fromISO),
    supabase
      .from("blocks")
      .select(
        "block_id, lesson_plan_id, slot_id, root_block_id, lesson_id, session_category, session_subcategory, title, start_time, end_time, order_no, metadata",
      )
      .in("lesson_plan_id", planIds),
  ]);

  const slotDateById = new Map<string, string>();
  for (const slot of slotRows ?? []) {
    if (slot?.slot_id) slotDateById.set(String(slot.slot_id), String(slot.slot_date ?? ""));
  }

  const dateOf = (block: any): string => {
    if (block?.slot_id) return slotDateById.get(String(block.slot_id)) ?? "";
    const md = block?.metadata?.manual_date;
    return typeof md === "string" ? md : "";
  };

  let soonest: string | null = null;
  for (const block of blockRows ?? []) {
    const date = dateOf(block);
    if (!date || date < fromISO) continue;
    if (!soonest || date < soonest) soonest = date;
  }
  if (!soonest) return null;

  const planById = new Map(plans.map((p) => [p.lessonPlanId, p]));
  const blocksByPlan = new Map<string, any[]>();
  for (const block of blockRows ?? []) {
    const pid = String(block?.lesson_plan_id ?? "");
    if (!pid) continue;
    const list = blocksByPlan.get(pid);
    if (list) list.push(block);
    else blocksByPlan.set(pid, [block]);
  }

  const entries: DayBlock[] = [];
  for (const [planId, planBlocks] of blocksByPlan) {
    const plan = planById.get(planId);
    if (!plan) continue;

    const groups = new Map<string, RawBlockGroup>();
    for (const block of planBlocks) {
      const gid = block?.root_block_id ? String(block.root_block_id) : String(block?.block_id ?? "");
      if (!gid) continue;
      const date = dateOf(block);
      const existing = groups.get(gid);
      if (existing) {
        if (date && !existing.dates.includes(date)) existing.dates.push(date);
      } else {
        groups.set(gid, {
          id: gid,
          category: (block?.session_category as SessionCategory) ?? "lesson",
          subcategory: (block?.session_subcategory as SessionSubcategory) ?? null,
          rawTitle: String(block?.title ?? "Block"),
          metadata: (block?.metadata as JsonObject) ?? null,
          dates: date ? [date] : [],
        });
      }
    }
    const labelByGid = new Map(labelBlocks(Array.from(groups.values())).map((l) => [l.id, l]));

    for (const block of planBlocks) {
      if (dateOf(block) !== soonest) continue;
      const gid = block?.root_block_id ? String(block.root_block_id) : String(block?.block_id ?? "");
      const labeled = labelByGid.get(gid);
      const lessonId = block?.lesson_id ? String(block.lesson_id) : null;
      const rawLock = block?.metadata?.lock_reason;
      const lockReason =
        typeof rawLock === "string" && rawLock.trim() ? String(rawLock).trim() : null;
      entries.push({
        blockId: String(block?.block_id ?? gid),
        groupId: gid,
        label: (labeled?.prefix ?? "").replace(/:$/, "") || "—",
        title: labeled?.title ?? String(block?.title ?? ""),
        category: labeled?.category ?? ((block?.session_category as SessionCategory) ?? "lesson"),
        subcategory: labeled?.subcategory ?? ((block?.session_subcategory as SessionSubcategory) ?? null),
        scopeLessonIds: metadataScopeIds(block?.metadata as JsonObject | null, lessonId),
        lessonId,
        startTime: normTime(block?.start_time),
        endTime: normTime(block?.end_time),
        manual: block?.metadata?.manual === true || block?.slot_id == null,
        isSuspended: Boolean(lockReason),
        lockReason,
        lessonPlanId: planId,
        subjectId: plan.subjectId,
        subjectTitle: plan.subjectTitle,
        subjectCode: plan.subjectCode,
        subtitle: plan.subtitle,
        color: plan.color,
      });
    }
  }

  entries.sort(
    (a, b) =>
      a.startTime.localeCompare(b.startTime) ||
      a.endTime.localeCompare(b.endTime) ||
      a.subjectTitle.localeCompare(b.subjectTitle) ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  );

  return {
    dateISO: soonest,
    cards: groupCards(entries),
    firstBlock: entries[0] ?? null,
  };
}

async function loadOverviewContent(block: DayBlock | null): Promise<OverviewContent> {
  if (!block) return { kind: "empty", title: "", html: "<p></p>", text: "" };
  const title = chipLabel(block);

  if (block.category === "lesson" && block.lessonId) {
    const { data } = await supabase
      .from("lessons")
      .select("content")
      .eq("lesson_id", block.lessonId)
      .maybeSingle();
    const raw = data?.content ? String(data.content) : null;
    return {
      kind: "lesson",
      title,
      html: normalizeToHtml(extractLessonContent(raw)),
      text: "",
    };
  }

  // Assessment blocks (written work / performance task / exam) have no lesson body of
  // their own, so compose a genuinely useful overview from the lessons the assessment
  // covers — the topics it spans and their learning objectives — instead of only the
  // one-line block description. Falls back to the description when no scope is known.
  const { data: blockRow } = await supabase
    .from("blocks")
    .select("description")
    .eq("block_id", block.blockId)
    .maybeSingle();
  const description = blockRow?.description ? String(blockRow.description).trim() : "";

  const scopeIds = block.scopeLessonIds ?? [];
  if (scopeIds.length > 0) {
    const { data: lessonRows } = await supabase
      .from("lessons")
      .select("lesson_id, title, learning_objectives, sequence_no")
      .in("lesson_id", scopeIds);
    const lessons = (lessonRows ?? [])
      .slice()
      .sort((a, b) => Number(a?.sequence_no ?? 0) - Number(b?.sequence_no ?? 0));
    if (lessons.length > 0) {
      const kindLabel =
        block.category === "exam"
          ? "exam"
          : block.category === "performance_task"
            ? "performance task"
            : "written work";
      const items = lessons
        .map((lesson) => {
          const lessonTitle = escapeHtml(String(lesson?.title ?? "Lesson"));
          const objectives = lesson?.learning_objectives
            ? escapeHtml(String(lesson.learning_objectives).trim())
            : "";
          return `<li><strong>${lessonTitle}</strong>${
            objectives ? `<br/>${objectives}` : ""
          }</li>`;
        })
        .join("");
      const intro = description ? `<p>${escapeHtml(description)}</p>` : "";
      const html = normalizeToHtml(
        `${intro}<p><strong>What this ${kindLabel} covers</strong></p><ul>${items}</ul>`,
      );
      return { kind: "lesson", title, html, text: "" };
    }
  }

  return { kind: "text", title, html: "<p></p>", text: description };
}

function openBlockDetail(block: DayBlock) {
  if (block.category === "lesson" && block.lessonId) {
    router.push({
      pathname: "/library/lesson_detail",
      params: { lessonId: block.lessonId, subjectId: block.subjectId },
    });
    return;
  }
  if (block.category === "performance_task") {
    router.push({
      pathname: "/library/pt_detail",
      params: { planEntryId: block.blockId, subjectId: block.subjectId },
    });
    return;
  }
  // written_work, exam, buffer
  router.push({
    pathname: "/library/ww_detail",
    params: { planEntryId: block.blockId, subjectId: block.subjectId },
  });
}

type ClassRowProps = {
  card: ClassCard;
  index: number;
  textColor: string;
  borderColor: string;
};

function ClassRow({ card, index, textColor, borderColor }: ClassRowProps) {
  const { scheme } = useAppTheme();
  return (
    <Animated.View
      style={styles.classRow}
      entering={FadeInDown.duration(320).springify().delay(index * 60)}
    >
      <View style={[styles.classBar, { backgroundColor: card.color }]} />
      <View style={styles.classText}>
        <Text style={[styles.classSubject, { color: textColor }]} numberOfLines={1}>
          {card.subjectCode || card.subjectTitle.toUpperCase()}
        </Text>
        <Text style={[styles.classSubtitle, { color: textColor }]} numberOfLines={1}>
          {card.subtitle}
        </Text>
        <Text style={[styles.classTime, { color: textColor }]} numberOfLines={1}>
          {timeRange(card.startTime, card.endTime)}
        </Text>
      </View>
      <View style={[styles.classDivider, { backgroundColor: borderColor }]} />
      <View style={styles.chipColumn}>
        {card.blocks.map((block) => {
          const tone = toneFor(block.category, scheme);
          return (
            <AnimatedPressable
              key={block.blockId}
              onPress={() => openBlockDetail(block)}
              animatedStyle={[styles.chip, { borderColor: tone.bg, backgroundColor: tone.bg }]}
              hitSlop={4}
            >
              <Text style={[styles.chipText, { color: tone.fg }]} numberOfLines={2}>
                {chipLabel(block)}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

function DoubleChevron({ color }: { color: string }) {
  return (
    <View style={styles.doubleChevron}>
      <Ionicons name="chevron-forward" size={18} color={color} />
      <Ionicons name="chevron-forward" size={18} color={color} style={styles.doubleChevronSecond} />
    </View>
  );
}

export default function Home() {
  const { colors: c } = useAppTheme();
  const today = useMemo(() => todayISO(), []);
  const termInfo = useMemo(() => getTermForDate(today), [today]);
  const termPill = useMemo(() => {
    if (!termInfo) return null;
    return formatTermProgress([termInfo.term], today);
  }, [termInfo, today]);

  const [overviewHeight, setOverviewHeight] = useState(260);

  const {
    status,
    data: home,
    reload,
    refreshing,
    onRefresh,
  } = useLoadState(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    const upcoming = userId ? await loadSoonestData(userId, today) : null;
    const overview = await loadOverviewContent(upcoming?.firstBlock ?? null);
    return { upcoming, overview };
  }, [today]);

  const data = home?.upcoming ?? null;
  const overview = home?.overview ?? { kind: "empty" as OverviewKind, title: "", html: "<p></p>", text: "" };

  useEffect(() => {
    setOverviewHeight(260);
  }, [data?.firstBlock?.blockId]);

  useEffect(() => {
    return subscribeToLessonPlanRefresh(() => {
      reload();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overviewSource = useMemo(
    () => ({ html: tiptapDocumentHtml({ editable: false, initialHtml: overview.html }) }),
    [overview.html],
  );

  const onOpenDay = useCallback(() => {
    router.push("/(tabs)/calendar/daily");
  }, []);

  const onOpenOverview = useCallback(() => {
    if (data?.firstBlock) openBlockDetail(data.firstBlock);
  }, [data?.firstBlock]);

  const cardShellBg = c.card;

  if (status === "loading") {
    return (
      <View style={[styles.page, { backgroundColor: c.background, padding: Spacing.lg }]}>
        <Skeleton width={170} height={26} radius={Radius.round} />
        <View style={{ height: Spacing.xxl }} />
        <Skeleton width={110} height={14} />
        <View style={{ height: Spacing.md }} />
        <Skeleton height={78} radius={Radius.md} />
        <View style={{ height: Spacing.md }} />
        <Skeleton height={78} radius={Radius.md} />
        <View style={{ height: Spacing.xxl }} />
        <Skeleton width={110} height={14} />
        <View style={{ height: Spacing.md }} />
        <Skeleton height={220} radius={Radius.lg} />
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={[styles.page, styles.center, { backgroundColor: c.background }]}>
        <ErrorState title="Couldn't load your classes" onRetry={reload} />
      </View>
    );
  }

  if (!data) {
    return (
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, styles.center, { flexGrow: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
      >
        <EmptyState
          illustration={<PlanSeed size={220} />}
          title="Let's plan your school year"
          body="Pick a subject and schEDU distributes lessons, quizzes and exams around the DepEd calendar for you."
          ctaLabel="Create your first plan"
          onCta={() => router.push("/(tabs)/create/lessonplan")}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
    >
      {termPill ? (
        <Animated.View
          entering={FadeIn.duration(400)}
          style={[styles.termPill, { backgroundColor: c.tint + "1A", borderColor: c.tint }]}
        >
          <Ionicons name="calendar-outline" size={14} color={c.tint} />
          <Text style={[styles.termPillText, { color: c.tint }]}>
            {termPill}
            {termInfo ? ` · SY ${termInfo.sy.label}` : ""}
          </Text>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.duration(300).delay(60)} style={styles.section}>
        <Text style={[styles.kicker, { color: c.mutedText }]}>Upcoming</Text>
        <AnimatedPressable animatedStyle={styles.sectionHeadRow} onPress={onOpenDay} hitSlop={6}>
          <Text style={[styles.sectionTitle, { color: c.text }]} numberOfLines={1}>
            {formatLongDate(data.dateISO)}
          </Text>
          <DoubleChevron color={c.mutedText} />
        </AnimatedPressable>
        <View style={[styles.sectionTitleUnderline, { backgroundColor: c.border }]} />

        {data.cards.length === 0 ? (
          <Text style={[styles.emptyText, { color: c.mutedText }]}>Nothing scheduled.</Text>
        ) : (
          <View style={styles.cardList}>
            {data.cards.map((card, i) => (
              <ClassRow
                key={card.id}
                card={card}
                index={i}
                textColor={c.text}
                borderColor={c.border}
              />
            ))}
          </View>
        )}
      </Animated.View>

      <View style={[styles.sectionDivider, { backgroundColor: c.border }]} />

      <Animated.View entering={FadeInDown.duration(300).delay(120)} style={styles.section}>
        <Text style={[styles.kicker, { color: c.mutedText }]}>Overview</Text>
        <AnimatedPressable
          animatedStyle={styles.sectionHeadRow}
          onPress={onOpenOverview}
          hitSlop={6}
          disabled={!data.firstBlock}
        >
          <Text style={[styles.sectionTitle, { color: c.text }]} numberOfLines={2}>
            {overview.title || "—"}
          </Text>
          {data.firstBlock ? <DoubleChevron color={c.mutedText} /> : null}
        </AnimatedPressable>

        {(() => {
          if (overview.kind === "lesson") return (
            <View
              style={[
                styles.overviewShell,
                { backgroundColor: cardShellBg, borderColor: c.border, height: overviewHeight },
              ]}
            >
              <WebView
                originWhitelist={["*"]}
                source={overviewSource}
                key={`overview-${data.firstBlock?.blockId ?? "none"}`}
                onMessage={(event) => {
                  const next = parseWebHeight(event);
                  if (next) setOverviewHeight(next);
                }}
                scrollEnabled={false}
                javaScriptEnabled
                automaticallyAdjustContentInsets={false}
                style={styles.webview}
              />
            </View>
          );
          if (overview.kind === "text") return (
            <View
              style={[styles.overviewShell, styles.overviewTextShell, { backgroundColor: cardShellBg, borderColor: c.border }]}
            >
              <Text style={[styles.overviewBody, { color: c.text }]}>
                {overview.text || "No description added yet."}
              </Text>
            </View>
          );
          return (
            <Text style={[styles.emptyText, { color: c.mutedText }]}>Nothing to preview.</Text>
          );
        })()}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  scroll: {
    paddingBottom: Spacing.xxxl,
  },
  termPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.round,
    borderWidth: 1,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  termPillText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  kicker: {
    ...Typography.body,
    fontSize: 14,
  },
  sectionHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  sectionTitle: {
    ...Typography.h2,
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
    marginRight: Spacing.sm,
  },
  sectionTitleUnderline: {
    height: 1,
    marginTop: 4,
  },
  sectionDivider: {
    height: 1,
    marginVertical: Spacing.lg,
    marginHorizontal: Spacing.lg,
  },
  cardList: {
    marginTop: Spacing.md,
    gap: Spacing.lg,
  },
  classRow: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 78,
  },
  classBar: {
    width: 4,
    borderRadius: 2,
    marginRight: Spacing.md,
  },
  classText: {
    flex: 1,
    justifyContent: "center",
    gap: 1,
  },
  classSubject: {
    ...Typography.h2,
    fontWeight: "800",
    fontStyle: "italic",
  },
  classSubtitle: {
    ...Typography.body,
    fontSize: 13,
  },
  classTime: {
    ...Typography.body,
    fontSize: 13,
  },
  classDivider: {
    width: 1,
    alignSelf: "stretch",
    marginHorizontal: Spacing.md,
  },
  chipColumn: {
    justifyContent: "center",
    gap: 8,
    width: 158,
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  overviewShell: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.lg,
    overflow: "hidden",
  },
  overviewTextShell: {
    padding: Spacing.lg,
  },
  overviewBody: {
    ...Typography.body,
    lineHeight: 22,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  emptyText: {
    ...Typography.body,
    marginTop: Spacing.md,
  },
  doubleChevron: {
    flexDirection: "row",
    alignItems: "center",
  },
  doubleChevronSecond: {
    marginLeft: -10,
  },
});
