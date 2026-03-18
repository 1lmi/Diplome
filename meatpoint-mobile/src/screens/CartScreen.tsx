import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "@/src/components/ui/EmptyState";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { QuantityStepper } from "@/src/components/ui/QuantityStepper";
import { Screen } from "@/src/components/ui/Screen";
import { SectionCard } from "@/src/components/ui/SectionCard";
import { useMenuData } from "@/src/hooks/useMenuData";
import { formatPrice, getDisplayImage, sizeCaption } from "@/src/lib/format";
import { groupProducts } from "@/src/lib/menu";
import { getCartTotal, useCartStore } from "@/src/store/cart-store";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export default function CartScreen() {
  const items = useCartStore((state) => state.items);
  const changeQuantity = useCartStore((state) => state.changeQuantity);
  const addProduct = useCartStore((state) => state.addProduct);
  const { menuQuery } = useMenuData();

  const totalPrice = useMemo(() => getCartTotal(items), [items]);
  const upsellProducts = useMemo(() => {
    const grouped = Array.from(groupProducts(menuQuery.data || []).values()).flat();
    const ids = new Set(items.map((item) => item.productSizeId));
    return grouped
      .filter((product) => !product.variants.some((variant) => ids.has(variant.id)))
      .slice(0, 4);
  }, [items, menuQuery.data]);

  if (!items.length) {
    return (
      <Screen>
        <PageHeader showBack subtitle="Добавьте позиции из меню" title="Корзина" />
        <EmptyState
          description="Как только выберете блюда, они появятся здесь вместе с итоговой суммой."
          icon="shopping-bag"
          title="Корзина пока пустая"
        />
        <MeatButton fullWidth onPress={() => router.replace("/")}>
          Вернуться в меню
        </MeatButton>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        showBack
        subtitle={`${items.length} ${items.length === 1 ? "позиция" : "позиции"} в заказе`}
        title="Корзина"
      />

      <ScrollView
        alwaysBounceVertical={false}
        bounces={false}
        contentContainerStyle={styles.stack}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
      >
        {items.map((item) => (
          <SectionCard key={item.productSizeId}>
            <View style={styles.itemRow}>
              <Image
                contentFit="cover"
                source={{ uri: getDisplayImage(item.imageUrl) }}
                style={styles.itemImage}
              />
              <View style={styles.itemContent}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemHeaderCopy}>
                    <Text style={styles.itemName}>{item.productName}</Text>
                    {sizeCaption(item.sizeLabel, item.sizeAmount, item.sizeUnit) ? (
                      <Text style={styles.itemMeta}>
                        {sizeCaption(item.sizeLabel, item.sizeAmount, item.sizeUnit)}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable onPress={() => changeQuantity(item.productSizeId, 0)} style={styles.removeButton}>
                    <Feather color={colors.muted} name="x" size={16} />
                  </Pressable>
                </View>

                <View style={styles.itemFooter}>
                  <QuantityStepper
                    quantity={item.quantity}
                    onDecrement={() => changeQuantity(item.productSizeId, item.quantity - 1)}
                    onIncrement={() => changeQuantity(item.productSizeId, item.quantity + 1)}
                  />
                  <Text style={styles.itemPrice}>{formatPrice(item.price * item.quantity)}</Text>
                </View>
              </View>
            </View>
          </SectionCard>
        ))}

        {upsellProducts.length > 0 ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>Можно добавить</Text>
            <View style={styles.upsellGrid}>
              {upsellProducts.map((product) => (
                <Pressable
                  key={product.id}
                  onPress={() => addProduct(product.variants[0])}
                  style={({ pressed }) => [styles.upsellCard, pressed ? styles.upsellCardPressed : null]}
                >
                  <Text numberOfLines={2} style={styles.upsellName}>
                    {product.name}
                  </Text>
                  <Text style={styles.upsellPrice}>{formatPrice(product.minPrice)}</Text>
                </Pressable>
              ))}
            </View>
          </SectionCard>
        ) : null}

        <SectionCard>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Итого</Text>
            <Text style={styles.summaryValue}>{formatPrice(totalPrice)}</Text>
          </View>
          <MeatButton fullWidth size="cta" onPress={() => router.push("/checkout")}>
            Продолжить
          </MeatButton>
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  itemRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  itemImage: {
    width: 84,
    height: 84,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
  },
  itemContent: {
    flex: 1,
    gap: spacing.md,
  },
  itemHeader: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  itemHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.medium,
  },
  itemMeta: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  removeButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  itemFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  itemPrice: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.medium,
  },
  upsellGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  upsellCard: {
    minWidth: "47%",
    flexGrow: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    gap: spacing.sm,
  },
  upsellCardPressed: {
    opacity: 0.92,
  },
  upsellName: {
    color: colors.text,
    fontSize: typography.bodySm,
    minHeight: 36,
    fontWeight: typography.medium,
  },
  upsellPrice: {
    color: colors.accent,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: typography.bodySm,
  },
  summaryValue: {
    color: colors.text,
    fontSize: typography.titleSm,
    fontWeight: typography.medium,
  },
});
