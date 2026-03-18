import { ActivityIndicator } from "react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        size === "cta" ? styles.cta : styles.default,
        fullWidth && styles.fullWidth,
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
          <Text
            style={[
              styles.label,
              variant === "primary" ? styles.labelPrimary : styles.labelSecondary,
            ]}
          >
            Загружаем
          </Text>
        </View>
      ) : typeof children === "string" ? (
        <Text
          style={[
            styles.label,
            variant === "primary" ? styles.labelPrimary : styles.labelSecondary,
          ]}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
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
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.56,
  },
  label: {
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  labelPrimary: {
    color: colors.surfaceStrong,
  },
  labelSecondary: {
    color: colors.accent,
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
    borderColor: "rgba(234, 223, 211, 0.78)",
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
});
