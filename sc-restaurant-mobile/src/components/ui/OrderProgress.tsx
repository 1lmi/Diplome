import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { OrderProgressStep } from "@/src/lib/order-progress";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const toneStyle = {
  completed: {
    dotBg: colors.accent,
    line: "rgba(230, 122, 46, 0.28)",
    text: colors.text,
  },
  current: {
    dotBg: colors.accent,
    line: colors.line,
    text: colors.text,
  },
  future: {
    dotBg: colors.surfaceStrong,
    line: colors.line,
    text: colors.muted,
  },
  danger: {
    dotBg: colors.danger,
    line: colors.line,
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
              <View style={[styles.dot, { backgroundColor: tone.dotBg }]} />
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
    top: -16,
    width: 2,
    height: 16,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
    marginTop: 2,
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  label: {
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  caption: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
});
