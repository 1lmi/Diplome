import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export function PageHeader({
  title,
  subtitle,
  right,
  showBack = false,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  showBack?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {showBack ? (
          <Pressable style={styles.back} onPress={() => router.back()}>
            <Feather color={colors.text} name="chevron-left" size={18} />
          </Pressable>
        ) : null}
        <View style={styles.textBlock}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  back: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: "rgba(234, 223, 211, 0.8)",
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: typography.titleSm,
    fontWeight: typography.medium,
  },
  subtitle: {
    color: colors.muted,
    fontSize: typography.caption,
  },
});
