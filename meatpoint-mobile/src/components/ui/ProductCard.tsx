import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ProductDisplay } from "@/src/api/types";
import { formatPrice, getDisplayImage, sizeCaption } from "@/src/lib/format";
import { colors, radii, shadows, spacing, typography } from "@/src/theme/tokens";

export function ProductCard({
  product,
  onPress,
  onAdd,
}: {
  product: ProductDisplay;
  onPress(): void;
  onAdd?(): void;
}) {
  const previewVariant = product.variants[0];
  const previewSize = sizeCaption(
    previewVariant?.size_label || previewVariant?.size_name,
    previewVariant?.size_amount,
    previewVariant?.size_unit
  );

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]} onPress={onPress}>
      <View style={styles.imageWrap}>
        <Image
          contentFit="contain"
          source={{ uri: getDisplayImage(product.image_url) }}
          style={styles.image}
        />
      </View>

      <View style={styles.body}>
        <Text numberOfLines={2} style={styles.name}>
          {product.name}
        </Text>
        <Text style={styles.meta}>{previewSize || "Стандартная порция"}</Text>
      </View>

      <View style={styles.control}>
        <Text style={styles.price}>
          {product.variants.length > 1
            ? `от ${formatPrice(product.minPrice)}`
            : formatPrice(product.minPrice)}
        </Text>
        <Pressable
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation();
            onAdd?.();
          }}
          style={({ pressed }) => [styles.addButton, pressed ? styles.addButtonPressed : null]}
        >
          <Feather color={colors.text} name="plus" size={18} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.986 }],
  },
  imageWrap: {
    height: 176,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.soft,
  },
  image: {
    width: "92%",
    height: "92%",
  },
  body: {
    gap: 4,
    paddingHorizontal: spacing.xs,
    minHeight: 60,
  },
  name: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 21,
    fontWeight: typography.medium,
  },
  meta: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  control: {
    minHeight: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  price: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.medium,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
});
