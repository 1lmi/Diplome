import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/src/components/ui/EmptyState";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { SegmentedControl } from "@/src/components/ui/SegmentedControl";
import { useMenuData } from "@/src/hooks/useMenuData";
import { formatPrice, getDisplayImage } from "@/src/lib/format";
import { findProduct } from "@/src/lib/menu";
import { useToast } from "@/src/providers/ToastProvider";
import { useCartStore } from "@/src/store/cart-store";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { menuQuery, categoriesQuery } = useMenuData();
  const addProduct = useCartStore((state) => state.addProduct);
  const { pushToast } = useToast();
  const insets = useSafeAreaInsets();
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(44)).current;
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const closingRef = useRef(false);

  const product = useMemo(
    () => findProduct(menuQuery.data || [], Number(id)),
    [id, menuQuery.data]
  );
  const categoryName = useMemo(
    () =>
      categoriesQuery.data?.find((item) => item.id === product?.category_id)?.name || "Позиция",
    [categoriesQuery.data, product?.category_id]
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [overlayOpacity, sheetTranslateY]);

  useEffect(() => {
    if (!product?.variants.length) return;
    if (product.variants.some((variant) => variant.id === selectedVariantId)) return;
    setSelectedVariantId(product.variants[0].id);
  }, [product, selectedVariantId]);

  const selectedVariant =
    product?.variants.find((variant) => variant.id === selectedVariantId) || product?.variants[0];

  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 40,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/");
      }
    });
  };

  const handleAdd = async () => {
    if (!selectedVariant || !product) return;

    addProduct(selectedVariant);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pushToast({
      tone: "success",
      title: "Добавили в корзину",
      description: `${product.name} теперь в заказе.`,
    });
    handleClose();
  };

  const renderBody = () => {
    if (menuQuery.isLoading) {
      return (
        <View style={styles.emptyWrap}>
          <EmptyState
            description="Собираем карточку товара."
            icon="loader"
            title="Загружаем"
          />
        </View>
      );
    }

    if (!product || !selectedVariant) {
      return (
        <View style={styles.emptyWrap}>
          <EmptyState
            description="Товар был скрыт или временно недоступен."
            icon="alert-circle"
            title="Не удалось открыть товар"
          />
        </View>
      );
    }

    return (
      <>
        <ScrollView
          contentContainerStyle={[
            styles.sheetScrollContent,
            { paddingBottom: Math.max(insets.bottom, spacing.lg) + 84 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sheetTop}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderCopy}>
                <Text style={styles.categoryName}>{categoryName}</Text>
                <Text style={styles.productName}>{product.name}</Text>
              </View>
              <Pressable onPress={handleClose} style={styles.closeButton}>
                <Feather color={colors.text} name="x" size={18} />
              </Pressable>
            </View>
          </View>

          <View style={styles.imageWrap}>
            <Image
              contentFit="contain"
              source={{ uri: getDisplayImage(product.image_url) }}
              style={styles.image}
            />
          </View>

          {product.description ? <Text style={styles.description}>{product.description}</Text> : null}

          {product.variants.length > 1 ? (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Размер</Text>
              <SegmentedControl
                options={product.variants.map((variant) => ({
                  label:
                    variant.size_label ||
                    variant.size_name ||
                    `${variant.size_amount || ""}${variant.size_unit ? ` ${variant.size_unit}` : ""}`.trim() ||
                    `${variant.price} ₽`,
                  value: String(variant.id),
                }))}
                value={String(selectedVariant.id)}
                onChange={(value) => setSelectedVariantId(Number(value))}
                scrollable
              />
            </View>
          ) : null}

          <View style={styles.block}>
            <View style={styles.infoRow}>
              <Text style={styles.blockTitle}>КБЖУ</Text>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "КБЖУ",
                    "Калории, белки, жиры и углеводы показаны для выбранного варианта и нужны только как справочная информация."
                  )
                }
                style={styles.infoButton}
              >
                <Feather color={colors.muted} name="info" size={14} />
              </Pressable>
            </View>
            <View style={styles.nutritionInline}>
              <NutritionText label="Ккал" value={selectedVariant.calories} />
              <NutritionText label="Б" value={selectedVariant.protein} />
              <NutritionText label="Ж" value={selectedVariant.fat} />
              <NutritionText label="У" value={selectedVariant.carbs} />
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <MeatButton fullWidth onPress={handleAdd} size="cta">
            {`Добавить за ${formatPrice(selectedVariant.price)}`}
          </MeatButton>
        </View>
      </>
    );
  };

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.backdrop, { opacity: overlayOpacity }]}>
        <Pressable onPress={handleClose} style={StyleSheet.absoluteFillObject} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [{ translateY: sheetTranslateY }],
          },
        ]}
      >
        {renderBody()}
      </Animated.View>
    </View>
  );
}

function NutritionText({ label, value }: { label: string; value?: number | null }) {
  return (
    <Text style={styles.nutritionText}>
      <Text style={styles.nutritionLabel}>{label}</Text>
      {` ${value ?? "—"}`}
    </Text>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
  },
  sheet: {
    minHeight: "72%",
    maxHeight: "88%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  sheetScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  sheetTop: {
    gap: spacing.md,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: "rgba(111, 99, 88, 0.24)",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sheetHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  categoryName: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  productName: {
    color: colors.text,
    fontSize: typography.titleSm,
    fontWeight: typography.medium,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  imageWrap: {
    height: 230,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "88%",
    height: "88%",
  },
  description: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 20,
  },
  block: {
    gap: spacing.sm,
  },
  blockTitle: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  infoButton: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  nutritionInline: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  nutritionText: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  nutritionLabel: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: typography.medium,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: "rgba(234, 223, 211, 0.58)",
  },
  emptyWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
});
