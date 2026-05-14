// components/calendar/block-editor.tsx
//
// Two distinct flows over a shared set of pickers:
//
//  • CREATE — a "quiz funnel": one bright tappable question at a time
//      1. What kind?       (Lesson / Written work / Performance task)
//      2. Which sort?      (lecture · seatwork · quiz · project · …)
//      3. What's the scope? (which lessons it covers — this also picks the class)
//      4. When?            (start & end — may sit inside a slot or outside one)
//
//  • EDIT — opens to a "review" screen: a focused settings-style summary of the
//    block where each of the same four fields is its own row. Tapping a row
//    drops into that picker; finishing returns to the review. Save / Delete
//    live on the review screen.

import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SessionCategory, SessionSubcategory } from "../../algorithm/00_types";
import { Radius, Spacing, Typography } from "../../constants/fonts";
import {
  formatDuration,
  formatLongDate,
  formatTime12,
  minutesToTime,
  timeToMinutes,
} from "./dates";
import { accentFor, CATEGORY_ICONS, tintFor } from "./theme";
import type { BlockEditValues, DayBlock, PlanLesson, PlanWithLessons } from "./agenda";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const FUNNEL_CATEGORIES: SessionCategory[] = ["lesson", "written_work", "performance_task"];

const CATEGORY_LABEL: Record<SessionCategory, string> = {
  lesson: "Lesson",
  written_work: "Written work",
  performance_task: "Performance task",
  exam: "Exam",
  buffer: "Buffer",
};

const CATEGORY_BLURB: Record<SessionCategory, string> = {
  lesson: "Teach new material",
  written_work: "A quiz, seatwork or assignment",
  performance_task: "A project, activity or report",
  exam: "A periodical exam",
  buffer: "Review, prep or catch-up time",
};

const SUBCATEGORIES: Record<SessionCategory, SessionSubcategory[]> = {
  lesson: ["lecture", "laboratory"],
  written_work: ["assignment", "seatwork", "quiz"],
  performance_task: ["activity", "lab_report", "reporting", "project"],
  exam: ["prelim", "midterm", "final"],
  buffer: ["review", "preparation", "orientation", "other"],
};

const SUBCATEGORY_LABEL: Record<string, string> = {
  lecture: "Lecture",
  laboratory: "Laboratory",
  assignment: "Assignment",
  seatwork: "Seatwork",
  quiz: "Quiz",
  activity: "Activity",
  lab_report: "Lab report",
  reporting: "Reporting",
  project: "Project",
  prelim: "Prelim",
  midterm: "Midterm",
  final: "Final",
  review: "Review",
  preparation: "Preparation",
  orientation: "Orientation",
  other: "Other",
};

const SUBCATEGORY_ICON: Record<string, IconName> = {
  lecture: "easel",
  laboratory: "flask",
  assignment: "clipboard",
  seatwork: "pencil",
  quiz: "help-circle",
  activity: "sparkles",
  lab_report: "document-text",
  reporting: "megaphone",
  project: "hammer",
  prelim: "alarm",
  midterm: "alarm",
  final: "trophy",
  review: "refresh",
  preparation: "construct",
  orientation: "compass",
  other: "ellipsis-horizontal",
};

const STEP_TITLES = ["What kind of block?", "Which sort?", "What does it cover?", "When is it?"] as const;

function minutesToDate(min: number): Date {
  const d = new Date();
  d.setHours(Math.floor(min / 60), min % 60, 0, 0);
  return d;
}

function dateToMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export type BlockEditorInitial = {
  blockId: string;
  lessonPlanId: string;
  category: SessionCategory;
  subcategory: SessionSubcategory | null;
  scopeLessonIds: string[];
  startTime: string;
  endTime: string;
};

