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
      <Pressable style={styles.button} onPress={onDecrement}>
        <Feather color={colors.text} name="minus" size={16} />
      </Pressable>
      <Text style={styles.value}>{quantity}</Text>
      <Pressable style={styles.button} onPress={onIncrement}>
        <Feather color={colors.text} name="plus" size={16} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(234, 223, 211, 0.72)",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    height: 34,
  },
  button: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    minWidth: 18,
    textAlign: "center",
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: typography.medium,
  },
});
