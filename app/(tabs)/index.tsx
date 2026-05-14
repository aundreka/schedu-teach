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
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type {
  JsonObject,
  SessionCategory,
  SessionSubcategory,
} from "../../algorithm/00_types";
import {
  DEMO_AGENDA,
  formatLongDate,
  formatTime12,
  labelBlocks,
  loadUserPlansWithLessons,
  toneFor,
  todayISO,
  type DayBlock,
  type RawBlockGroup,
} from "../../components/calendar";
import { Radius, Spacing, Typography } from "../../constants/fonts";
import { useAppTheme } from "../../context/theme";
import {
  extractLessonContent,
  normalizeToHtml,
  tiptapDocumentHtml,
  type WebMessage,
} from "../../lib/lesson-editor";
import { subscribeToLessonPlanRefresh } from "../../lib/lesson-plan-refresh";
import { supabase } from "../../lib/supabase";

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
  demo: boolean;
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
    supabase.from("slots").select("slot_id, lesson_plan_id, slot_date").in("lesson_plan_id", planIds),
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
    demo: false,
  };
}

function demoUpcoming(fromISO: string): UpcomingData {
  // The demo agenda is hard-coded for 2026-10-30. If today is past that, still
  // show it as a sample; otherwise pretend the demo is the next class day.
  const dateISO = DEMO_AGENDA.dateISO >= fromISO ? DEMO_AGENDA.dateISO : DEMO_AGENDA.dateISO;
  return {
    dateISO,
    cards: groupCards(DEMO_AGENDA.entries),
    firstBlock: DEMO_AGENDA.entries[0] ?? null,
    demo: true,
  };
}

async function loadOverviewContent(block: DayBlock | null, demo: boolean): Promise<OverviewContent> {
  if (!block) return { kind: "empty", title: "", html: "<p></p>", text: "" };
  const title = chipLabel(block);

  if (demo) {
    // Static body copy that mirrors the dashboard mock.
    if (block.category === "lesson" && block.title.toLowerCase() === "polynomials") {
      const html = normalizeToHtml(
        "A <strong>polynomial</strong> is a mathematical expression composed of variables, coefficients, and exponents, involving only the operations of addition, subtraction, and multiplication. It consists of a finite number of terms, where each term is a constant or a product of a constant and one or more variables raised to a non-negative integer power. The highest exponent in a polynomial determines its degree.\n\n<strong>Types of polynomials:</strong>\n<ul><li>Monomial: A polynomial with one term — e.g. 5x²</li><li>Binomial: A polynomial with two terms — e.g. x + 3</li><li>Trinomial: A polynomial with three terms</li></ul>",
      );
      return { kind: "lesson", title, html, text: "" };
    }
    return { kind: "text", title, html: "<p></p>", text: "Sample overview content." };
  }

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

  const { data } = await supabase
    .from("blocks")
    .select("description")
    .eq("block_id", block.blockId)
    .maybeSingle();
  const text = data?.description ? String(data.description).trim() : "";
  return { kind: "text", title, html: "<p></p>", text };
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

function DoubleChevron({ color }: { color: string }) {
  return (
    <View style={styles.doubleChevron}>
      <Ionicons name="chevron-forward" size={18} color={color} />
      <Ionicons name="chevron-forward" size={18} color={color} style={styles.doubleChevronSecond} />
    </View>
  );
}

export default function Home() {
  const { colors: c, scheme } = useAppTheme();
  const today = useMemo(() => todayISO(), []);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<UpcomingData | null>(null);
  const [overview, setOverview] = useState<OverviewContent>({ kind: "empty", title: "", html: "<p></p>", text: "" });
  const [overviewHeight, setOverviewHeight] = useState(260);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let userId: string | null = null;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        userId = user?.id ?? null;
      } catch {
        userId = null;
      }

      const next = userId ? await loadSoonestData(userId, today) : null;
      const resolved = next ?? demoUpcoming(today);
      setData(resolved);
      const content = await loadOverviewContent(resolved.firstBlock, resolved.demo);
      setOverview(content);
      setOverviewHeight(260);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return subscribeToLessonPlanRefresh(() => {
      load();
    });
  }, [load]);

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

  const cardShellBg = scheme === "dark" ? c.card : "#FFFFFF";

  if (loading || !data) {
    return (
      <View style={[styles.page, styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.tint} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.section}>
        <Text style={[styles.kicker, { color: c.mutedText }]}>Upcoming</Text>
        <Pressable style={styles.sectionHeadRow} onPress={onOpenDay} hitSlop={6}>
          <Text style={[styles.sectionTitle, { color: c.text }]} numberOfLines={1}>
            {formatLongDate(data.dateISO)}
          </Text>
          <DoubleChevron color={c.mutedText} />
        </Pressable>
        <View style={[styles.sectionTitleUnderline, { backgroundColor: c.border }]} />

        {data.cards.length === 0 ? (
          <Text style={[styles.emptyText, { color: c.mutedText }]}>Nothing scheduled.</Text>
        ) : (
          <View style={styles.cardList}>
            {data.cards.map((card) => (
              <View key={card.id} style={styles.classRow}>
                <View style={[styles.classBar, { backgroundColor: card.color }]} />
                <View style={styles.classText}>
                  <Text style={[styles.classSubject, { color: c.text }]} numberOfLines={1}>
                    {card.subjectCode || card.subjectTitle.toUpperCase()}
                  </Text>
                  <Text style={[styles.classSubtitle, { color: c.text }]} numberOfLines={1}>
                    {card.subtitle}
                  </Text>
                  <Text style={[styles.classTime, { color: c.text }]} numberOfLines={1}>
                    {timeRange(card.startTime, card.endTime)}
                  </Text>
                </View>
                <View style={[styles.classDivider, { backgroundColor: c.border }]} />
                <View style={styles.chipColumn}>
                  {card.blocks.map((block) => {
                    const tone = toneFor(block.category);
                    return (
                      <Pressable
                        key={block.blockId}
                        onPress={() => openBlockDetail(block)}
                        style={[styles.chip, { borderColor: tone.bg, backgroundColor: tone.bg }]}
                        hitSlop={4}
                      >
                        <Text style={[styles.chipText, { color: "#FFFFFF" }]} numberOfLines={2}>
                          {chipLabel(block)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={[styles.sectionDivider, { backgroundColor: c.border }]} />

      <View style={styles.section}>
        <Text style={[styles.kicker, { color: c.mutedText }]}>Overview</Text>
        <Pressable style={styles.sectionHeadRow} onPress={onOpenOverview} hitSlop={6} disabled={!data.firstBlock}>
          <Text style={[styles.sectionTitle, { color: c.text }]} numberOfLines={2}>
            {overview.title || "—"}
          </Text>
          {data.firstBlock ? <DoubleChevron color={c.mutedText} /> : null}
        </Pressable>

        {overview.kind === "lesson" ? (
          <View
            style={[
              styles.overviewShell,
              { backgroundColor: cardShellBg, borderColor: c.border, height: overviewHeight },
            ]}
          >
            <WebView
              originWhitelist={["*"]}
              source={overviewSource}
              key={`overview-${data.firstBlock?.blockId ?? "none"}-${overview.html.length}`}
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
        ) : overview.kind === "text" ? (
          <View
            style={[styles.overviewShell, styles.overviewTextShell, { backgroundColor: cardShellBg, borderColor: c.border }]}
          >
            <Text style={[styles.overviewBody, { color: c.text }]}>
              {overview.text || "No description added yet."}
            </Text>
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: c.mutedText }]}>Nothing to preview.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  scroll: {
    paddingBottom: Spacing.xxxl,
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
