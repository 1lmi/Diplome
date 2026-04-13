import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ProductDisplay } from "@/src/api/types";
import { formatPrice, getDisplayImage } from "@/src/lib/format";
import { colors, radii, shadows, spacing, typography } from "@/src/theme/tokens";

const FROM_PRICE_LABEL = "\u043e\u0442";

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
          {product.variants.length > 1 ? `${FROM_PRICE_LABEL} ${formatPrice(product.minPrice)}` : formatPrice(product.minPrice)}
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  cardPressed: {
    opacity: 0.96,
  },
  imageWrap: {
    height: 164,
    borderRadius: radii.lg,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "98%",
    height: "98%",
  },
  body: {
    paddingHorizontal: spacing.xs,
    height: 40,
    justifyContent: "flex-start",
  },
  name: {
    color: colors.text,
    fontSize: typography.bodySm,
    lineHeight: 18,
    fontWeight: typography.medium,
  },
  control: {
    minHeight: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.line,
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
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.soft,
  },
  addButtonPressed: {
    opacity: 0.88,
  },
});
