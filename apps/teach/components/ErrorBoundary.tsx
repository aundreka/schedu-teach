import React from "react";
import { Appearance, Pressable, StyleSheet, Text, View } from "react-native";
import { captureException } from "../lib/sentry";
import { Colors } from "../constants/colors";
import { Radius, Spacing, Typography } from "../constants/fonts";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Class component (required for componentDidCatch), so it can't call
// useAppTheme — it follows the system scheme directly.
class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    captureException(error);
  }

  render() {
    if (this.state.hasError) {
      const c = Colors[Appearance.getColorScheme() === "dark" ? "dark" : "light"];
      return (
        <View
          accessibilityRole="alert"
          style={[styles.container, { backgroundColor: c.background }]}
        >
          <Text style={[Typography.h2, styles.title, { color: c.text }]}>Something went wrong</Text>
          <Text style={[Typography.body, styles.message, { color: c.mutedText }]}>
            {this.state.error?.message ?? "An unexpected error occurred."}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={() => this.setState({ hasError: false, error: null })}
            style={[styles.button, { backgroundColor: c.tint }]}
          >
            <Text style={[Typography.bodyMedium, { color: c.onTint }]}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xxl,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  message: {
    textAlign: "center",
    marginBottom: Spacing.xxl,
  },
  button: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
});

export default ErrorBoundary;
