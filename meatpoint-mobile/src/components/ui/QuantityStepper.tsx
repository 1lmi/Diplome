import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export function QuantityStepper({
  quantity,
  onDecrement,
  onIncrement,
}: {
  quantity: number;
  onDecrement(): void;
  onIncrement(): void;
}) {
  return (
    <View style={styles.wrap}>
      <Pressable style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]} onPress={onDecrement}>
        <Feather color={colors.text} name="minus" size={15} />
      </Pressable>
      <Text style={styles.value}>{quantity}</Text>
      <Pressable style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]} onPress={onIncrement}>
        <Feather color={colors.text} name="plus" size={15} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    height: 38,
  },
  button: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceStrong,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  value: {
    minWidth: 18,
    textAlign: "center",
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: typography.semibold,
  },
});
