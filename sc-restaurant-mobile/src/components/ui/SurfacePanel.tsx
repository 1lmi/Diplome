import type { ReactNode } from "react";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radii, shadows, spacing } from "@/src/theme/tokens";

export function SurfacePanel({
  children,
  compact = false,
  tone = "default",
  style,
}: {
  children: ReactNode;
  compact?: boolean;
  tone?: "default" | "tint" | "soft";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.base, compact ? styles.compact : null, toneStyles[tone], style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.soft,
  },
  compact: {
    padding: spacing.md,
    gap: spacing.sm,
  },
});

const toneStyles = StyleSheet.create({
  default: {
    backgroundColor: colors.surface,
  },
  tint: {
    backgroundColor: colors.surfaceTint,
  },
  soft: {
    backgroundColor: colors.surfaceMuted,
  },
});
