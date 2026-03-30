import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Feather color={colors.accent} name={icon} size={18} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: colors.text,
    fontSize: typography.titleSm,
    fontWeight: typography.semibold,
    textAlign: "center",
  },
  description: {
    color: colors.muted,
    fontSize: typography.bodySm,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
});
