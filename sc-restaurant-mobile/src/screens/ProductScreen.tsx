import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MenuItem } from "@/src/api/types";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { useMenuData } from "@/src/hooks/useMenuData";
import { formatPrice, getDisplayImage, sizeCaption } from "@/src/lib/format";
import { findProduct } from "@/src/lib/menu";
import { useToast } from "@/src/providers/ToastProvider";
import { useCartStore } from "@/src/store/cart-store";
import { colors, motion, radii, spacing, typography } from "@/src/theme/tokens";

function buildVariantLabel(variant: MenuItem, index: number) {
  return variant.size_name?.trim() || variant.size_label?.trim() || `Вариант ${index + 1}`;
}

function SizeSlider({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange(value: string): void;
}) {
  const thumbX = useRef(new Animated.Value(0)).current;
  const thumbWidth = useRef(new Animated.Value(0)).current;
  const thumbOpacity = useRef(new Animated.Value(0)).current;
  const measurements = useRef<Record<string, { x: number; width: number }>>({});
  const ready = useRef(false);

  const moveThumb = (nextValue: string, animated = true) => {
    const next = measurements.current[nextValue];
    if (!next) return;

    if (!ready.current || !animated) {
      thumbX.setValue(next.x);
      thumbWidth.setValue(next.width);
      thumbOpacity.setValue(1);
      ready.current = true;
      return;
    }

    Animated.parallel([
      Animated.timing(thumbX, {
        toValue: next.x,
        duration: motion.normal,
        useNativeDriver: false,
      }),
      Animated.timing(thumbWidth, {
        toValue: next.width,
        duration: motion.normal,
        useNativeDriver: false,
      }),
      Animated.timing(thumbOpacity, {
        toValue: 1,
        duration: motion.fast,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const handleLayout =
    (optionValue: string) =>
    (event: LayoutChangeEvent) => {
      measurements.current[optionValue] = {
        x: event.nativeEvent.layout.x,
        width: event.nativeEvent.layout.width,
      };

      if (optionValue === value) {
        moveThumb(optionValue, false);
      }
    };

  useEffect(() => {
    moveThumb(value);
  }, [value]);

  return (
    <View style={styles.sizeSlider}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.sizeSliderThumb,
          {
            opacity: thumbOpacity,
            transform: [{ translateX: thumbX }],
            width: thumbWidth,
          },
        ]}
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onLayout={handleLayout(option.value)}
            onPress={() => onChange(option.value)}
            style={styles.sizeSliderOption}
          >
            <Text style={[styles.sizeSliderLabel, active ? styles.sizeSliderLabelActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { menuQuery } = useMenuData();
  const addProduct = useCartStore((state) => state.addProduct);
  const { pushToast } = useToast();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(44)).current;
  const closingRef = useRef(false);
  const nutritionInfoAnchorRef = useRef<View>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [nutritionPopoverFrame, setNutritionPopoverFrame] = useState<{ left: number; top: number }>({
    left: spacing.lg,
    top: spacing.xl,
  });

  const product = useMemo(
    () => findProduct(menuQuery.data || [], Number(id)),
    [id, menuQuery.data]
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: motion.normal,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: motion.slow,
        useNativeDriver: true,
      }),
    ]).start();
  }, [overlayOpacity, sheetTranslateY]);

  useEffect(() => {
    if (!product?.variants.length) return;
    if (product.variants.some((variant) => variant.id === selectedVariantId)) return;
    setSelectedVariantId(product.variants[0].id);
  }, [product, selectedVariantId]);

  useEffect(() => {
    setNutritionOpen(false);
  }, [selectedVariantId]);

  useEffect(() => {
    setNutritionOpen(false);
  }, [windowHeight, windowWidth]);

  const selectedVariant =
    product?.variants.find((variant) => variant.id === selectedVariantId) || product?.variants[0];
  const selectedVariantWeight = sizeCaption(
    undefined,
    selectedVariant?.size_amount,
    selectedVariant?.size_unit
  );
  const nutritionItems = useMemo(
    () =>
      selectedVariant
        ? [
            { label: "Ккал", value: selectedVariant.calories },
            { label: "Белки", value: selectedVariant.protein },
            { label: "Жиры", value: selectedVariant.fat },
            { label: "Углеводы", value: selectedVariant.carbs },
          ].filter((item) => item.value !== null && item.value !== undefined)
        : [],
    [selectedVariant]
  );
  const hasVariantPicker = (product?.variants.length || 0) > 1;

  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setNutritionOpen(false);

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

  const toggleNutritionPopover = () => {
    if (nutritionOpen) {
      setNutritionOpen(false);
      return;
    }

    const popoverWidth = Math.min(280, windowWidth - spacing.lg * 2);
    const estimatedPopoverHeight = 48 + nutritionItems.length * 28 + spacing.sm * Math.max(nutritionItems.length - 1, 0);

    nutritionInfoAnchorRef.current?.measureInWindow((x, y, width, height) => {
      const preferredLeft = x + width / 2 - popoverWidth / 2;
      const left = Math.min(
        Math.max(preferredLeft, spacing.lg),
        Math.max(spacing.lg, windowWidth - popoverWidth - spacing.lg)
      );

      const topSpace = y - spacing.md;
      const bottomSpace = windowHeight - (y + height) - spacing.md;
      const openAbove = topSpace >= estimatedPopoverHeight || topSpace >= bottomSpace;
      const preferredTop = openAbove ? y - estimatedPopoverHeight - spacing.xs : y + height + spacing.sm;
      const maxTop = windowHeight - estimatedPopoverHeight - spacing.lg;
      const top = Math.min(Math.max(preferredTop, spacing.xl), Math.max(spacing.xl, maxTop));

      setNutritionPopoverFrame({ left, top });
      setNutritionOpen(true);
    });
  };

  const renderBody = () => {
    if (menuQuery.isLoading) {
      return (
        <View style={styles.emptyWrap}>
          <EmptyState description="Собираем карточку товара." icon="loader" title="Загружаем" />
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
          alwaysBounceVertical={false}
          bounces={false}
          contentContainerStyle={[
            styles.sheetScrollContent,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg) + 76,
            },
          ]}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sheetTop}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View style={styles.titleBlock}>
                <Text style={styles.productName}>{product.name}</Text>
                {selectedVariantWeight ? (
                  <Text style={styles.portionCopy}>{selectedVariantWeight}</Text>
                ) : null}
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
              <Text style={styles.blockTitle}>Выбор размера</Text>
              <SizeSlider
                options={product.variants.map((variant, index) => ({
                  label: buildVariantLabel(variant, index),
                  value: String(variant.id),
                }))}
                value={String(selectedVariant.id)}
                onChange={(value) => setSelectedVariantId(Number(value))}
              />
            </View>
          ) : null}

          {nutritionItems.length ? (
            <View
              style={[
                styles.nutritionSection,
                !hasVariantPicker ? styles.nutritionSectionSingle : null,
              ]}
            >
              <View style={styles.nutritionHeader}>
                <Text style={styles.nutritionTitle}>Энергетическая ценность</Text>
                <View collapsable={false} ref={nutritionInfoAnchorRef}>
                  <Pressable
                    accessibilityHint="Открывает подробности о КБЖУ"
                    accessibilityLabel="Подробности о пищевой ценности"
                    accessibilityRole="button"
                    accessibilityState={{ expanded: nutritionOpen }}
                    onPress={toggleNutritionPopover}
                    style={styles.nutritionInfoButton}
                  >
                    <Feather color={colors.muted} name="info" size={14} />
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
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
      <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
        {renderBody()}
      </Animated.View>
      <Modal animationType="fade" onRequestClose={() => setNutritionOpen(false)} transparent visible={nutritionOpen}>
        <View style={styles.nutritionModalRoot}>
          <Pressable onPress={() => setNutritionOpen(false)} style={StyleSheet.absoluteFillObject} />
          <View
            style={[
              styles.nutritionPopover,
              {
                left: nutritionPopoverFrame.left,
                top: nutritionPopoverFrame.top,
                width: Math.min(280, windowWidth - spacing.lg * 2),
              },
            ]}
          >
            <Text style={styles.nutritionPopoverCaption}>На выбранную порцию</Text>
            {nutritionItems.map((item) => (
              <View key={item.label} style={styles.nutritionPopoverRow}>
                <Text style={styles.nutritionPopoverName}>{item.label}</Text>
                <Text style={styles.nutritionPopoverValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </Modal>
    </View>
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
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  sheetTop: {
    gap: spacing.md,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: "rgba(148, 163, 184, 0.34)",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  productName: {
    color: colors.text,
    fontSize: typography.titleSm,
    fontWeight: typography.medium,
  },
  portionCopy: {
    color: colors.muted,
    fontSize: typography.bodySm,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  imageWrap: {
    height: 280,
    borderRadius: radii.lg,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "98%",
    height: "98%",
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
  sizeSlider: {
    position: "relative",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 2,
    padding: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  sizeSliderThumb: {
    position: "absolute",
    top: 3,
    bottom: 3,
    left: 0,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sizeSliderOption: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    zIndex: 1,
  },
  sizeSliderLabel: {
    color: colors.muted,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  sizeSliderLabelActive: {
    color: colors.text,
  },
  nutritionSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    alignItems: "center",
  },
  nutritionSectionSingle: {
    marginTop: "auto",
  },
  nutritionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  nutritionTitle: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.medium,
    textAlign: "center",
  },
  nutritionInfoButton: {
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  nutritionModalRoot: {
    flex: 1,
  },
  nutritionPopover: {
    position: "absolute",
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  nutritionPopoverCaption: {
    color: colors.muted,
    fontSize: typography.caption,
    textAlign: "center",
  },
  nutritionPopoverRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  nutritionPopoverName: {
    color: colors.muted,
    fontSize: typography.bodySm,
  },
  nutritionPopoverValue: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  emptyWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
});
