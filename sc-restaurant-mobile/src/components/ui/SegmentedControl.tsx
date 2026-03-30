import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export interface SegmentOption<T extends string> {
  label: string;
  value: T;
  description?: string | null;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  scrollable = false,
  tone = "neutral",
  emphasis = "default",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange(value: T): void;
  scrollable?: boolean;
  tone?: "neutral" | "accent";
  emphasis?: "default" | "strong";
}) {
  const content = (
    <View style={styles.root}>
      {options.map((option) => {
        const active = option.value === value;
        const strongActive = active && emphasis === "strong";
        const stacked = Boolean(option.description);
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              stacked ? styles.segmentStacked : null,
              active ? (tone === "accent" ? styles.segmentActiveAccent : styles.segmentActive) : null,
              strongActive ? styles.segmentStrongActive : null,
            ]}
          >
            <View style={[styles.segmentInner, stacked ? styles.segmentInnerStacked : null]}>
              {strongActive && !stacked ? (
                <View style={styles.selectionMark}>
                  <Feather color={colors.accent} name="check" size={11} />
                </View>
              ) : null}
              <Text
                style={[
                  styles.label,
                  stacked ? styles.labelStacked : null,
                  active ? (tone === "accent" ? styles.labelActiveAccent : styles.labelActive) : null,
                  strongActive ? styles.labelStrongActive : null,
                ]}
              >
                {option.label}
              </Text>
              {option.description ? (
                <Text
                  style={[
                    styles.description,
                    active ? styles.descriptionActive : null,
                    strongActive ? styles.descriptionStrongActive : null,
                  ]}
                >
                  {option.description}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  if (!scrollable) return content;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  segment: {
    minHeight: 38,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  segmentStacked: {
    minHeight: 56,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
  },
  segmentInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  segmentInnerStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
  },
  segmentActive: {
    backgroundColor: colors.surfaceStrong,
  },
  segmentActiveAccent: {
    backgroundColor: colors.accent,
  },
  segmentStrongActive: {
    backgroundColor: colors.accentSoft,
    borderColor: "rgba(230, 122, 46, 0.34)",
  },
  selectionMark: {
    width: 18,
    height: 18,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceStrong,
  },
  label: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: typography.medium,
  },
  labelStacked: {
    fontSize: typography.bodySm,
  },
  labelActive: {
    color: colors.text,
    fontWeight: typography.semibold,
  },
  labelActiveAccent: {
    color: colors.surfaceStrong,
    fontWeight: typography.semibold,
  },
  labelStrongActive: {
    color: colors.accent,
  },
  description: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.regular,
  },
  descriptionActive: {
    color: colors.text,
  },
  descriptionStrongActive: {
    color: colors.accent,
  },
});
