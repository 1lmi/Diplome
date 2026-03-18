import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
          <Pressable style={({ pressed }) => [styles.back, pressed ? styles.backPressed : null]} onPress={() => router.back()}>
            <Feather color={colors.text} name="chevron-left" size={18} />
          </Pressable>
        ) : null}
        <View style={styles.textBlock}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceStrong,
  },
  backPressed: {
    opacity: 0.88,
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: colors.text,
    fontSize: typography.titleSm,
    lineHeight: 24,
    fontWeight: typography.semibold,
  },
  subtitle: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  right: {
    paddingTop: 2,
  },
});
