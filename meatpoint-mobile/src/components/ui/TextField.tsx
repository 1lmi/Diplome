import React, { useState } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";

import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export function TextField({
  label,
  error,
  helper,
  trailing,
  multiline,
  containerStyle,
  ...props
}: TextInputProps & {
  label?: string;
  error?: string;
  helper?: string;
  trailing?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={[
          styles.field,
          multiline ? styles.fieldMultiline : null,
          focused ? styles.fieldFocused : null,
          error ? styles.fieldError : null,
        ]}
      >
        <TextInput
          placeholderTextColor={colors.muted}
          style={[styles.input, multiline ? styles.inputMultiline : null]}
          multiline={multiline}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          textAlignVertical={multiline ? "top" : "center"}
          {...props}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </Pressable>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  label: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.medium,
  },
  field: {
    minHeight: 48,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceStrong,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  fieldMultiline: {
    minHeight: 128,
    alignItems: "flex-start",
    paddingVertical: spacing.md,
  },
  fieldFocused: {
    borderColor: "rgba(230, 122, 46, 0.48)",
    backgroundColor: colors.surface,
  },
  fieldError: {
    borderColor: "rgba(210, 74, 67, 0.4)",
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: typography.body,
    paddingVertical: 0,
  },
  inputMultiline: {
    minHeight: 98,
  },
  trailing: {
    alignSelf: "center",
  },
  helper: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 17,
  },
  error: {
    color: colors.danger,
    fontSize: typography.caption,
    lineHeight: 17,
  },
});
