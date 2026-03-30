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
import { SurfacePanel } from "@/src/components/ui/SurfacePanel";
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
        <PageHeader showBack subtitle="Добавьте пару позиций из меню" title="Корзина" />
        <EmptyState
          description="Когда выберете блюда из меню, они появятся здесь вместе с суммой заказа."
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
    <Screen padded={false} scroll={false}>
      <View style={styles.root}>
        <View style={styles.headerWrap}>
          <PageHeader
            showBack
            subtitle={`${items.length} ${items.length === 1 ? "позиция" : "позиции"} в заказе`}
            title="Корзина"
          />
        </View>

        <ScrollView
          alwaysBounceVertical={false}
          bounces={false}
          contentContainerStyle={styles.content}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionWrap}>
            <SurfacePanel compact style={styles.listPanel}>
              {items.map((item, index) => (
                <View key={item.productSizeId} style={[styles.cartRow, index > 0 ? styles.cartRowBorder : null]}>
                  <Image
                    contentFit="cover"
                    source={{ uri: getDisplayImage(item.imageUrl) }}
                    style={styles.itemImage}
                  />
                  <View style={styles.itemCopy}>
                    <View style={styles.itemHead}>
                      <View style={styles.itemTitleWrap}>
                        <Text style={styles.itemTitle}>{item.productName}</Text>
                        {sizeCaption(item.sizeLabel, item.sizeAmount, item.sizeUnit) ? (
                          <Text style={styles.itemMeta}>
                            {sizeCaption(item.sizeLabel, item.sizeAmount, item.sizeUnit)}
                          </Text>
                        ) : null}
                      </View>
                      <Pressable onPress={() => changeQuantity(item.productSizeId, 0)} style={styles.removeButton}>
                        <Feather color={colors.muted} name="x" size={15} />
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
              ))}
            </SurfacePanel>
          </View>

          {upsellProducts.length ? (
            <View style={styles.sectionWrap}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Можно добавить</Text>
              </View>
              <View style={styles.upsellGrid}>
                {upsellProducts.map((product) => (
                  <Pressable
                    key={product.id}
                    onPress={() => addProduct(product.variants[0])}
                    style={({ pressed }) => [
                      styles.upsellCard,
                      pressed ? styles.upsellCardPressed : null,
                    ]}
                  >
                    <Text numberOfLines={2} style={styles.upsellName}>
                      {product.name}
                    </Text>
                    <View style={styles.upsellFoot}>
                      <Text style={styles.upsellPrice}>{formatPrice(product.minPrice)}</Text>
                      <View style={styles.upsellPlus}>
                        <Feather color={colors.text} name="plus" size={14} />
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.sectionWrap}>
            <SurfacePanel tone="tint" style={styles.summaryPanel}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Позиций</Text>
                <Text style={styles.summaryValue}>{items.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Итого</Text>
                <Text style={styles.summaryAmount}>{formatPrice(totalPrice)}</Text>
              </View>
              <MeatButton fullWidth onPress={() => router.push("/checkout")} size="cta">
                Оформить заказ
              </MeatButton>
            </SurfacePanel>
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerWrap: {
    paddingHorizontal: spacing.lg,
  },
  content: {
    paddingBottom: spacing.xxxl,
  },
  sectionWrap: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  sectionHead: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  listPanel: {
    gap: 0,
  },
  cartRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  cartRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  itemImage: {
    width: 76,
    height: 76,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceTint,
  },
  itemCopy: {
    flex: 1,
    gap: spacing.md,
  },
  itemHead: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  itemTitleWrap: {
    flex: 1,
    gap: 3,
  },
  itemTitle: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  itemMeta: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  removeButton: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceTint,
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
    fontSize: typography.body,
    fontWeight: typography.semibold,
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
    backgroundColor: colors.surfaceStrong,
    padding: spacing.md,
    gap: spacing.md,
  },
  upsellCardPressed: {
    opacity: 0.92,
  },
  upsellName: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
    minHeight: 34,
  },
  upsellFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  upsellPrice: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  upsellPlus: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceTint,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryPanel: {
    gap: spacing.md,
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
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  summaryAmount: {
    color: colors.text,
    fontSize: typography.titleSm,
    fontWeight: typography.semibold,
  },
});
