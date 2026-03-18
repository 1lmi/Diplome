import { Feather } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { formatPrice } from "@/src/lib/format";
import { colors, radii, shadows, spacing, typography } from "@/src/theme/tokens";

export function CartBar({
  count,
  total,
  onPress,
  pulseKey,
}: {
  count: number;
  total: number;
  onPress(): void;
  pulseKey?: number | null;
}) {
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(22);
  const scale = useSharedValue(1);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 180 });
    translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
  }, [opacity, translateY]);

  useEffect(() => {
    if (!pulseKey) return;
    scale.value = withSequence(
      withTiming(1.03, { duration: 120 }),
      withTiming(1, { duration: 160 })
    );
  }, [pulseKey, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.wrap, { bottom: insets.bottom + spacing.md }, animatedStyle]}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.bar, pressed ? styles.barPressed : null]}>
        <View style={styles.countChip}>
          <Text style={styles.countChipText}>{count}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.total}>{formatPrice(total)}</Text>
          <Text style={styles.copy}>Перейти в корзину</Text>
        </View>
        <View style={styles.chevron}>
          <Feather color={colors.surfaceStrong} name="arrow-right" size={15} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
  },
  bar: {
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    ...shadows.card,
  },
  barPressed: {
    opacity: 0.96,
  },
  countChip: {
    minWidth: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  countChipText: {
    color: colors.surfaceStrong,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  total: {
    color: colors.surfaceStrong,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  copy: {
    color: "rgba(255,255,255,0.76)",
    fontSize: typography.caption,
  },
  chevron: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
});
