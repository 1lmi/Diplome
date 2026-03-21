import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export function StatusPill({
  label,
  tone = "accent",
}: {
  label: string;
  tone?: "accent" | "success" | "danger" | "muted";
}) {
  return (
    <View style={[styles.base, toneStyles[tone]]}>
      <Text style={[styles.label, labelStyles[tone]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    minHeight: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: typography.caption,
    fontWeight: typography.medium,
  },
});

const toneStyles = StyleSheet.create({
  accent: {
    backgroundColor: colors.accentSoft,
  },
  success: {
    backgroundColor: "rgba(31, 157, 104, 0.12)",
  },
  danger: {
    backgroundColor: "rgba(210, 74, 67, 0.1)",
  },
  muted: {
    backgroundColor: colors.surfaceMuted,
  },
});

const labelStyles = StyleSheet.create({
  accent: { color: colors.accent },
  success: { color: colors.success },
  danger: { color: colors.danger },
  muted: { color: colors.muted },
});
