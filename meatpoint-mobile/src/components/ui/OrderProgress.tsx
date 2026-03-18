import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { OrderProgressStep } from "@/src/lib/order-progress";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const toneStyle = {
  completed: {
    dotBg: colors.accent,
    dotBorder: colors.accent,
    line: "rgba(230, 122, 46, 0.35)",
    text: colors.text,
  },
  current: {
    dotBg: colors.accent,
    dotBorder: colors.accent,
    line: colors.border,
    text: colors.text,
  },
  future: {
    dotBg: colors.surfaceStrong,
    dotBorder: colors.border,
    line: colors.border,
    text: colors.muted,
  },
  danger: {
    dotBg: colors.danger,
    dotBorder: colors.danger,
    line: colors.border,
    text: colors.danger,
  },
} as const;

export function OrderProgress({ steps }: { steps: OrderProgressStep[] }) {
  return (
    <View style={styles.root}>
      {steps.map((step, index) => {
        const tone = toneStyle[step.tone];
        return (
          <View key={step.key} style={styles.step}>
            <View style={styles.track}>
              {index > 0 ? <View style={[styles.line, { backgroundColor: tone.line }]} /> : null}
              <View
                style={[
                  styles.dot,
                  { backgroundColor: tone.dotBg, borderColor: tone.dotBorder },
                ]}
              />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.label, { color: tone.text }]}>{step.label}</Text>
              <Text style={styles.caption}>{step.caption}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  step: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  track: {
    width: 18,
    alignItems: "center",
  },
  line: {
    position: "absolute",
    top: -14,
    width: 2,
    height: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
    borderWidth: 2,
    marginTop: 1,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  caption: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 17,
  },
});
