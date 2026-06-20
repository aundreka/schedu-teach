import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AnimatedPressable from "../../components/AnimatedPressable";
import { useAppTheme } from "../../context/theme";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import { supabase } from "../../lib/supabase";

type School = {
  school_id: string;
  name: string;
  type: string;
  join_code: string;
};

type Department = {
  department_id: string;
  name: string;
  headName: string | null;
};

const SCHOOL_TYPE_LABELS: Record<string, string> = {
  university: "University",
  basic_ed: "Basic Education",
  training_center: "Training Center",
};

type DeptRowItemProps = {
  dept: Department;
  index: number;
  isLast: boolean;
  borderColor: string;
  textColor: string;
  mutedColor: string;
  onDelete: (dept: Department) => void;
};

function DeptRowItem({ dept, index, isLast, borderColor, textColor, mutedColor, onDelete }: DeptRowItemProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(260).delay(index * 55)}
      style={[styles.deptRow, !isLast && { borderBottomWidth: 1, borderBottomColor: borderColor }]}
    >
      <View style={styles.deptMain}>
        <Text style={[styles.deptName, { color: textColor }]}>{dept.name}</Text>
        {dept.headName && (
          <Text style={[styles.deptHead, { color: mutedColor }]}>Head: {dept.headName}</Text>
        )}
      </View>
      <Pressable style={styles.deptDelete} onPress={() => onDelete(dept)} hitSlop={8}>
        <Ionicons name="trash-outline" size={18} color="#D7487B" />
      </Pressable>
    </Animated.View>
  );
}

