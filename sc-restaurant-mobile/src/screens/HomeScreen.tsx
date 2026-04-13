import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DeliveryMethod, ProductDisplay, UserAddress } from "@/src/api/types";
import { mobileApi } from "@/src/api/mobile-api";
import { CartBar } from "@/src/components/ui/CartBar";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { ProductCard } from "@/src/components/ui/ProductCard";
import { Screen } from "@/src/components/ui/Screen";
import { useMenuData } from "@/src/hooks/useMenuData";
import { buildMenuSections } from "@/src/lib/menu";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { getCartCount, getCartTotal, useCartStore } from "@/src/store/cart-store";
import { colors, motion, radii, shadows, spacing, typography } from "@/src/theme/tokens";

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
  const lastAddedAt = useCartStore((state) => state.lastAddedAt);
  const checkoutAddress = useCartStore((state) => state.checkoutDraft.address);
  const deliveryMethod = useCartStore((state) => state.checkoutDraft.deliveryMethod);
  const updateCheckoutDraft = useCartStore((state) => state.updateCheckoutDraft);
  const addProduct = useCartStore((state) => state.addProduct);
  const { pushToast } = useToast();
  const insets = useSafeAreaInsets();
  const { categoriesQuery, menuQuery } = useMenuData();
  const addressesQuery = useQuery({
    queryKey: ["addresses"],
    queryFn: mobileApi.getMyAddresses,
    enabled: Boolean(user),
  });
  const scrollRef = useRef<ScrollView>(null);
  const chipsRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});
  const chipOffsets = useRef<Record<string, { x: number; width: number }>>({});
  const chipsViewportWidth = useRef(0);
  const lastScrollY = useRef(0);
  const pendingCategoryJump = useRef<{ categoryId: string; y: number } | null>(null);
  const pendingCategoryJumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryIndicatorX = useRef(new Animated.Value(0)).current;
  const categoryIndicatorWidth = useRef(new Animated.Value(0)).current;
  const categoryIndicatorOpacity = useRef(new Animated.Value(0)).current;
  const categoryIndicatorReady = useRef(false);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(30)).current;

  const [activeCategory, setActiveCategory] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tempMethod, setTempMethod] = useState<DeliveryMethod>(deliveryMethod);
  const [tempAddress, setTempAddress] = useState("");

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
      setSelectedCategory("");
      return;
    }

    const hasCurrent = visibleSections.some((section) => section.categoryId === activeCategory);
    if (!activeCategory || !hasCurrent) {
      setActiveCategory(visibleSections[0].categoryId);
    }

    const hasSelected = visibleSections.some((section) => section.categoryId === selectedCategory);
    if (!selectedCategory || !hasSelected) {
      setSelectedCategory(visibleSections[0].categoryId);
    }
  }, [activeCategory, selectedCategory, visibleSections]);

  useEffect(
    () => () => {
      if (pendingCategoryJumpTimer.current) {
        clearTimeout(pendingCategoryJumpTimer.current);
      }
    },
    []
  );

  const cartCount = useMemo(() => getCartCount(cartItems), [cartItems]);
  const cartTotal = useMemo(() => getCartTotal(cartItems), [cartItems]);
  const defaultAddress = addressesQuery.data?.find((item) => item.is_default) || null;
  const currentDeliveryAddress = checkoutAddress.trim() || defaultAddress?.address || "";
  const selectedSavedAddress = useMemo(
    () => findAddressByValue(addressesQuery.data, currentDeliveryAddress),
    [addressesQuery.data, currentDeliveryAddress]
  );
  const addressTitle =
    deliveryMethod === "pickup"
      ? "В заведении"
      : selectedSavedAddress?.label?.trim() || (currentDeliveryAddress ? "Адрес доставки" : "Куда доставить");
  const addressCopy =
    deliveryMethod === "pickup"
      ? "Самовывоз"
      : selectedSavedAddress?.address || currentDeliveryAddress || "Выберите адрес и способ";

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

  const registerChipOffset =
    (categoryId: string) =>
    (event: LayoutChangeEvent) => {
      chipOffsets.current[categoryId] = {
        x: event.nativeEvent.layout.x,
        width: event.nativeEvent.layout.width,
      };

      if (categoryId === selectedCategory) {
        const chip = chipOffsets.current[categoryId];
        if (!chip) return;

        if (!categoryIndicatorReady.current) {
          categoryIndicatorX.setValue(chip.x);
          categoryIndicatorWidth.setValue(chip.width);
          categoryIndicatorOpacity.setValue(1);
          categoryIndicatorReady.current = true;
          return;
        }

        categoryIndicatorX.setValue(chip.x);
        categoryIndicatorWidth.setValue(chip.width);
      }
    };

  const setChipsViewportWidth = (event: LayoutChangeEvent) => {
    chipsViewportWidth.current = event.nativeEvent.layout.width;
  };

  const clearPendingCategoryJump = () => {
    pendingCategoryJump.current = null;
    if (pendingCategoryJumpTimer.current) {
      clearTimeout(pendingCategoryJumpTimer.current);
      pendingCategoryJumpTimer.current = null;
    }
  };

  const schedulePendingCategoryJumpClear = (attempt = 0) => {
    if (pendingCategoryJumpTimer.current) {
      clearTimeout(pendingCategoryJumpTimer.current);
    }

    pendingCategoryJumpTimer.current = setTimeout(() => {
      const pendingJump = pendingCategoryJump.current;
      if (!pendingJump) {
        pendingCategoryJumpTimer.current = null;
        return;
      }

      const reachedTarget = Math.abs(lastScrollY.current - pendingJump.y) <= 24;
      if (reachedTarget || attempt >= 6) {
        clearPendingCategoryJump();
        return;
      }

      schedulePendingCategoryJumpClear(attempt + 1);
    }, attempt === 0 ? 520 : 140);
  };

  const scrollCategoryIntoView = (categoryId: string, animated = false) => {
    const chip = chipOffsets.current[categoryId];
    const viewportWidth = chipsViewportWidth.current;
    if (!chip || !viewportWidth) return;

    const targetX = Math.max(chip.x + chip.width / 2 - viewportWidth / 2, 0);
    chipsRef.current?.scrollTo({ x: targetX, animated });
  };

  const moveCategoryIndicator = (categoryId: string, animated = true) => {
    const chip = chipOffsets.current[categoryId];
    if (!chip) return;

    if (!categoryIndicatorReady.current || !animated) {
      categoryIndicatorX.setValue(chip.x);
      categoryIndicatorWidth.setValue(chip.width);
      categoryIndicatorOpacity.setValue(1);
      categoryIndicatorReady.current = true;
      return;
    }

    Animated.parallel([
      Animated.timing(categoryIndicatorX, {
        toValue: chip.x,
        duration: motion.normal,
        useNativeDriver: false,
      }),
      Animated.timing(categoryIndicatorWidth, {
        toValue: chip.width,
        duration: motion.normal,
        useNativeDriver: false,
      }),
      Animated.timing(categoryIndicatorOpacity, {
        toValue: 1,
        duration: motion.fast,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const jumpToSection = (categoryId: string) => {
    const offset = sectionOffsets.current[categoryId];
    if (typeof offset !== "number") return;

    const targetY = Math.max(offset - spacing.sm, 0);
    pendingCategoryJump.current = { categoryId, y: targetY };
    schedulePendingCategoryJumpClear();

    setSelectedCategory(categoryId);
    scrollRef.current?.scrollTo({
      y: targetY,
      animated: true,
    });
    setActiveCategory(categoryId);
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset } = event.nativeEvent;
    lastScrollY.current = contentOffset.y;
    const y = contentOffset.y + spacing.sm;
    let nextCategory = visibleSections[0]?.categoryId || "";

    for (const section of visibleSections) {
      const offset = sectionOffsets.current[section.categoryId];
      if (typeof offset === "number" && y >= offset - 12) {
        nextCategory = section.categoryId;
      }
    }

    const pendingJump = pendingCategoryJump.current;
    if (pendingJump) {
      if (
        Math.abs(contentOffset.y - pendingJump.y) <= 24 ||
        nextCategory === pendingJump.categoryId
      ) {
        clearPendingCategoryJump();
      } else {
        if (selectedCategory !== pendingJump.categoryId) {
          setSelectedCategory(pendingJump.categoryId);
        }
        return;
      }
    }

    if (nextCategory && nextCategory !== activeCategory) {
      setActiveCategory(nextCategory);
    }

    if (nextCategory && nextCategory !== selectedCategory) {
      setSelectedCategory(nextCategory);
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

  useEffect(() => {
    if (!selectedCategory) return;
    moveCategoryIndicator(selectedCategory);
    scrollCategoryIntoView(selectedCategory, true);
  }, [selectedCategory]);

  const openPicker = () => {
    setTempMethod(deliveryMethod);
    setTempAddress(currentDeliveryAddress);
    setPickerOpen(true);
    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(30);

    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: motion.fast,
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: motion.normal,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const closePicker = (callback?: () => void) => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: motion.fast,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 30,
        duration: motion.normal,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setPickerOpen(false);
      callback?.();
    });
  };

  const handleSelectMethod = (nextMethod: DeliveryMethod) => {
    setTempMethod(nextMethod);
    if (nextMethod === "delivery" && !tempAddress && defaultAddress?.address) {
      setTempAddress(defaultAddress.address);
    }
  };

  const handleApplyPicker = () => {
    updateCheckoutDraft({
      deliveryMethod: tempMethod,
      address: tempMethod === "pickup" ? "" : tempAddress,
    });
    closePicker();
  };

  const openNewAddress = () =>
    closePicker(() =>
      router.push({
        pathname: "/address/new",
        params: { origin: "catalog" },
      })
    );

  const renderDeliverySheetBody = () => {
    if (tempMethod === "pickup") {
      return (
        <View style={styles.sheetBlock}>
          <Text style={styles.sheetSectionTitle}>Получение заказа</Text>
          <View style={styles.pickupCard}>
            <View style={styles.pickupIcon}>
              <Feather color={colors.accent} name="shopping-bag" size={18} />
            </View>
            <View style={styles.pickupCopy}>
              <Text style={styles.pickupTitle}>В заведении</Text>
              <Text style={styles.pickupText}>Заказ приготовим к самовывозу без адреса доставки.</Text>
            </View>
          </View>
        </View>
      );
    }

    const addresses = addressesQuery.data || [];
    const hasSavedAddress = addresses.length > 0;
    const hasCustomAddress =
      Boolean(tempAddress.trim()) && !findAddressByValue(addresses, tempAddress.trim());

    return (
      <View style={styles.sheetBlock}>
        <View style={styles.sheetSectionHead}>
          <Text style={styles.sheetSectionTitle}>Мои адреса</Text>
          {user ? (
            <Pressable onPress={openNewAddress} style={styles.inlineLinkButton}>
              <Feather color={colors.accent} name="plus" size={14} />
              <Text style={styles.inlineLinkText}>Новый адрес</Text>
            </Pressable>
          ) : null}
        </View>

        {addressesQuery.isLoading ? (
          <Text style={styles.sheetHint}>Загружаем сохранённые адреса.</Text>
        ) : hasSavedAddress ? (
          addresses.map((address) => {
            const active = isSameAddress(tempAddress, address.address);
            return (
              <Pressable
                key={address.id}
                onPress={() => setTempAddress(address.address)}
                style={[styles.addressOption, active ? styles.addressOptionActive : null]}
              >
                <View style={styles.addressBulletWrap}>
                  <View
                    style={[
                      styles.addressBullet,
                      active ? styles.addressBulletActive : null,
                    ]}
                  />
                </View>
                <View style={styles.addressOptionCopy}>
                  <View style={styles.addressOptionHead}>
                    <Text style={styles.addressOptionTitle}>{address.label || "Адрес"}</Text>
                    {address.is_default ? (
                      <Text style={styles.addressOptionBadge}>Основной</Text>
                    ) : null}
                  </View>
                  <Text style={styles.addressOptionText}>{address.address}</Text>
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    closePicker(() =>
                      router.push({
                        pathname: "/address/[id]",
                        params: { id: String(address.id), origin: "catalog" },
                      })
                    )
                  }
                  style={styles.editAddressButton}
                >
                  <Feather color={colors.muted} name="edit-2" size={15} />
                </Pressable>
              </Pressable>
            );
          })
        ) : hasCustomAddress ? (
          <View style={[styles.addressOption, styles.addressOptionActive]}>
            <View style={styles.addressBulletWrap}>
              <View style={[styles.addressBullet, styles.addressBulletActive]} />
            </View>
            <View style={styles.addressOptionCopy}>
              <Text style={styles.addressOptionTitle}>Текущий адрес</Text>
              <Text style={styles.addressOptionText}>{tempAddress.trim()}</Text>
            </View>
          </View>
        ) : user ? (
          <View style={styles.sheetEmptyCard}>
            <Text style={styles.sheetHint}>Сохранённых адресов пока нет. Добавьте первый адрес и используйте его в доставке.</Text>
            <MeatButton onPress={openNewAddress} variant="secondary">
              Добавить адрес
            </MeatButton>
          </View>
        ) : (
          <View style={styles.sheetEmptyCard}>
            <Text style={styles.sheetHint}>Для доставки можно войти и сохранить адреса в профиле. Пока можно продолжить и указать адрес позже на checkout.</Text>
            <MeatButton onPress={() => closePicker(() => router.push("/auth/sign-in"))} variant="secondary">
              Войти
            </MeatButton>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <Screen padded={false} scroll={false}>
        <View style={styles.screenBody}>
          <View style={styles.fixedHeaderShell}>
            <View style={styles.topContent}>
              <View style={styles.headerRow}>
                <Pressable
                  onPress={openPicker}
                  style={({ pressed }) => [
                    styles.locationButton,
                    pressed ? styles.locationButtonPressed : null,
                  ]}
                >
                  <View style={styles.locationIconWrap}>
                    <Feather
                      color={colors.accent}
                      name={deliveryMethod === "delivery" ? "navigation" : "shopping-bag"}
                      size={16}
                    />
                  </View>
                  <View style={styles.locationCopy}>
                    <Text numberOfLines={1} style={styles.locationTitle}>
                      {addressTitle}
                    </Text>
                    <Text numberOfLines={1} style={styles.locationMeta}>
                      {addressCopy}
                    </Text>
                  </View>
                  <Feather color={colors.text} name="chevron-down" size={18} />
                </Pressable>

                <Pressable
                  onPress={() => router.push("/profile")}
                  style={({ pressed }) => [styles.avatar, pressed ? styles.avatarPressed : null]}
                >
                  <Feather color={colors.text} name="user" size={22} />
                </Pressable>
              </View>
            </View>

            {visibleSections.length ? (
              <View style={styles.stickyCategories}>
                <ScrollView
                  ref={chipsRef}
                  alwaysBounceHorizontal={false}
                  bounces={false}
                  contentContainerStyle={styles.chipsContent}
                  horizontal
                  onLayout={setChipsViewportWidth}
                  overScrollMode="never"
                  showsHorizontalScrollIndicator={false}
                >
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.categoryChipIndicator,
                      {
                        opacity: categoryIndicatorOpacity,
                        transform: [{ translateX: categoryIndicatorX }],
                        width: categoryIndicatorWidth,
                      },
                    ]}
                  />
                  {visibleSections.map((section) => {
                    const active = section.categoryId === selectedCategory;
                    return (
                      <Pressable
                        key={section.key}
                        onLayout={registerChipOffset(section.categoryId)}
                        onPress={() => jumpToSection(section.categoryId)}
                        style={({ pressed }) => [
                          styles.categoryChip,
                          pressed ? styles.categoryChipPressed : null,
                        ]}
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
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.catalogScroll}
          contentContainerStyle={[
            styles.listContent,
            cartCount > 0 ? styles.listContentWithCart : null,
          ]}
          onScrollBeginDrag={() => {
            clearPendingCategoryJump();
          }}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
            removeClippedSubviews={false}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
          >
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
        </View>
      </Screen>

      {cartCount > 0 ? (
        <CartBar
          count={cartCount}
          total={cartTotal}
          pulseKey={lastAddedAt}
          onPress={() => router.push("/cart")}
        />
      ) : null}

      {pickerOpen ? (
        <View pointerEvents="box-none" style={styles.sheetRoot}>
          <Animated.View style={[styles.sheetBackdrop, { opacity: overlayOpacity }]}>
            <Pressable onPress={() => closePicker()} style={StyleSheet.absoluteFillObject} />
          </Animated.View>
          <Animated.View
            style={[
              styles.sheetWrap,
              {
                paddingBottom: Math.max(insets.bottom, spacing.lg),
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Pressable onPress={() => closePicker()} style={styles.sheetCloseButton}>
                <Feather color={colors.text} name="x" size={18} />
              </Pressable>
              <View style={styles.sheetMethodRow}>
                <Pressable
                  onPress={() => handleSelectMethod("delivery")}
                  style={[
                    styles.sheetMethodButton,
                    tempMethod === "delivery" ? styles.sheetMethodButtonActive : null,
                  ]}
                >
                  <Feather
                    color={tempMethod === "delivery" ? colors.surface : colors.text}
                    name="navigation"
                    size={15}
                  />
                  <Text
                    style={[
                      styles.sheetMethodLabel,
                      tempMethod === "delivery" ? styles.sheetMethodLabelActive : null,
                    ]}
                  >
                    Доставка
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleSelectMethod("pickup")}
                  style={[
                    styles.sheetMethodButton,
                    tempMethod === "pickup" ? styles.sheetMethodButtonActive : null,
                  ]}
                >
                  <Feather
                    color={tempMethod === "pickup" ? colors.surface : colors.text}
                    name="shopping-bag"
                    size={15}
                  />
                  <Text
                    style={[
                      styles.sheetMethodLabel,
                      tempMethod === "pickup" ? styles.sheetMethodLabelActive : null,
                    ]}
                  >
                    В пиццерии
                  </Text>
                </Pressable>
              </View>
            </View>

            <ScrollView
              alwaysBounceVertical={false}
              bounces={false}
              contentContainerStyle={styles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              overScrollMode="never"
              showsVerticalScrollIndicator={false}
            >
              {renderDeliverySheetBody()}
            </ScrollView>

            <View style={styles.sheetFooter}>
              <MeatButton fullWidth onPress={handleApplyPicker} size="cta">
                {tempMethod === "pickup" ? "Заберу сам" : tempAddress.trim() ? "Доставить сюда" : "Продолжить"}
              </MeatButton>
            </View>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

function normalizeAddressValue(value: string) {
  return value.trim().toLocaleLowerCase();
}

function isSameAddress(left: string, right: string) {
  return Boolean(left.trim()) && normalizeAddressValue(left) === normalizeAddressValue(right);
}

function findAddressByValue(addresses: UserAddress[] | undefined, value: string) {
  if (!addresses?.length || !value.trim()) return null;
  return addresses.find((address) => isSameAddress(address.address, value)) || null;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screenBody: {
    flex: 1,
  },
  fixedHeaderShell: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
  },
  catalogScroll: {
    flex: 1,
  },
  sheetRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
  },
  sheetWrap: {
    minHeight: "54%",
    maxHeight: "84%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
    overflow: "hidden",
    ...shadows.card,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: "rgba(148, 163, 184, 0.34)",
    marginTop: spacing.sm,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  sheetCloseButton: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sheetMethodRow: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 4,
    flexDirection: "row",
    gap: spacing.xs,
  },
  sheetMethodButton: {
    flex: 1,
    borderRadius: radii.xl,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  sheetMethodButtonActive: {
    backgroundColor: colors.accent,
  },
  sheetMethodLabel: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  sheetMethodLabelActive: {
    color: colors.surface,
  },
  sheetScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  sheetBlock: {
    gap: spacing.md,
  },
  sheetSectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sheetSectionTitle: {
    color: colors.text,
    fontSize: typography.titleSm,
    fontWeight: typography.semibold,
  },
  sheetHint: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 20,
  },
  inlineLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  inlineLinkText: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  pickupCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  pickupIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pickupCopy: {
    flex: 1,
    gap: 4,
  },
  pickupTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.medium,
  },
  pickupText: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 20,
  },
  sheetEmptyCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
  },
  stickyCategories: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.xs,
    backgroundColor: colors.bg,
  },
  chipsContent: {
    position: "relative",
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  categoryChipIndicator: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: radii.lg,
    backgroundColor: colors.accentSoft,
  },
  categoryChip: {
    minHeight: 36,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: "transparent",
    justifyContent: "center",
    zIndex: 1,
  },
  categoryChipPressed: {
    opacity: 0.86,
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
    gap: spacing.sm,
  },
  listContentWithCart: {
    paddingBottom: 116,
  },
  topContent: {
    backgroundColor: colors.bg,
    paddingBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  locationButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  locationButtonPressed: {
    opacity: 0.9,
  },
  locationIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  locationCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  locationTitle: {
    color: colors.text,
    fontSize: typography.bodySm,
    lineHeight: 18,
    fontWeight: typography.medium,
  },
  locationMeta: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
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
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBadgeText: {
    color: colors.surface,
    fontSize: 11,
    fontWeight: typography.medium,
  },
  addressOption: {
    borderRadius: radii.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  addressOptionActive: {
    backgroundColor: colors.accentSoft,
  },
  addressBulletWrap: {
    paddingTop: 6,
  },
  addressBullet: {
    width: 12,
    height: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  addressBulletActive: {
    backgroundColor: colors.accent,
  },
  addressOptionCopy: {
    flex: 1,
    gap: 4,
  },
  addressOptionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  addressOptionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.medium,
  },
  addressOptionBadge: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: typography.medium,
  },
  addressOptionText: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 20,
  },
  editAddressButton: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sheetFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.titleSm,
    fontWeight: typography.medium,
  },
  gridRow: {
    flexDirection: "row",
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  gridSpacer: {
    flex: 1,
  },
});

