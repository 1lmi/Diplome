import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mobileApi } from "@/src/api/mobile-api";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { Screen } from "@/src/components/ui/Screen";
import { formatPrice, normalizePhone } from "@/src/lib/format";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { getCartTotal, useCartStore } from "@/src/store/cart-store";
import { useTrackingStore } from "@/src/store/tracking-store";
import { colors, radii, shadows, spacing, typography } from "@/src/theme/tokens";

const ASAP_LABEL = "Как можно быстрее";

type TimeOption = {
  value: string;
  label: string;
  startMinutes: number;
};

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function floorToQuarter(date: Date) {
  const quarter = 15 * 60 * 1000;
  return new Date(Math.floor(date.getTime() / quarter) * quarter);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildDailyTimeOptions(baseDate = new Date()): TimeOption[] {
  const slots: TimeOption[] = [];

  for (let hour = 9; hour < 22; hour += 1) {
    for (let minutes = 0; minutes < 60; minutes += 15) {
      const start = new Date(baseDate);
      start.setHours(hour, minutes, 0, 0);
      const end = addMinutes(start, 15);
      if (end.getHours() > 22 || (end.getHours() === 22 && end.getMinutes() > 0)) {
        continue;
      }

      const startMinutes = hour * 60 + minutes;
      const label = `${formatTime(start)}–${formatTime(end)}`;
      slots.push({
        value: label,
        label,
        startMinutes,
      });
    }
  }

  return slots;
}

function buildQuickTimeOptions(allOptions: TimeOption[], baseDate = new Date()): TimeOption[] {
  const threshold = addMinutes(baseDate, 45);
  const thresholdRounded = floorToQuarter(threshold);
  const thresholdMinutes =
    thresholdRounded.getHours() * 60 + thresholdRounded.getMinutes();

  return allOptions.filter((option) => option.startMinutes >= thresholdMinutes).slice(0, 4);
}

function buildOtherTimeOptions(
  allOptions: TimeOption[],
  quickOptions: TimeOption[],
  baseDate = new Date()
) {
  const threshold = addMinutes(baseDate, 45);
  const thresholdRounded = floorToQuarter(threshold);
  const thresholdMinutes =
    thresholdRounded.getHours() * 60 + thresholdRounded.getMinutes();
  const quickValues = new Set(quickOptions.map((option) => option.value));

  return allOptions.filter(
    (option) => option.startMinutes >= thresholdMinutes && !quickValues.has(option.value)
  );
}

function formatItemsCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return `${count} товар`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} товара`;
  return `${count} товаров`;
}

export default function CheckoutScreen() {
  const user = useAuthStore((state) => state.user);
  const items = useCartStore((state) => state.items);
  const checkoutDraft = useCartStore((state) => state.checkoutDraft);
  const updateCheckoutDraft = useCartStore((state) => state.updateCheckoutDraft);
  const clearCart = useCartStore((state) => state.clear);
  const resetCheckoutDraft = useCartStore((state) => state.resetCheckoutDraft);
  const saveTracking = useTrackingStore((state) => state.save);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const insets = useSafeAreaInsets();

  const [submitting, setSubmitting] = useState(false);
  const [allTimesOpen, setAllTimesOpen] = useState(false);

  const totalPrice = useMemo(() => getCartTotal(items), [items]);
  const itemsCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );
  const allTimeOptions = useMemo(() => buildDailyTimeOptions(), []);
  const quickTimeOptions = useMemo(() => buildQuickTimeOptions(allTimeOptions), [allTimeOptions]);
  const otherTimeOptions = useMemo(
    () => buildOtherTimeOptions(allTimeOptions, quickTimeOptions),
    [allTimeOptions, quickTimeOptions]
  );
  const title = checkoutDraft.deliveryMethod === "delivery" ? "Доставка" : "Самовывоз";
  const timeSectionTitle =
    checkoutDraft.deliveryMethod === "delivery" ? "Время доставки" : "Время выдачи";
  const selectedCustomTime = useMemo(() => {
    const current = checkoutDraft.deliveryTime.trim();
    if (!current || current === ASAP_LABEL) return "";
    if (quickTimeOptions.some((option) => option.value === current)) return "";
    return current;
  }, [checkoutDraft.deliveryTime, quickTimeOptions]);

  useEffect(() => {
    const current = checkoutDraft.deliveryTime.trim();
    const hasCurrentOption =
      current === ASAP_LABEL ||
      quickTimeOptions.some((option) => option.value === current) ||
      otherTimeOptions.some((option) => option.value === current);

    if (!current || !hasCurrentOption) {
      updateCheckoutDraft({ deliveryTime: ASAP_LABEL });
    }
  }, [checkoutDraft.deliveryTime, otherTimeOptions, quickTimeOptions, updateCheckoutDraft]);

  const handleSubmit = async () => {
    if (submitting || !user) return;

    if (checkoutDraft.deliveryMethod === "delivery" && !checkoutDraft.address.trim()) {
      pushToast({
        tone: "error",
        title: "Не выбран адрес доставки",
        description: "Выберите адрес в каталоге перед оформлением заказа.",
      });
      router.replace("/");
      return;
    }

    try {
      setSubmitting(true);
      const fallbackPhone = normalizePhone(user.login) || user.login.trim() || `user-${user.id}`;

      const order = await mobileApi.createOrder({
        customer: {
          name: user.full_name?.trim() || user.first_name?.trim() || null,
          phone: fallbackPhone,
          address:
            checkoutDraft.deliveryMethod === "delivery"
              ? checkoutDraft.address.trim() || null
              : null,
        },
        delivery_method: checkoutDraft.deliveryMethod,
        delivery_time: checkoutDraft.deliveryTime.trim() || ASAP_LABEL,
        payment_method: checkoutDraft.paymentMethod,
        cash_change_from: null,
        do_not_call: checkoutDraft.doNotCall,
        comment: checkoutDraft.comment.trim() || null,
        items: items.map((item) => ({
          product_size_id: item.productSizeId,
          quantity: item.quantity,
        })),
      });

      if (!user) {
        saveTracking(order.id, fallbackPhone);
      }

      clearCart();
      resetCheckoutDraft();
      await queryClient.invalidateQueries({ queryKey: ["me-orders"] });
      pushToast({
        tone: "success",
        title: "Заказ оформлен",
        description: `Номер заказа: ${order.id}`,
      });

      router.replace({
        pathname: "/order/[id]",
        params: { id: String(order.id), phone: fallbackPhone },
      });
    } catch (error: any) {
      pushToast({
        tone: "error",
        title: "Не удалось оформить заказ",
        description: error?.message || "Попробуйте ещё раз через минуту.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!items.length) {
    return (
      <Screen>
        <View style={styles.emptyWrap}>
          <Text style={styles.closeLink} onPress={() => router.back()}>
            Закрыть
          </Text>
          <EmptyState
            description="Когда в корзине появятся позиции, здесь можно будет подтвердить заказ."
            icon="shopping-bag"
            title="Корзина пока пустая"
          />
          <MeatButton fullWidth onPress={() => router.replace("/cart")} variant="secondary">
            Вернуться в корзину
          </MeatButton>
        </View>
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen>
        <View style={styles.emptyWrap}>
          <Text style={styles.closeLink} onPress={() => router.back()}>
            Закрыть
          </Text>
          <EmptyState
            description="Оформление заказа доступно только после входа в аккаунт."
            icon="user"
            title="Войдите, чтобы продолжить"
          />
          <View style={styles.authActions}>
            <MeatButton fullWidth onPress={() => router.push("/auth/sign-in")} variant="secondary">
              Войти
            </MeatButton>
            <MeatButton fullWidth onPress={() => router.push("/auth/sign-up")}>
              Создать аккаунт
            </MeatButton>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false} scroll={false}>
      <View style={styles.root}>
        <ScrollView
          alwaysBounceVertical={false}
          bounces={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sheet}>
            <Pressable onPress={() => router.back()} style={styles.closeWrap}>
              <Text style={styles.closeLink}>Закрыть</Text>
            </Pressable>

            <Text style={styles.title}>{title}</Text>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{timeSectionTitle}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.timeRow}
              >
                <Pressable
                  onPress={() => updateCheckoutDraft({ deliveryTime: ASAP_LABEL })}
                  style={({ pressed }) => [
                    styles.timeChip,
                    checkoutDraft.deliveryTime === ASAP_LABEL ? styles.timeChipActive : null,
                    pressed ? styles.timeChipPressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.timeChipLabel,
                      checkoutDraft.deliveryTime === ASAP_LABEL ? styles.timeChipLabelActive : null,
                    ]}
                  >
                    {ASAP_LABEL}
                  </Text>
                </Pressable>

                {quickTimeOptions.map((option) => {
                  const active = checkoutDraft.deliveryTime === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => updateCheckoutDraft({ deliveryTime: option.value })}
                      style={({ pressed }) => [
                        styles.timeChip,
                        active ? styles.timeChipActive : null,
                        pressed ? styles.timeChipPressed : null,
                      ]}
                    >
                      <Text
                        style={[styles.timeChipLabel, active ? styles.timeChipLabelActive : null]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}

                <Pressable
                  onPress={() => setAllTimesOpen(true)}
                  style={({ pressed }) => [
                    styles.timeChip,
                    selectedCustomTime ? styles.timeChipActive : null,
                    pressed ? styles.timeChipPressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.timeChipLabel,
                      selectedCustomTime ? styles.timeChipLabelActive : null,
                    ]}
                  >
                    Другое
                  </Text>
                </Pressable>
              </ScrollView>
              {selectedCustomTime ? (
                <Text style={styles.selectedTimeText}>Выбрано: {selectedCustomTime}</Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Оплата</Text>
              <View style={styles.paymentSwitch}>
                {[
                  { value: "cash" as const, label: "Наличными" },
                  { value: "card" as const, label: "По карте" },
                ].map((option) => {
                  const active = checkoutDraft.paymentMethod === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => updateCheckoutDraft({ paymentMethod: option.value })}
                      style={({ pressed }) => [
                        styles.paymentOption,
                        active ? styles.paymentOptionActive : null,
                        pressed ? styles.paymentOptionPressed : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.paymentOptionLabel,
                          active ? styles.paymentOptionLabelActive : null,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.paymentHint}>
                {checkoutDraft.paymentMethod === "card"
                  ? "Оплата по карте при получении"
                  : "Оплата наличными при получении"}
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.footerRow}>
            <Text style={styles.footerMeta}>{formatItemsCount(itemsCount)}</Text>
            <Text style={styles.footerMeta}>{formatPrice(totalPrice)}</Text>
          </View>
          <View style={styles.footerDivider} />
          <View style={styles.footerRow}>
            <Text style={styles.footerTotalLabel}>Итого</Text>
            <Text style={styles.footerTotalValue}>{formatPrice(totalPrice)}</Text>
          </View>

          <MeatButton fullWidth loading={submitting} onPress={handleSubmit} size="cta">
            Заказать
          </MeatButton>
        </View>
      </View>

      <Modal
        animationType="slide"
        transparent
        visible={allTimesOpen}
        onRequestClose={() => setAllTimesOpen(false)}
      >
        <Pressable style={styles.timesModalBackdrop} onPress={() => setAllTimesOpen(false)}>
          <Pressable style={styles.timesModalCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.timesModalHead}>
              <Text style={styles.timesModalTitle}>Выберите удобное время</Text>
              <Pressable onPress={() => setAllTimesOpen(false)}>
                <Text style={styles.closeLink}>Готово</Text>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.timesModalList}
            >
              {otherTimeOptions.map((option) => {
                const active = checkoutDraft.deliveryTime === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      updateCheckoutDraft({ deliveryTime: option.value });
                      setAllTimesOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.timeListItem,
                      active ? styles.timeListItemActive : null,
                      pressed ? styles.timeListItemPressed : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.timeListItemLabel,
                        active ? styles.timeListItemLabelActive : null,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
              {!otherTimeOptions.length ? (
                <Text style={styles.selectedTimeText}>На сегодня дополнительных слотов больше нет.</Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  sheet: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.bg,
  },
  closeWrap: {
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  closeLink: {
    color: colors.accent,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  title: {
    marginTop: 2,
    color: colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: typography.semibold,
  },
  section: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: typography.semibold,
  },
  timeRow: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  timeChip: {
    minHeight: 46,
    minWidth: 108,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: "rgba(234, 223, 211, 0.9)",
  },
  timeChipActive: {
    borderColor: colors.accent,
    ...shadows.soft,
  },
  timeChipPressed: {
    opacity: 0.95,
  },
  timeChipLabel: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
    textAlign: "center",
  },
  timeChipLabelActive: {
    color: colors.text,
  },
  selectedTimeText: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  paymentSwitch: {
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
    borderRadius: radii.pill,
    backgroundColor: "#d9d9d9",
  },
  paymentOption: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentOptionActive: {
    backgroundColor: colors.surfaceStrong,
    ...shadows.soft,
  },
  paymentOptionPressed: {
    opacity: 0.95,
  },
  paymentOptionLabel: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.medium,
  },
  paymentOptionLabelActive: {
    fontWeight: typography.semibold,
  },
  paymentHint: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 20,
    textAlign: "center",
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surfaceStrong,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  footerMeta: {
    color: colors.muted,
    fontSize: typography.body,
  },
  footerDivider: {
    height: 1,
    backgroundColor: colors.line,
  },
  footerTotalLabel: {
    color: colors.text,
    fontSize: 18,
    fontWeight: typography.semibold,
  },
  footerTotalValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: typography.semibold,
  },
  emptyWrap: {
    flex: 1,
    gap: spacing.lg,
  },
  authActions: {
    gap: spacing.sm,
  },
  timesModalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.scrim,
  },
  timesModalCard: {
    maxHeight: "72%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surfaceStrong,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  timesModalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  timesModalTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: typography.semibold,
  },
  timesModalList: {
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  timeListItem: {
    minHeight: 48,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    alignItems: "flex-start",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  timeListItemActive: {
    backgroundColor: colors.accentSoft,
  },
  timeListItemPressed: {
    opacity: 0.95,
  },
  timeListItemLabel: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  timeListItemLabelActive: {
    color: colors.accent,
    fontWeight: typography.semibold,
  },
});
