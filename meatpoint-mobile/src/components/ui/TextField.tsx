import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
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
  containerStyle?: object;
}) {
  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={[
          styles.field,
          multiline ? styles.fieldMultiline : null,
          error ? styles.fieldError : null,
        ]}
      >
        <TextInput
          placeholderTextColor={colors.muted}
          style={[styles.input, multiline ? styles.inputMultiline : null]}
          multiline={multiline}
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
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(234, 223, 211, 0.78)",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  fieldMultiline: {
    minHeight: 120,
    alignItems: "flex-start",
    paddingVertical: spacing.md,
  },
  fieldError: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: typography.bodySm,
    paddingVertical: 0,
  },
  inputMultiline: {
    minHeight: 96,
  },
  trailing: {
    alignSelf: "center",
  },
  helper: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  error: {
    color: colors.danger,
    fontSize: typography.caption,
  },
});
