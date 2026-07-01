import { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { type Href, useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useAppTheme } from "../../../context/theme";

type CreateOption = {
  key: string;
  label: string;
  sublabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: Href;
};

const OPTIONS: CreateOption[] = [
  {
    key: "lessonplan",
    label: "Lesson Plan",
    sublabel: "Pace your term",
    icon: "document-text-outline",
    route: "/(tabs)/create/lessonplan",
  },
  {
    key: "subject",
    label: "Subject",
    sublabel: "New course",
    icon: "book-outline",
    route: "/(tabs)/create/subject",
  },
  {
    key: "lesson",
    label: "Lesson",
    sublabel: "Add content",
    icon: "create-outline",
    route: "/(tabs)/create/lesson",
  },
  {
    key: "activities",
    label: "Activities",
    sublabel: "Auto-generated",
    icon: "clipboard-outline",
    route: "/(tabs)/create/activities",
  },
];

function OptionCard({
  option,
  colorSet,
  onPress,
  index,
}: {
  option: CreateOption;
  colorSet: { bg: string; border: string; fg: string };
  onPress: () => void;
  index: number;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 55).duration(260).springify()}
      style={[styles.option, { backgroundColor: colorSet.bg, borderColor: colorSet.border }, animStyle]}
    >
      <Pressable
        style={styles.optionInner}
        onPressIn={() => { scale.value = withTiming(0.93, { duration: 80 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 10, stiffness: 180 }); }}
        onPress={() => {
          Haptics.selectionAsync();
          onPress();
        }}
      >
        <View style={[styles.iconWrap, { backgroundColor: colorSet.border }]}>
          <Ionicons name={option.icon} size={22} color={colorSet.fg} />
        </View>
        <Text style={[styles.optionText, { color: colorSet.fg }]}>{option.label}</Text>
        <Text style={[styles.optionSublabel, { color: colorSet.fg }]}>{option.sublabel}</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function CreateScreen() {
  const { colors: c, scheme } = useAppTheme();
  const [open, setOpen] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setOpen(true);
    }, [])
  );

  const closePicker = useCallback(() => {
    setOpen(false);
    router.replace("/(tabs)");
  }, []);

  const goToCreate = useCallback((route: Href) => {
    setOpen(false);
    router.push(route);
  }, []);

  const isDark = scheme === "dark";
  const optionColors: Record<string, { bg: string; border: string; fg: string }> = {
    lessonplan: {
      bg: isDark ? "#2F3D45" : "#DDECF4",
      border: isDark ? "#435560" : "#CCDCE4",
      fg: isDark ? "#C7D9E2" : "#3B5563",
    },
    subject: {
      bg: isDark ? "#413850" : "#F4E3F5",
      border: isDark ? "#5A4D6E" : "#E4D1E5",
      fg: isDark ? "#DDD1EB" : "#59446A",
    },
    lesson: {
      bg: isDark ? "#2D4634" : "#DFF2DE",
      border: isDark ? "#3E6049" : "#CFE2CD",
      fg: isDark ? "#C9E7D1" : "#3F6449",
    },
    activities: {
      bg: isDark ? "#4D4630" : "#F8EDC8",
      border: isDark ? "#685E41" : "#E8DDAF",
      fg: isDark ? "#ECE0BA" : "#6A5B34",
    },
  };

  return (
    <View style={[styles.page, { backgroundColor: c.background }]}>
      <Modal visible={open} transparent animationType="none" onRequestClose={closePicker}>
        <Pressable style={styles.backdrop} onPress={closePicker}>
          <Animated.View entering={FadeInUp.duration(300).springify()}>
            <Pressable
              style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
              onPress={(event) => event.stopPropagation()}
            >
              <View style={styles.titleBlock}>
                <Text style={[styles.title, { color: c.text }]}>What do you want to create?</Text>
                <Text style={[styles.subtitle, { color: c.mutedText }]}>Choose a type to get started</Text>
              </View>
              <View style={styles.grid}>
                {OPTIONS.map((option, index) => (
                  <OptionCard
                    key={option.key}
                    option={option}
                    colorSet={optionColors[option.key] ?? { bg: c.card, border: c.border, fg: c.text }}
                    onPress={() => goToCreate(option.route)}
                    index={index}
                  />
                ))}
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  titleBlock: { gap: 4 },
  title: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "400",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  option: {
    width: "48%",
    minHeight: 122,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  optionInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 16,
    minHeight: 122,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  optionText: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  optionSublabel: {
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
    opacity: 0.75,
  },
});