export default function AdminProfileScreen() {
  const { colors: c, scheme } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<School | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tier2Count, setTier2Count] = useState(0);
  const [teacherCount, setTeacherCount] = useState(0);
  const [addDeptModalOpen, setAddDeptModalOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [addingDept, setAddingDept] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const screenBg = scheme === "dark" ? "#11161C" : "#F5F3EE";
  const cardBg = scheme === "dark" ? "#171E27" : "#FFFFFF";
  const borderColor = scheme === "dark" ? "#222B35" : "#E8E1D7";
  const inputBg = scheme === "dark" ? "#1A2330" : "#F5F3EE";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data: schoolRows } = await supabase
        .from("user_schools")
        .select("school_id, is_primary, school:schools(school_id, name, type, join_code)")
        .eq("user_id", user.id)
        .order("is_primary", { ascending: false })
        .limit(1);

      const raw = schoolRows?.[0];
      const rawSchool = Array.isArray(raw?.school) ? raw.school[0] : raw?.school;
      if (!rawSchool?.school_id) {
        setSchool(null);
        setDepartments([]);
        setLoading(false);
        return;
      }

      const sid = String(rawSchool.school_id);
      setSchool({
        school_id: sid,
        name: String(rawSchool.name ?? ""),
        type: String(rawSchool.type ?? "university"),
        join_code: String(rawSchool.join_code ?? ""),
      });

      const [deptResult, membershipsResult] = await Promise.all([
        supabase
          .from("departments")
          .select("department_id, name, head_user_id, head:users(first_name, last_name)")
          .eq("school_id", sid)
          .order("name"),
        supabase
          .from("user_schools")
          .select("user_id, user:users(role), subscription:subscriptions(tier)")
          .eq("school_id", sid),
      ]);

      if (deptResult.error) throw deptResult.error;
      if (membershipsResult.error) throw membershipsResult.error;

      const depts: Department[] = (deptResult.data ?? []).map((d: any) => {
        const head = Array.isArray(d.head) ? d.head[0] : d.head;
        const headName =
          head
            ? [head.first_name?.trim(), head.last_name?.trim()].filter(Boolean).join(" ") || null
            : null;
        return {
          department_id: String(d.department_id),
          name: String(d.name),
          headName,
        };
      });
      setDepartments(depts);

      let teachers = 0;
      let tier2 = 0;
      for (const m of membershipsResult.data ?? []) {
        const u = Array.isArray(m.user) ? m.user[0] : m.user;
        const sub = Array.isArray(m.subscription) ? m.subscription[0] : m.subscription;
        if (u?.role === "teacher") {
          teachers += 1;
          if (sub?.tier === "tier2") tier2 += 1;
        }
      }
      setTeacherCount(teachers);
      setTier2Count(tier2);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Please try again.";
      Alert.alert("Unable to load settings", message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { refreshing, onRefresh } = usePullToRefresh(loadData);

  const handleCopyCode = useCallback(async () => {
    if (!school?.join_code) return;
    await Share.share({ message: `Join ${school.name} on SchEDU with code: ${school.join_code}` });
  }, [school]);

  const handleRegenerateCode = useCallback(() => {
    if (!school?.school_id) return;
    Alert.alert(
      "Regenerate join code?",
      "The old code will stop working immediately. Any teacher who hasn't joined yet will need the new code.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          style: "destructive",
          onPress: async () => {
            setRegenerating(true);
            try {
              const { data, error } = await supabase.rpc("regenerate_join_code", {
                p_school_id: school.school_id,
              });
              if (error) throw error;
              setSchool((prev) => (prev ? { ...prev, join_code: String(data) } : prev));
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : "Please try again.";
              Alert.alert("Failed to regenerate", message);
            } finally {
              setRegenerating(false);
            }
          },
        },
      ]
    );
  }, [school]);

  const handleAddDepartment = useCallback(async () => {
    const name = newDeptName.trim();
    if (!name || !school?.school_id) return;
    setAddingDept(true);
    try {
      const { error } = await supabase
        .from("departments")
        .insert({ school_id: school.school_id, name });
      if (error) throw error;
      setNewDeptName("");
      setAddDeptModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Please try again.";
      Alert.alert("Failed to add department", message);
    } finally {
      setAddingDept(false);
    }
  }, [newDeptName, school, loadData]);

  const handleDeleteDepartment = useCallback(
    (dept: Department) => {
      Alert.alert(
        `Remove "${dept.name}"?`,
        "Teachers in this department will be unassigned but remain in the school.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                const { error } = await supabase
                  .from("departments")
                  .delete()
                  .eq("department_id", dept.department_id);
                if (error) throw error;
                await loadData();
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Please try again.";
                Alert.alert("Failed to remove department", message);
              }
            },
          },
        ]
      );
    },
    [loadData]
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: screenBg }]} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <ActivityIndicator color={c.tint} />
        </View>
      </SafeAreaView>
    );
  }

  if (!school) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: screenBg }]} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: c.mutedText }]}>No school found for this account.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: screenBg }]} edges={["top", "bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
      >
        <Animated.View entering={FadeIn.duration(380)} style={styles.header}>
          <Text style={[styles.title, { color: c.text }]}>Settings</Text>
        </Animated.View>

        {/* School info */}
        <Animated.View
          entering={FadeInDown.duration(300).delay(60)}
          style={[styles.section, { backgroundColor: cardBg, borderColor }]}
        >
          <Text style={[styles.sectionTitle, { color: c.text }]}>{school.name}</Text>
          <View style={[styles.typeBadge, { backgroundColor: scheme === "dark" ? "#1A2330" : "#F0EDE8" }]}>
            <Text style={[styles.typeBadgeText, { color: c.mutedText }]}>
              {SCHOOL_TYPE_LABELS[school.type] ?? school.type}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: borderColor }]} />
          <View style={styles.seatRow}>
            <Ionicons name="person-outline" size={16} color={c.mutedText} />
            <Text style={[styles.seatText, { color: c.mutedText }]}>
              {tier2Count} of {teacherCount} teacher{teacherCount !== 1 ? "s" : ""} on Pro tier
            </Text>
          </View>
        </Animated.View>

        {/* Join code */}
        <Animated.View entering={FadeInDown.duration(280).delay(120)} style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: c.text }]}>Join Code</Text>
          <Text style={[styles.sectionHint, { color: c.mutedText }]}>
            Teachers enter this code to join your school
          </Text>
        </Animated.View>
        <Animated.View
          entering={FadeInDown.duration(280).delay(160)}
          style={[styles.section, { backgroundColor: cardBg, borderColor }]}
        >
          <Text style={[styles.joinCode, { color: c.text }]}>{school.join_code}</Text>
          <View style={styles.codeActions}>
            <AnimatedPressable
              animatedStyle={[styles.codeBtn, { backgroundColor: scheme === "dark" ? "#243B30" : "#DFF5EB" }]}
              onPress={handleCopyCode}
            >
              <Ionicons name="share-outline" size={16} color="#146854" />
              <Text style={styles.codeBtnText}>Share</Text>
            </AnimatedPressable>
            <AnimatedPressable
              animatedStyle={[styles.codeBtn, { backgroundColor: scheme === "dark" ? "#1A2330" : "#F0EDE8" }]}
              onPress={handleRegenerateCode}
              disabled={regenerating}
            >
              {regenerating ? (
                <ActivityIndicator size="small" color={c.mutedText} />
              ) : (
                <Ionicons name="refresh-outline" size={16} color={c.mutedText} />
              )}
              <Text style={[styles.codeBtnText, { color: c.mutedText }]}>Regenerate</Text>
            </AnimatedPressable>
          </View>
        </Animated.View>

        {/* Departments */}
        <Animated.View entering={FadeInDown.duration(280).delay(220)} style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: c.text }]}>Departments</Text>
          <Text style={[styles.sectionHint, { color: c.mutedText }]}>
            Group teachers by college or unit
          </Text>
        </Animated.View>
        <Animated.View
          entering={FadeInDown.duration(280).delay(260)}
          style={[styles.section, { backgroundColor: cardBg, borderColor, gap: 0 }]}
        >
          {departments.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.mutedText }]}>No departments added yet.</Text>
          ) : (
            departments.map((dept, index) => (
              <DeptRowItem
                key={dept.department_id}
                dept={dept}
                index={index}
                isLast={index === departments.length - 1}
                borderColor={borderColor}
                textColor={c.text}
                mutedColor={c.mutedText}
                onDelete={handleDeleteDepartment}
              />
            ))
          )}
          <AnimatedPressable
            animatedStyle={[
              styles.addDeptBtn,
              { borderTopWidth: departments.length > 0 ? 1 : 0, borderTopColor: borderColor },
            ]}
            onPress={() => setAddDeptModalOpen(true)}
          >
            <Ionicons name="add" size={18} color={c.tint} />
            <Text style={[styles.addDeptText, { color: c.tint }]}>Add department</Text>
          </AnimatedPressable>
        </Animated.View>
      </ScrollView>

      {/* Add department modal */}
      <Modal visible={addDeptModalOpen} transparent animationType="fade" onRequestClose={() => setAddDeptModalOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setAddDeptModalOpen(false)}>
          <Pressable
            style={[styles.modal, { backgroundColor: cardBg, borderColor }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: c.text }]}>New Department</Text>
            <TextInput
              style={[styles.modalInput, { color: c.text, backgroundColor: inputBg, borderColor }]}
              placeholder="e.g. College of Engineering"
              placeholderTextColor={c.mutedText}
              value={newDeptName}
              onChangeText={setNewDeptName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAddDepartment}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: scheme === "dark" ? "#1A2330" : "#F0EDE8" }]}
                onPress={() => {
                  setAddDeptModalOpen(false);
                  setNewDeptName("");
                }}
              >
                <Text style={[styles.modalBtnText, { color: c.mutedText }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalBtn,
                  { backgroundColor: scheme === "dark" ? "#243B30" : "#DFF5EB" },
                  (!newDeptName.trim() || addingDept) && { opacity: 0.5 },
                ]}
                onPress={handleAddDepartment}
                disabled={!newDeptName.trim() || addingDept}
              >
                {addingDept ? (
                  <ActivityIndicator size="small" color="#146854" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: "#146854" }]}>Add</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 48, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { marginBottom: 4 },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.8 },
  section: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 12,
    shadowColor: "#A79B89",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionTitle: { fontSize: 20, fontWeight: "700" },
  typeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  typeBadgeText: { fontSize: 13, fontWeight: "600" },
  divider: { height: 1, marginVertical: 4 },
  seatRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  seatText: { fontSize: 14, fontWeight: "500" },
  sectionHeader: { gap: 2, marginTop: 8 },
  sectionLabel: { fontSize: 18, fontWeight: "700" },
  sectionHint: { fontSize: 13, fontWeight: "500" },
  joinCode: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 6,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  codeActions: { flexDirection: "row", gap: 12, justifyContent: "center" },
  codeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  codeBtnText: { fontSize: 15, fontWeight: "600", color: "#146854" },
  emptyText: { fontSize: 14, fontWeight: "500" },
  deptRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  deptMain: { flex: 1, gap: 2 },
  deptName: { fontSize: 16, fontWeight: "600" },
  deptHead: { fontSize: 13, fontWeight: "500" },
  deptDelete: { padding: 4 },
  addDeptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
  },
  addDeptText: { fontSize: 15, fontWeight: "600" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modal: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    gap: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  modalActions: { flexDirection: "row", gap: 12 },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalBtnText: { fontSize: 15, fontWeight: "700" },
});
