import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "@/src/theme/tokens";

type Variant = "primary" | "secondary" | "ghost";
type Size = "default" | "cta";

export function MeatButton({
  children,
  onPress,
  variant = "primary",
  size = "default",
  disabled,
  loading,
  fullWidth,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}) {
  const label =
    typeof children === "string" ? (
      <Text style={[styles.label, labelStyles[variant], size === "cta" ? styles.labelCta : null]}>
        {children}
      </Text>
    ) : (
      children
    );

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        size === "cta" ? styles.cta : styles.default,
        fullWidth ? styles.fullWidth : null,
        pressed && !disabled && !loading ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator
            color={variant === "primary" ? colors.surfaceStrong : colors.accent}
            size="small"
          />
          <Text style={[styles.label, labelStyles[variant]]}>Загрузка…</Text>
        </View>
      ) : (
        label
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  default: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
  },
  cta: {
    minHeight: 50,
    paddingHorizontal: spacing.xl,
  },
  fullWidth: {
    width: "100%",
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.994 }],
  },
  disabled: {
    opacity: 0.56,
  },
  label: {
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  labelCta: {
    fontSize: typography.body,
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
});

const labelStyles = StyleSheet.create({
  primary: {
    color: colors.surfaceStrong,
  },
  secondary: {
    color: colors.text,
  },
  ghost: {
    color: colors.accent,
  },
});
