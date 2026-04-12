import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ProductDisplay } from "@/src/api/types";
import { formatPrice, getDisplayImage } from "@/src/lib/format";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export function ProductCard({
  product,
  onPress,
  onAdd,
}: {
  product: ProductDisplay;
  onPress(): void;
  onAdd?(): void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]} onPress={onPress}>
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
      </View>

      <View style={styles.control}>
        <Text style={styles.price}>
          {product.variants.length > 1 ? `от ${formatPrice(product.minPrice)}` : formatPrice(product.minPrice)}
        </Text>
        <Pressable
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation();
            onAdd?.();
          }}
          style={({ pressed }) => [styles.addButton, pressed ? styles.addButtonPressed : null]}
        >
          <Feather color={colors.text} name="plus" size={16} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  cardPressed: {
    opacity: 0.96,
  },
  imageWrap: {
    height: 152,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "90%",
    height: "90%",
  },
  body: {
    paddingHorizontal: spacing.xs,
    minHeight: 34,
  },
  name: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 20,
    fontWeight: typography.medium,
  },
  control: {
    minHeight: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  price: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  addButton: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonPressed: {
    opacity: 0.88,
  },
});
