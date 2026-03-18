import type { ReactNode } from "react";
import React from "react";
import { StyleSheet, View } from "react-native";

import { colors, radii, spacing, shadows } from "@/src/theme/tokens";

export function SectionCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(234, 223, 211, 0.52)",
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.soft,
  },
});
