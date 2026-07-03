import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../context/theme";
import { Spacing, Typography } from "../constants/fonts";
import type { LegalDoc } from "../constants/legal";

/** Scrollable renderer for the in-app legal documents (Privacy / Terms). */
export default function LegalScreen({ doc }: { doc: LegalDoc }) {
  const { colors: c } = useAppTheme();

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[Typography.h1, { color: c.text }]}>{doc.title}</Text>
      <Text style={[Typography.caption, { color: c.mutedText, marginTop: 4 }]}>
        Last updated {doc.updated}
      </Text>

      {doc.sections.map((section, i) => (
        <View key={i} style={styles.section}>
          {section.heading ? (
            <Text style={[Typography.h3, { color: c.text, marginBottom: 6 }]}>
              {section.heading}
            </Text>
          ) : null}

          {section.paragraphs?.map((p, j) => (
            <Text key={j} style={[styles.paragraph, { color: c.mutedText }]}>
              {p}
            </Text>
          ))}

          {section.bullets?.map((b, j) => (
            <View key={j} style={styles.bulletRow}>
              <Text style={[styles.bullet, { color: c.tint }]}>{"•"}</Text>
              <Text style={[styles.paragraph, styles.bulletText, { color: c.mutedText }]}>
                {b}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 48,
  },
  section: { marginTop: Spacing.lg },
  paragraph: {
    ...Typography.bodySm,
    lineHeight: 21,
    marginBottom: 8,
  },
  bulletRow: { flexDirection: "row", gap: 8, paddingRight: 4 },
  bullet: { ...Typography.bodySm, lineHeight: 21 },
  bulletText: { flex: 1 },
});
