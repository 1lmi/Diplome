import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import type { ProductDisplay } from "@/src/api/types";
import { mobileApi } from "@/src/api/mobile-api";
import { CartBar } from "@/src/components/ui/CartBar";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { ProductCard } from "@/src/components/ui/ProductCard";
import { Screen } from "@/src/components/ui/Screen";
import { useMenuData } from "@/src/hooks/useMenuData";
import { buildMenuSections } from "@/src/lib/menu";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { getCartCount, getCartTotal, useCartStore } from "@/src/store/cart-store";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

interface MenuSection {
  key: string;
  categoryId: string;
  title: string;
  products: ProductDisplay[];
}

function chunkProducts(products: ProductDisplay[], chunkSize = 2) {
  const rows: ProductDisplay[][] = [];

  for (let index = 0; index < products.length; index += chunkSize) {
    rows.push(products.slice(index, index + chunkSize));
  }

  return rows;
}

export default function HomeScreen() {
  const user = useAuthStore((state) => state.user);
  const cartItems = useCartStore((state) => state.items);
  const deliveryMethod = useCartStore((state) => state.checkoutDraft.deliveryMethod);
  const updateCheckoutDraft = useCartStore((state) => state.updateCheckoutDraft);
  const addProduct = useCartStore((state) => state.addProduct);
  const { pushToast } = useToast();
  const { categoriesQuery, menuQuery } = useMenuData();
  const addressesQuery = useQuery({
    queryKey: ["addresses"],
    queryFn: mobileApi.getMyAddresses,
    enabled: Boolean(user),
  });
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});

  const [activeCategory, setActiveCategory] = useState<string>("");

  const visibleSections = useMemo(
    () =>
      buildMenuSections(categoriesQuery.data || [], menuQuery.data || []).map((section) => ({
        key: `category-${section.category.id}`,
        categoryId: String(section.category.id),
        title: section.category.name,
        products: section.products,
      })),
    [categoriesQuery.data, menuQuery.data]
  );

  useEffect(() => {
    if (!visibleSections.length) {
      setActiveCategory("");
      return;
    }

    const hasCurrent = visibleSections.some((section) => section.categoryId === activeCategory);
    if (!activeCategory || !hasCurrent) {
      setActiveCategory(visibleSections[0].categoryId);
    }
  }, [activeCategory, visibleSections]);

  const cartCount = useMemo(() => getCartCount(cartItems), [cartItems]);
  const cartTotal = useMemo(() => getCartTotal(cartItems), [cartItems]);
  const defaultAddress = addressesQuery.data?.find((item) => item.is_default) || null;
  const addressTitle =
    deliveryMethod === "delivery"
      ? defaultAddress?.address || "Укажите адрес доставки"
      : "Самовывоз из Meat Point";
  const addressCopy = deliveryMethod === "delivery" ? "Доставка" : "Самовывоз";

  const menuLoadError =
    categoriesQuery.error instanceof Error
      ? categoriesQuery.error.message
      : menuQuery.error instanceof Error
        ? menuQuery.error.message
        : null;

  const registerSectionOffset =
    (categoryId: string) =>
    (event: LayoutChangeEvent) => {
      sectionOffsets.current[categoryId] = event.nativeEvent.layout.y;
    };

  const jumpToSection = (categoryId: string) => {
    const offset = sectionOffsets.current[categoryId];
    if (typeof offset !== "number") return;

    scrollRef.current?.scrollTo({ y: Math.max(offset - 8, 0), animated: true });
    setActiveCategory(categoryId);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y + 12;
    let nextCategory = visibleSections[0]?.categoryId || "";

    for (const section of visibleSections) {
      const offset = sectionOffsets.current[section.categoryId];
      if (typeof offset === "number" && y >= offset - 12) {
        nextCategory = section.categoryId;
      }
    }

    if (nextCategory && nextCategory !== activeCategory) {
      setActiveCategory(nextCategory);
    }
  };

  const handleQuickAdd = async (product: ProductDisplay) => {
    if (!product.variants.length) return;

    if (product.variants.length > 1) {
      router.push({
        pathname: "/product/[id]",
        params: { id: String(product.id) },
      });
      return;
    }

    addProduct(product.variants[0]);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pushToast({
      tone: "success",
      title: "Добавили в корзину",
      description: `${product.name} теперь в заказе.`,
    });
  };

  return (
    <View style={styles.root}>
      <Screen padded={false} scroll={false}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.listContent,
            cartCount > 0 ? styles.listContentWithCart : null,
          ]}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={visibleSections.length ? [1] : undefined}
        >
          <View style={styles.topContent}>
            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text numberOfLines={1} style={styles.headerTitle}>
                  {addressTitle}
                </Text>
                <Text style={styles.headerMeta}>{addressCopy}</Text>
              </View>

              <Pressable
                onPress={() => router.push("/profile")}
                style={({ pressed }) => [styles.avatar, pressed ? styles.avatarPressed : null]}
              >
                <Feather color={colors.text} name="user" size={22} />
                {cartCount > 0 ? (
                  <View style={styles.avatarBadge}>
                    <Text style={styles.avatarBadgeText}>{cartCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>

            <View style={styles.modeTrack}>
              <ModeSegment
                active={deliveryMethod === "delivery"}
                label="Доставка"
                onPress={() => updateCheckoutDraft({ deliveryMethod: "delivery" })}
              />
              <ModeSegment
                active={deliveryMethod === "pickup"}
                label="Самовывоз"
                onPress={() => updateCheckoutDraft({ deliveryMethod: "pickup" })}
              />
            </View>
          </View>

          {visibleSections.length ? (
            <View style={styles.stickyCategories}>
              <ScrollView
                contentContainerStyle={styles.chipsContent}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {visibleSections.map((section) => {
                  const active = section.categoryId === activeCategory;
                  return (
                    <Pressable
                      key={section.key}
                      onPress={() => jumpToSection(section.categoryId)}
                      style={[styles.categoryChip, active ? styles.categoryChipActive : null]}
                    >
                      <Text
                        style={[
                          styles.categoryChipLabel,
                          active ? styles.categoryChipLabelActive : null,
                        ]}
                      >
                        {section.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {categoriesQuery.isLoading || menuQuery.isLoading ? (
            <EmptyState
              description="Подгружаем категории и позиции меню."
              icon="loader"
              title="Обновляем меню"
            />
          ) : menuLoadError ? (
            <EmptyState
              description={menuLoadError}
              icon="wifi-off"
              title="Меню пока недоступно"
            />
          ) : visibleSections.length ? (
            visibleSections.map((section) => (
              <View
                key={section.key}
                onLayout={registerSectionOffset(section.categoryId)}
                style={styles.section}
              >
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                </View>
                {chunkProducts(section.products).map((row, rowIndex) => (
                  <View key={`${section.key}-row-${rowIndex}`} style={styles.gridRow}>
                    {row.map((product) => (
                      <ProductCard
                        key={product.key}
                        onAdd={() => handleQuickAdd(product)}
                        onPress={() =>
                          router.push({
                            pathname: "/product/[id]",
                            params: { id: String(product.id) },
                          })
                        }
                        product={product}
                      />
                    ))}
                    {row.length === 1 ? <View style={styles.gridSpacer} /> : null}
                  </View>
                ))}
              </View>
            ))
          ) : (
            <EmptyState
              description="Позиции пока недоступны. Попробуйте обновить меню позже."
              icon="search"
              title="Меню пустое"
            />
          )}
        </ScrollView>
      </Screen>

      {cartCount > 0 ? (
        <CartBar count={cartCount} total={cartTotal} onPress={() => router.push("/cart")} />
      ) : null}
    </View>
  );
}

function ModeSegment({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.modeSegment, active ? styles.modeSegmentActive : null]}>
      <Text style={[styles.modeSegmentLabel, active ? styles.modeSegmentLabelActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  stickyCategories: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
  },
  chipsContent: {
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  categoryChip: {
    minHeight: 36,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceMuted,
    justifyContent: "center",
  },
  categoryChipActive: {
    backgroundColor: colors.accentSoft,
  },
  categoryChipLabel: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: typography.medium,
  },
  categoryChipLabelActive: {
    color: colors.accent,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.xl,
  },
  listContentWithCart: {
    paddingBottom: 116,
  },
  topContent: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
    paddingTop: spacing.xs,
  },
  headerTitle: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 20,
    fontWeight: typography.medium,
  },
  headerMeta: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  avatarPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  avatarBadge: {
    position: "absolute",
    bottom: -2,
    minWidth: 22,
    height: 22,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBadgeText: {
    color: colors.surface,
    fontSize: typography.caption,
    fontWeight: typography.medium,
  },
  modeTrack: {
    minHeight: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: 4,
    flexDirection: "row",
    gap: spacing.xs,
  },
  modeSegment: {
    flex: 1,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  modeSegmentActive: {
    backgroundColor: colors.accent,
  },
  modeSegmentLabel: {
    color: colors.muted,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  modeSegmentLabelActive: {
    color: colors.surface,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.titleSm,
    fontWeight: typography.medium,
  },
  gridRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  gridSpacer: {
    flex: 1,
  },
});
