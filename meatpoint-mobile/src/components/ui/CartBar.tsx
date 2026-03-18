import { Feather } from "@expo/vector-icons";
import React from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatPrice } from "@/src/lib/format";
import { colors, radii, shadows, spacing, typography } from "@/src/theme/tokens";

export function CartBar({
  count,
  total,
  onPress,
}: {
  count: number;
  total: number;
  onPress(): void;
}) {
  const insets = useSafeAreaInsets();
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(18)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          bottom: insets.bottom + spacing.md,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Pressable onPress={onPress} style={({ pressed }) => [styles.bar, pressed ? styles.barPressed : null]}>
        <View style={styles.meta}>
          <Text style={styles.count}>Корзина · {count} поз.</Text>
          <Text style={styles.total}>{formatPrice(total)}</Text>
        </View>
        <View style={styles.cta}>
          <Text style={styles.ctaLabel}>Открыть</Text>
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
    borderRadius: radii.xl,
    backgroundColor: "rgba(33, 26, 22, 0.96)",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    ...shadows.card,
  },
  barPressed: {
    transform: [{ scale: 0.992 }],
    opacity: 0.96,
  },
  meta: {
    gap: 2,
  },
  count: {
    color: "rgba(255,255,255,0.66)",
    fontSize: typography.caption,
  },
  total: {
    color: colors.surfaceStrong,
    fontSize: typography.body,
    fontWeight: typography.medium,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  ctaLabel: {
    color: colors.surfaceStrong,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
});
