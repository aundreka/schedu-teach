// Single-screen onboarding wizard. Two steps:
//
//   1. "When do you want SchEDU to start planning for you?"
//        - Start of school year (default if today < SY start)
//        - Today — I'm joining mid-term (default if today is past SY start)
//   2. (mid-term branch only) "Where are you right now?" — four small
//      numeric inputs (current lesson, completed WW, completed PT, completed
//      exams). These become the plan's `progress_anchor`.
//
// On finish: calls `mark_user_onboarded()` RPC and routes to the lesson-plan
// create flow with prefill params for the chosen posture.

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Radius, Spacing, Typography } from "../../constants/fonts";
import { useAppTheme } from "../../context/theme";
import { defaultPlanStart, getSchoolYearForDate, todayIso } from "../../lib/deped-calendar";
import { supabase } from "../../lib/supabase";

type Posture = "fresh" | "midterm";

export default function Onboarding() {
  const { colors: c } = useAppTheme();

  const today = useMemo(() => todayIso(), []);
  const sy = useMemo(() => getSchoolYearForDate(today), [today]);
  const planStart = useMemo(() => defaultPlanStart(today), [today]);
  const isPastSyStart = sy ? today >= sy.start_date : false;

  const [posture, setPosture] = useState<Posture>(isPastSyStart ? "midterm" : "fresh");
  const [lessonNo, setLessonNo] = useState("0");
  const [writtenWorkNo, setWrittenWorkNo] = useState("0");
  const [performanceTaskNo, setPerformanceTaskNo] = useState("0");
  const [examNo, setExamNo] = useState("0");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const parseCount = (value: string): number => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  };

  const handleContinue = async () => {
    setErrorMsg(null);
    setBusy(true);
    try {
      const { error: markError } = await supabase.rpc("mark_user_onboarded");
      if (markError) throw markError;

      const params: Record<string, string> = {
        prefillStart: posture === "fresh" && sy ? sy.start_date : planStart,
      };
      if (sy) {
        params.prefillEnd = sy.end_date;
      }
      if (posture === "midterm") {
        params.effectiveStart = today;
        params.lessonNo = String(parseCount(lessonNo));
        params.writtenWorkNo = String(parseCount(writtenWorkNo));
        params.performanceTaskNo = String(parseCount(performanceTaskNo));
        params.examNo = String(parseCount(examNo));
      }

      router.replace({ pathname: "/(tabs)/create/lessonplan" as any, params });
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not finish setup.");
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = async () => {
    setErrorMsg(null);
    setBusy(true);
    try {
      const { error: markError } = await supabase.rpc("mark_user_onboarded");
      if (markError) throw markError;
      router.replace("/(tabs)");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not finish setup.");
    } finally {
      setBusy(false);
    }
  };

  const renderRadio = (selected: boolean) => (
    <View
      style={[
        styles.radio,
        { borderColor: selected ? c.tint : c.border, backgroundColor: c.background },
      ]}
    >
      {selected ? <View style={[styles.radioDot, { backgroundColor: c.tint }]} /> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <View
            style={[
              styles.logoBubble,
              { backgroundColor: c.tint + "1A", borderColor: c.tint },
            ]}
          >
            <Ionicons name="school-outline" size={28} color={c.tint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: c.text }]}>Welcome to SchEDU</Text>
            <Text style={[styles.subtitle, { color: c.mutedText }]}>
              {"A few quick questions and we'll plan your term."}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: c.mutedText }]}>
          When do you want to start planning?
        </Text>

        {sy ? (
          <Text style={[styles.helperText, { color: c.mutedText }]}>
            DepEd SY {sy.label} runs {sy.start_date} to {sy.end_date}.
          </Text>
        ) : null}

        <Pressable
          onPress={() => setPosture("fresh")}
          style={[
            styles.optionCard,
            { backgroundColor: c.card, borderColor: posture === "fresh" ? c.tint : c.border },
          ]}
        >
          {renderRadio(posture === "fresh")}
          <View style={{ flex: 1 }}>
            <Text style={[styles.optionTitle, { color: c.text }]}>
              {sy && today < sy.start_date
                ? `Start of the school year (${sy.start_date})`
                : "Start of the school year"}
            </Text>
            <Text style={[styles.optionBody, { color: c.mutedText }]}>
              {sy && today < sy.start_date
                ? "You're ahead — we'll plan the full year from day one."
                : "Plan as if you're starting from the term's first day."}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setPosture("midterm")}
          style={[
            styles.optionCard,
            { backgroundColor: c.card, borderColor: posture === "midterm" ? c.tint : c.border },
          ]}
        >
          {renderRadio(posture === "midterm")}
          <View style={{ flex: 1 }}>
            <Text style={[styles.optionTitle, { color: c.text }]}>
              {`Today (${today}) — I'm joining mid-term`}
            </Text>
            <Text style={[styles.optionBody, { color: c.mutedText }]}>
              {"We'll schedule only from today onward and skip anything you've already covered."}
            </Text>
          </View>
        </Pressable>

        {posture === "midterm" ? (
          <View
            style={[
              styles.midTermBox,
              { backgroundColor: c.card, borderColor: c.border },
            ]}
          >
            <Text style={[styles.sectionLabel, { color: c.mutedText, marginTop: 0 }]}>
              Where are you right now?
            </Text>
            <Text style={[styles.helperText, { color: c.mutedText }]}>
              How many of each have you already taught/given this term? Leave at 0 if none yet.
            </Text>

            <CountInput
              label="Lessons already taught"
              value={lessonNo}
              onChange={setLessonNo}
              color={c}
            />
            <CountInput
              label="Written work already given"
              value={writtenWorkNo}
              onChange={setWrittenWorkNo}
              color={c}
            />
            <CountInput
              label="Performance tasks already given"
              value={performanceTaskNo}
              onChange={setPerformanceTaskNo}
              color={c}
            />
            <CountInput
              label="Exams already given"
              value={examNo}
              onChange={setExamNo}
              color={c}
            />
          </View>
        ) : null}

        {errorMsg ? (
          <Text style={[styles.error, { color: "#DC2626" }]}>{errorMsg}</Text>
        ) : null}

        <Pressable
          onPress={handleContinue}
          disabled={busy}
          style={[
            styles.primaryButton,
            { backgroundColor: busy ? c.mutedText : c.tint },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Create my first plan</Text>
          )}
        </Pressable>

        <Pressable onPress={handleSkip} disabled={busy} style={styles.skipButton}>
          <Text style={[styles.skipText, { color: c.mutedText }]}>
            Skip for now
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CountInput({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  color: { text: string; mutedText: string; border: string; background: string };
}) {
  return (
    <View style={styles.countRow}>
      <Text style={[styles.countLabel, { color: color.text }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        maxLength={3}
        style={[
          styles.countInput,
          {
            color: color.text,
            backgroundColor: color.background,
            borderColor: color.border,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxxl + Spacing.lg,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  logoBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: Typography.h1.fontSize,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: Typography.body.fontSize,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: Spacing.md,
  },
  helperText: {
    fontSize: Typography.caption.fontSize,
    marginBottom: Spacing.xs,
  },
  optionCard: {
    flexDirection: "row",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionTitle: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
  },
  optionBody: {
    fontSize: Typography.body.fontSize,
    marginTop: 4,
    lineHeight: 20,
  },
  midTermBox: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.xs,
  },
  countLabel: {
    fontSize: Typography.body.fontSize,
    flex: 1,
    paddingRight: Spacing.md,
  },
  countInput: {
    width: 64,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    textAlign: "center",
    fontSize: Typography.body.fontSize,
  },
  primaryButton: {
    paddingVertical: Spacing.lg,
    borderRadius: Radius.md,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
  },
  skipButton: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  skipText: {
    fontSize: Typography.body.fontSize,
  },
  error: {
    fontSize: Typography.body.fontSize,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
});
