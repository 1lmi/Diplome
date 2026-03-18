import type { ReactNode } from "react";
import React from "react";
import { StyleSheet, View } from "react-native";

import { colors, radii, spacing, shadows } from "@/src/theme/tokens";

export function SectionCard({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return <View style={[styles.card, compact ? styles.compact : null]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.soft,
  },
  compact: {
    padding: spacing.md,
    gap: spacing.sm,
  },
});
