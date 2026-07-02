import React, { forwardRef, useState } from "react";
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useAppTheme } from "../../context/theme";
import { Radius, Spacing, Typography } from "../../constants/fonts";
import { durations } from "../../lib/motion";

type Props = TextInputProps & {
  label?: string;
  /** Inline validation message; presence switches the field into error state. */
  error?: string | null;
  helper?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, helper, containerStyle, onFocus, onBlur, style, ...rest },
  ref
) {
  const { colors: c } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const focusT = useSharedValue(0);

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: error ? c.danger : focusT.value > 0.5 ? c.tint : c.border,
  }));

  return (
    <View style={containerStyle}>
      {!!label && (
        <Text style={[Typography.bodySm, styles.label, { color: error ? c.danger : c.mutedText }]}>{label}</Text>
      )}
      <Animated.View style={[styles.field, { backgroundColor: c.surfaceAlt }, borderStyle]}>
        <TextInput
          ref={ref}
          {...rest}
          accessibilityLabel={rest.accessibilityLabel ?? label ?? rest.placeholder}
          placeholderTextColor={c.faintText}
          onFocus={(e) => {
            setFocused(true);
            focusT.value = withTiming(1, { duration: durations.fast });
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            focusT.value = withTiming(0, { duration: durations.fast });
            onBlur?.(e);
          }}
          style={[Typography.body, styles.input, { color: c.text }, style]}
        />
      </Animated.View>
      {!!(error || helper) && (
        <Text
          accessibilityLiveRegion={error ? "polite" : "none"}
          style={[Typography.caption, styles.helper, { color: error ? c.danger : c.faintText }]}
        >
          {error || helper}
        </Text>
      )}
    </View>
  );
});

export default Input;

const styles = StyleSheet.create({
  label: { marginBottom: Spacing.xs, fontWeight: "500" },
  field: {
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  input: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  helper: { marginTop: Spacing.xs },
});