type Props = {
  visible: boolean;
  mode: "create" | "edit";
  plans: PlanWithLessons[];
  /** Existing blocks on the same day — used to block overlapping saves. */
  existingEntries: DayBlock[];
  dateISO: string;
  initial?: BlockEditorInitial | null;
  readOnly?: boolean;
  onClose: () => void;
  onSubmit: (values: BlockEditValues) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export default function BlockEditor({
  visible,
  mode,
  plans,
  existingEntries,
  dateISO,
  initial,
  readOnly,
  onClose,
  onSubmit,
  onDelete,
}: Props) {
  const insets = useSafeAreaInsets();
  const isEdit = mode === "edit";

  type Phase = "review" | "step";
  const [phase, setPhase] = useState<Phase>(isEdit ? "review" : "step");
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<SessionCategory>("lesson");
  const [subcategory, setSubcategory] = useState<SessionSubcategory>("lecture");
  const [planId, setPlanId] = useState<string | null>(null);
  const [scope, setScope] = useState<string[]>([]);
  const [startMin, setStartMin] = useState(8 * 60);
  const [endMin, setEndMin] = useState(9 * 60);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setBusy(false);
    if (isEdit && initial) {
      const cat = (FUNNEL_CATEGORIES.includes(initial.category) ? initial.category : "lesson") as SessionCategory;
      const sub = (initial.subcategory && SUBCATEGORIES[cat].includes(initial.subcategory)
        ? initial.subcategory
        : SUBCATEGORIES[cat][0]) as SessionSubcategory;
      setCategory(cat);
      setSubcategory(sub);
      setPlanId(initial.lessonPlanId);
      setScope(initial.scopeLessonIds ?? []);
      setStartMin(timeToMinutes(initial.startTime || "08:00"));
      setEndMin(Math.max(timeToMinutes(initial.startTime || "08:00") + 30, timeToMinutes(initial.endTime || "09:00")));
      setStep(0);
      setPhase("review");
    } else {
      setCategory("lesson");
      setSubcategory("lecture");
      setPlanId(plans.length === 1 ? plans[0].lessonPlanId : null);
      setScope([]);
      setStartMin(8 * 60);
      setEndMin(9 * 60);
      setStep(0);
      setPhase("step");
    }
  }, [visible, isEdit, initial, plans]);

  const activePlan = useMemo(() => plans.find((p) => p.lessonPlanId === planId) ?? null, [plans, planId]);
  const accent = accentFor(category);

  type LessonChapter = { chapterId: string | null; chapterTitle: string | null; lessons: PlanLesson[] };
  type LessonUnit = { unitId: string | null; unitTitle: string | null; chapters: LessonChapter[] };

  const outlineFor = (plan: PlanWithLessons): LessonUnit[] => {
    const units = new Map<string, LessonUnit>();
    const unitOrder = new Map<string, number>();
    for (const lesson of plan.lessons) {
      const uKey = lesson.unitId ?? "__no_unit";
      let unit = units.get(uKey);
      if (!unit) {
        unit = { unitId: lesson.unitId, unitTitle: lesson.unitTitle, chapters: [] };
        units.set(uKey, unit);
        unitOrder.set(uKey, lesson.unitSequenceNo ?? Number.POSITIVE_INFINITY);
      }
      const cKey = lesson.chapterId ?? "__no_chapter";
      let chapter = unit.chapters.find((c) => (c.chapterId ?? "__no_chapter") === cKey);
      if (!chapter) {
        chapter = { chapterId: lesson.chapterId, chapterTitle: lesson.chapterTitle, lessons: [] };
        unit.chapters.push(chapter);
      }
      chapter.lessons.push(lesson);
    }
    return Array.from(units.values()).sort(
      (a, b) =>
        (unitOrder.get(a.unitId ?? "__no_unit") ?? Number.POSITIVE_INFINITY) -
        (unitOrder.get(b.unitId ?? "__no_unit") ?? Number.POSITIVE_INFINITY),
    );
  };

  const lessonsById = useMemo(() => {
    const map = new Map<string, PlanLesson>();
    for (const plan of plans) for (const l of plan.lessons) map.set(l.lessonId, l);
    return map;
  }, [plans]);

  const overlapWith = useMemo(() => {
    const ignoreId = isEdit ? initial?.blockId : null;
    return existingEntries.find((entry) => {
      if (ignoreId && entry.blockId === ignoreId) return false;
      const eStart = timeToMinutes(entry.startTime);
      const eEnd = timeToMinutes(entry.endTime);
      return startMin < eEnd && eStart < endMin;
    }) ?? null;
  }, [existingEntries, startMin, endMin, isEdit, initial?.blockId]);

  const scopeReady = isEdit || plans.length <= 1 || Boolean(planId);
  const canSubmit =
    Boolean(planId) &&
    endMin > startMin &&
    SUBCATEGORIES[category].includes(subcategory) &&
    !overlapWith;

  // In create mode, "advance" walks the funnel forward; in edit mode, every
  // sub-screen returns to the review when its choice is made.
  const advance = () => {
    if (isEdit) setPhase("review");
    else setStep((s) => Math.min(s + 1, 3));
  };
  const goBack = () => {
    if (isEdit && phase === "step") {
      setPhase("review");
      return;
    }
    if (step === 0) onClose();
    else setStep((s) => s - 1);
  };

  const openStep = (n: number) => {
    setStep(n);
    setPhase("step");
  };

  const pickCategory = (cat: SessionCategory) => {
    if (cat === category) {
      advance();
      return;
    }
    setCategory(cat);
    setSubcategory(SUBCATEGORIES[cat][0]);
    if (cat === "lesson" && scope.length > 1) setScope(scope.slice(0, 1));
    setTimeout(advance, 120);
  };

  const pickSubcategory = (sub: SessionSubcategory) => {
    setSubcategory(sub);
    setTimeout(advance, 120);
  };

  const toggleLesson = (plan: PlanWithLessons, lessonId: string) => {
    if (!isEdit && plans.length > 1 && planId && planId !== plan.lessonPlanId) {
      return; // locked to another class
    }
    const singleSelect = category === "lesson";
    if (planId !== plan.lessonPlanId && !isEdit) {
      setPlanId(plan.lessonPlanId);
      setScope([lessonId]);
      return;
    }
    setScope((prev) => {
      if (prev.includes(lessonId)) {
        const next = prev.filter((id) => id !== lessonId);
        if (next.length === 0 && !isEdit && plans.length > 1) setPlanId(null);
        return next;
      }
      return singleSelect ? [lessonId] : [...prev, lessonId];
    });
  };

  const pickStart = (m: number) => {
    setStartMin(m);
    if (endMin <= m) setEndMin(Math.min(23 * 60, m + 60));
  };

  const submit = async () => {
    if (!planId) return;
    if (readOnly) {
      Alert.alert("Sample calendar", "Create a lesson plan first, then you can add blocks here.");
      onClose();
      return;
    }
    if (overlapWith) {
      Alert.alert(
        "Time conflict",
        `${overlapWith.subjectTitle} · ${overlapWith.label} already occupies ${formatTime12(overlapWith.startTime)}–${formatTime12(overlapWith.endTime)}. Pick a different time.`,
      );
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        lessonPlanId: planId,
        category,
        subcategory,
        scopeLessonIds: scope,
        startTime: minutesToTime(startMin),
        endTime: minutesToTime(endMin),
      });
      onClose();
    } catch (error: any) {
      Alert.alert("Could not save", error?.message ?? "Something went wrong.");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    Alert.alert("Delete block?", "This removes the block from the schedule.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (readOnly) {
            onClose();
            return;
          }
          setBusy(true);
          try {
            await onDelete();
            onClose();
          } catch (error: any) {
            Alert.alert("Could not delete", error?.message ?? "Something went wrong.");
            setBusy(false);
          }
        },
      },
    ]);
  };

  const summaryChips = [
    { key: "cat", label: CATEGORY_LABEL[category], step: 0 },
    { key: "sub", label: SUBCATEGORY_LABEL[subcategory] ?? subcategory, step: 1 },
    {
      key: "scope",
      label:
        scope.length === 0
          ? "No scope"
          : scope.length === 1
          ? lessonsById.get(scope[0])?.title ?? "1 lesson"
          : `${scope.length} lessons`,
      step: 2,
    },
    { key: "time", label: `${formatTime12(minutesToTime(startMin))} – ${formatTime12(minutesToTime(endMin))}`, step: 3 },
  ];

  const inReview = isEdit && phase === "review";
  const showHeaderClose = inReview || (!isEdit && step === 0);

  const reviewRows: { key: string; label: string; value: string; step: number }[] = [
    { key: "cat", label: "Category", value: CATEGORY_LABEL[category], step: 0 },
    { key: "sub", label: "Sort", value: SUBCATEGORY_LABEL[subcategory] ?? subcategory, step: 1 },
    {
      key: "scope",
      label: "Scope",
      value:
        scope.length === 0
          ? "No lessons"
          : scope.length === 1
          ? lessonsById.get(scope[0])?.title ?? "1 lesson"
          : `${scope.length} lessons`,
      step: 2,
    },
    { key: "starts", label: "Starts", value: formatTime12(minutesToTime(startMin)), step: 3 },
    { key: "ends", label: "Ends", value: formatTime12(minutesToTime(endMin)), step: 3 },
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
        {/* header */}
        <View style={styles.header}>
          <Pressable onPress={showHeaderClose ? onClose : goBack} hitSlop={10} style={styles.headerBtn}>
            <Ionicons name={showHeaderClose ? "close" : "chevron-back"} size={24} color="#374151" />
          </Pressable>
          {inReview ? (
            <View style={styles.dots} />
          ) : (
            <View style={styles.dots}>
              {STEP_TITLES.map((_, i) => {
                const reachable = isEdit || i <= step;
                return (
                  <Pressable
                    key={i}
                    disabled={!reachable}
                    onPress={() => reachable && openStep(i)}
                    hitSlop={8}
                    style={[
                      styles.dot,
                      { backgroundColor: i === step ? accent : i < step || isEdit ? "#D1D5DB" : "#E5E7EB" },
                    ]}
                  />
                );
              })}
            </View>
          )}
          <Text style={styles.headerTitle}>{isEdit ? "Edit" : "New"}</Text>
        </View>

        <Text style={[styles.question, { color: "#111827" }]}>
          {inReview ? "Edit block" : STEP_TITLES[step]}
        </Text>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
          {inReview ? (
            <View style={{ gap: Spacing.lg }}>
              {/* live preview of how the block looks */}
              <View style={[styles.previewCard, { borderLeftColor: activePlan?.color ?? accent }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewSubject}>{activePlan?.subjectTitle ?? "Your class"}</Text>
                  <Text style={styles.previewSub}>{activePlan?.subtitle ?? ""}</Text>
                  <Text style={[styles.previewBody, { color: accent }]} numberOfLines={1}>
                    {SUBCATEGORY_LABEL[subcategory] ?? subcategory}
                    {scope.length === 1 && lessonsById.get(scope[0])
                      ? `: ${lessonsById.get(scope[0])!.title}`
                      : scope.length > 1
                      ? `: ${scope.length} lessons`
                      : ""}
                  </Text>
                </View>
              </View>

              <Text style={styles.hint}>
                {formatLongDate(dateISO)} · {formatDuration(endMin - startMin)}
              </Text>

              <View style={styles.rowList}>
                {reviewRows.map((row, i) => (
                  <Pressable
                    key={row.key}
                    onPress={() => openStep(row.step)}
                    style={[styles.editRow, i < reviewRows.length - 1 && styles.editRowDivider]}
                  >
                    <Text style={styles.editRowLabel}>{row.label}</Text>
                    <Text style={styles.editRowValue} numberOfLines={1}>
                      {row.value}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                  </Pressable>
                ))}
              </View>

              {onDelete ? (
                <Pressable onPress={remove} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  <Text style={styles.deleteText}>Delete this block</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {!inReview && step === 0 ? (
            <View style={{ gap: Spacing.md }}>
              {FUNNEL_CATEGORIES.map((cat) => {
                const selected = cat === category;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => pickCategory(cat)}
                    style={[
                      styles.bigCard,
                      { backgroundColor: accentFor(cat), opacity: selected ? 1 : 0.92 },
                      selected && styles.bigCardSelected,
                    ]}
                  >
                    <View style={styles.bigCardBlob} />
                    <View style={styles.bigCardIcon}>
                      <Ionicons name={CATEGORY_ICONS[cat]} size={26} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bigCardTitle}>{CATEGORY_LABEL[cat]}</Text>
                      <Text style={styles.bigCardBlurb}>{CATEGORY_BLURB[cat]}</Text>
                    </View>
                    {selected ? <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {!inReview && step === 1 ? (
            <View style={styles.grid}>
              {SUBCATEGORIES[category].map((sub) => {
                const selected = sub === subcategory;
                return (
                  <Pressable
                    key={sub}
                    onPress={() => pickSubcategory(sub)}
                    style={[
                      styles.smallCard,
                      { backgroundColor: selected ? accent : tintFor(category), borderColor: accent },
                      selected && styles.smallCardSelected,
                    ]}
                  >
                    <Ionicons
                      name={SUBCATEGORY_ICON[sub] ?? "ellipse"}
                      size={28}
                      color={selected ? "#FFFFFF" : accent}
                    />
                    <Text style={[styles.smallCardLabel, { color: selected ? "#FFFFFF" : "#1F2937" }]}>
                      {SUBCATEGORY_LABEL[sub] ?? sub}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {!inReview && step === 2 ? (
            <View style={{ gap: Spacing.lg }}>
              {plans.length === 0 ? (
                <Text style={styles.hint}>Create a lesson plan first to add blocks.</Text>
              ) : null}
              {(isEdit && activePlan ? [activePlan] : plans).map((plan) => {
                const locked = !isEdit && plans.length > 1 && Boolean(planId) && planId !== plan.lessonPlanId;
                const chosen = planId === plan.lessonPlanId;
                const outline = outlineFor(plan);
                return (
                  <View key={plan.lessonPlanId} style={{ opacity: locked ? 0.4 : 1 }}>
                    <Pressable
                      style={styles.planHeader}
                      disabled={isEdit || plans.length <= 1}
                      onPress={() => {
                        if (chosen) {
                          setPlanId(null);
                          setScope([]);
                        } else {
                          setPlanId(plan.lessonPlanId);
                          setScope([]);
                        }
                      }}
                    >
                      <View style={[styles.planDot, { backgroundColor: plan.color }]} />
                      <Text style={styles.planTitle}>{plan.subjectTitle}</Text>
                      <Text style={styles.planSub}>· {plan.subtitle}</Text>
                      {chosen && !isEdit ? (
                        <Ionicons name="checkmark-circle" size={16} color={plan.color} style={{ marginLeft: 4 }} />
                      ) : null}
                    </Pressable>
                    {plan.lessons.length === 0 ? (
                      <Text style={styles.hint}>No lessons listed for this plan.</Text>
                    ) : (
                      <View style={{ gap: Spacing.md }}>
                        {outline.map((unit, ui) => (
                          <View key={unit.unitId ?? `u-${ui}`} style={{ gap: Spacing.sm }}>
                            {unit.unitTitle ? (
                              <Text style={styles.unitHeader}>{unit.unitTitle}</Text>
                            ) : null}
                            {unit.chapters.map((chapter, ci) => (
                              <View
                                key={chapter.chapterId ?? `c-${ui}-${ci}`}
                                style={{ gap: Spacing.xs }}
                              >
                                {chapter.chapterTitle ? (
                                  <Text style={styles.chapterHeader}>{chapter.chapterTitle}</Text>
                                ) : null}
                                <View style={[styles.chipWrap, { marginTop: 4 }]}>
                                  {chapter.lessons.map((lesson) => {
                                    const on = scope.includes(lesson.lessonId);
                                    return (
                                      <Pressable
                                        key={lesson.lessonId}
                                        disabled={locked}
                                        onPress={() => toggleLesson(plan, lesson.lessonId)}
                                        style={[
                                          styles.lessonChip,
                                          on
                                            ? { backgroundColor: plan.color, borderColor: plan.color }
                                            : { backgroundColor: "#FFFFFF", borderColor: "#E5E7EB" },
                                        ]}
                                      >
                                        <Text style={[styles.lessonChipNo, { color: on ? "#FFFFFF" : plan.color }]}>
                                          L{lesson.sequenceNo}
                                        </Text>
                                        <Text
                                          style={[styles.lessonChipText, { color: on ? "#FFFFFF" : "#374151" }]}
                                          numberOfLines={1}
                                        >
                                          {lesson.title}
                                        </Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              </View>
                            ))}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
              <Text style={styles.hint}>
                {category === "lesson" ? "Pick the lesson this covers." : "Pick the lessons this covers (optional)."}
              </Text>
            </View>
          ) : null}

          {!inReview && step === 3 ? (
            <View style={{ gap: Spacing.xl }}>
              <View style={styles.wheelRow}>
                <View style={styles.wheelCol}>
                  <Text style={styles.timeLabel}>Starts at</Text>
                  <DateTimePicker
                    mode="time"
                    display="spinner"
                    value={minutesToDate(startMin)}
                    minuteInterval={5}
                    onChange={(_, d) => {
                      if (!d) return;
                      pickStart(dateToMinutes(d));
                    }}
                    style={styles.wheel}
                  />
                </View>
                <View style={styles.wheelCol}>
                  <Text style={styles.timeLabel}>Ends at</Text>
                  <DateTimePicker
                    mode="time"
                    display="spinner"
                    value={minutesToDate(endMin)}
                    minuteInterval={5}
                    onChange={(_, d) => {
                      if (!d) return;
                      setEndMin(Math.max(startMin + 5, dateToMinutes(d)));
                    }}
                    style={styles.wheel}
                  />
                </View>
              </View>
              <Text style={styles.hint}>
                {formatLongDate(dateISO)} · {formatDuration(endMin - startMin)}
              </Text>

              {overlapWith ? (
                <View style={styles.conflictBanner}>
                  <Ionicons name="warning" size={16} color="#B91C1C" />
                  <Text style={styles.conflictText}>
                    Conflicts with {overlapWith.subjectTitle} · {overlapWith.label} (
                    {formatTime12(overlapWith.startTime)}–{formatTime12(overlapWith.endTime)})
                  </Text>
                </View>
              ) : null}

              {!isEdit ? (
                <View style={[styles.previewCard, { borderLeftColor: activePlan?.color ?? accent }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.previewSubject}>{activePlan?.subjectTitle ?? "Your class"}</Text>
                    <Text style={styles.previewSub}>{activePlan?.subtitle ?? ""}</Text>
                  </View>
                  <View style={[styles.previewChip, { borderColor: accent }]}>
                    <Text style={[styles.previewChipText, { color: accent }]}>{SUBCATEGORY_LABEL[subcategory] ?? subcategory}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* funnel breadcrumb (create-mode only) */}
          {!isEdit && step > 0 ? (
            <View style={styles.summaryRow}>
              {summaryChips.map((chip) => (
                <Pressable key={chip.key} onPress={() => openStep(chip.step)} style={styles.summaryChip}>
                  <Text style={styles.summaryChipText} numberOfLines={1}>
                    {chip.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>

        {/* footer */}
        <View style={[styles.footer, { borderTopColor: "#EEF0F2" }]}>
          {inReview ? (
            <Pressable
              onPress={submit}
              disabled={!canSubmit || busy}
              style={[styles.primaryBtn, { backgroundColor: accent, opacity: !canSubmit || busy ? 0.4 : 1 }]}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Save changes</Text>}
            </Pressable>
          ) : isEdit ? (
            // edit-mode sub-step: confirm just this field and bounce back
            <Pressable
              onPress={() => setPhase("review")}
              style={[styles.primaryBtn, { backgroundColor: accent }]}
            >
              <Text style={styles.primaryBtnText}>Done</Text>
            </Pressable>
          ) : step < 3 ? (
            <Pressable
              onPress={advance}
              disabled={step === 2 && !scopeReady}
              style={[styles.primaryBtn, { backgroundColor: accent, opacity: step === 2 && !scopeReady ? 0.4 : 1 }]}
            >
              <Text style={styles.primaryBtnText}>Continue</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={submit}
              disabled={!canSubmit || busy}
              style={[styles.primaryBtn, { backgroundColor: accent, opacity: !canSubmit || busy ? 0.4 : 1 }]}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Create block</Text>}
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: Spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 36,
  },
  headerBtn: {
    width: 40,
  },
  dots: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  dot: {
    width: 22,
    height: 6,
    borderRadius: 3,
  },
  headerTitle: {
    width: 40,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  question: {
    ...Typography.h1,
    fontSize: 26,
    lineHeight: 32,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: Spacing.xxl,
  },
  // --- step 0: big category cards ---
  bigCard: {
    minHeight: 92,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  bigCardSelected: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  bigCardBlob: {
    position: "absolute",
    right: -28,
    bottom: -34,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  bigCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  bigCardTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "800",
  },
  bigCardBlurb: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    marginTop: 2,
  },
  // --- step 1: subcategory grid ---
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  smallCard: {
    width: "47%",
    minHeight: 96,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  smallCardSelected: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  smallCardLabel: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  // --- step 2: scope ---
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.sm,
  },
  planDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  planTitle: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "italic",
    color: "#1F2937",
  },
  planSub: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  chipWrap: {
    gap: Spacing.sm,
  },
  unitHeader: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: Spacing.xs,
  },
  chapterHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    marginTop: Spacing.xs,
  },
  lessonChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  lessonChipNo: {
    fontSize: 12,
    fontWeight: "800",
    minWidth: 22,
  },
  lessonChipText: {
    flex: 1,
    fontSize: 13,
  },
  hint: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  // --- step 3: time ---
  timeLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  wheelRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  wheelCol: {
    flex: 1,
    alignItems: "center",
  },
  wheel: {
    width: "100%",
  },
  conflictBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  conflictText: {
    flex: 1,
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "600",
  },
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.lg,
    borderLeftWidth: 6,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  previewSubject: {
    fontSize: 15,
    fontWeight: "800",
    fontStyle: "italic",
    color: "#111827",
  },
  previewSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 1,
  },
  previewBody: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
  },
  rowList: {
    backgroundColor: "#F9FAFB",
    borderRadius: Radius.lg,
    overflow: "hidden",
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    gap: Spacing.md,
  },
  editRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  editRowLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    width: 88,
  },
  editRowValue: {
    flex: 1,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "right",
  },
  previewChip: {
    borderWidth: 1.5,
    borderRadius: Radius.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
  },
  previewChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.md,
  },
  deleteText: {
    color: "#DC2626",
    fontSize: 14,
    fontWeight: "600",
  },
  // --- summary chips ---
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.xxl,
  },
  summaryChip: {
    backgroundColor: "#F3F4F6",
    borderRadius: Radius.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    maxWidth: "100%",
  },
  summaryChipText: {
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "500",
  },
  // --- footer ---
  footer: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  primaryBtn: {
    height: 50,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
