import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "@/src/components/ui/EmptyState";
import { ListRow } from "@/src/components/ui/ListRow";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { SegmentedControl } from "@/src/components/ui/SegmentedControl";
import { StatusPill } from "@/src/components/ui/StatusPill";
import { SurfacePanel } from "@/src/components/ui/SurfacePanel";
import { TextField } from "@/src/components/ui/TextField";
import { mobileApi } from "@/src/api/mobile-api";
import { formatPrice, normalizePhone } from "@/src/lib/format";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { getCartTotal, useCartStore } from "@/src/store/cart-store";
import { useTrackingStore } from "@/src/store/tracking-store";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

function SectionBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "accent" | "neutral" | "soft";
}) {
  return (
    <View
      style={[
        styles.sectionBadge,
        tone === "accent"
          ? styles.sectionBadgeAccent
          : tone === "soft"
            ? styles.sectionBadgeSoft
            : styles.sectionBadgeNeutral,
      ]}
    >
      <Text
        style={[
          styles.sectionBadgeText,
          tone === "accent"
            ? styles.sectionBadgeTextAccent
            : tone === "soft"
              ? styles.sectionBadgeTextSoft
              : styles.sectionBadgeTextNeutral,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export default function CheckoutScreen() {
  const user = useAuthStore((state) => state.user);
  const items = useCartStore((state) => state.items);
  const checkoutDraft = useCartStore((state) => state.checkoutDraft);
  const updateCheckoutDraft = useCartStore((state) => state.updateCheckoutDraft);
  const clearCart = useCartStore((state) => state.clear);
  const resetCheckoutDraft = useCartStore((state) => state.resetCheckoutDraft);
  const saveTracking = useTrackingStore((state) => state.save);
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [submitting, setSubmitting] = useState(false);
  const [cashChangeError, setCashChangeError] = useState("");

  const totalPrice = useMemo(() => getCartTotal(items), [items]);
  const needsAddress = checkoutDraft.deliveryMethod === "delivery";

  const handleSubmit = async () => {
    if (submitting || !user) return;

    if (needsAddress && !checkoutDraft.address.trim()) {
      pushToast({
        tone: "error",
        title: "Не выбран адрес доставки",
        description: "Выберите адрес в каталоге перед оформлением заказа.",
      });
      router.replace("/");
      return;
    }

    if (
      checkoutDraft.paymentMethod === "cash" &&
      checkoutDraft.cashChangeFrom.trim() &&
      Number(checkoutDraft.cashChangeFrom) < totalPrice
    ) {
      setCashChangeError("Сумма для сдачи должна быть не меньше суммы заказа.");
      pushToast({
        tone: "error",
        title: "Проверьте оплату",
        description: "Сумма для сдачи меньше итоговой стоимости заказа.",
      });
      return;
    }

    try {
      setSubmitting(true);
      const fallbackPhone = normalizePhone(user.login) || user.login.trim() || `user-${user.id}`;

      const order = await mobileApi.createOrder({
        customer: {
          name: user.full_name?.trim() || user.first_name?.trim() || null,
          phone: fallbackPhone,
          address: needsAddress ? checkoutDraft.address.trim() || null : null,
        },
        delivery_method: checkoutDraft.deliveryMethod,
        delivery_time: checkoutDraft.deliveryTime.trim() || null,
        payment_method: checkoutDraft.paymentMethod,
        cash_change_from:
          checkoutDraft.paymentMethod === "cash" && checkoutDraft.cashChangeFrom.trim()
            ? Number(checkoutDraft.cashChangeFrom)
            : null,
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
        <PageHeader
          showBack
          subtitle="Сначала добавьте что-нибудь из меню"
          title="Оформление"
        />
        <EmptyState
          description="Когда в корзине появятся позиции, здесь можно будет оплатить заказ."
          icon="shopping-bag"
          title="Корзина пока пустая"
        />
        <MeatButton fullWidth onPress={() => router.replace("/cart")} variant="secondary">
          Вернуться в корзину
        </MeatButton>
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen>
        <PageHeader
          showBack
          subtitle="Оформление доступно только после входа"
          title="Оформление"
        />

        <View style={styles.sectionWrap}>
          <SectionBadge label="Аккаунт" tone="accent" />
          <SurfacePanel style={styles.accentPanel} tone="tint">
            <Text style={styles.panelTitle}>Войдите, чтобы продолжить</Text>
            <Text style={styles.copy}>
              Адрес и способ получения выбираются в каталоге, а оформление заказа доступно только
              авторизованному пользователю.
            </Text>
            <View style={styles.actionRow}>
              <MeatButton
                fullWidth
                onPress={() => router.push("/auth/sign-in")}
                variant="secondary"
              >
                Войти
              </MeatButton>
              <MeatButton fullWidth onPress={() => router.push("/auth/sign-up")}>
                Создать аккаунт
              </MeatButton>
            </View>
          </SurfacePanel>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false} scroll={false} keyboard>
      <View style={styles.root}>
        <ScrollView
          alwaysBounceVertical={false}
          bounces={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerWrap}>
            <PageHeader
              showBack
              subtitle="Адрес и способ получения уже выбраны в каталоге"
              title="Оформление"
            />
          </View>

          <View style={styles.sectionWrap}>
            <SectionBadge label="Оплата" tone="soft" />
            <SurfacePanel style={styles.softPanel} tone="soft">
              <Text style={styles.panelTitle}>Как оплатить заказ</Text>
              <SegmentedControl
                options={[
                  { label: "Наличными", value: "cash" },
                  { label: "Картой", value: "card" },
                ]}
                tone="accent"
                value={checkoutDraft.paymentMethod}
                onChange={(value) => {
                  setCashChangeError("");
                  updateCheckoutDraft({
                    paymentMethod: value,
                    cashChangeFrom: value === "cash" ? checkoutDraft.cashChangeFrom : "",
                  });
                }}
              />

              {checkoutDraft.paymentMethod === "cash" ? (
                <TextField
                  error={cashChangeError}
                  keyboardType="numeric"
                  label="Подготовить сдачу с"
                  onChangeText={(value) => {
                    setCashChangeError("");
                    updateCheckoutDraft({
                      cashChangeFrom: value.replace(/[^\d]/g, ""),
                    });
                  }}
                  placeholder="Например, 2000"
                  value={checkoutDraft.cashChangeFrom}
                />
              ) : (
                <SurfacePanel compact style={styles.notePanel}>
                  <Text style={styles.noteText}>
                    Карта при получении. Онлайн-оплата в приложении пока не используется.
                  </Text>
                </SurfacePanel>
              )}

              <Pressable
                onPress={() =>
                  updateCheckoutDraft({
                    doNotCall: !checkoutDraft.doNotCall,
                  })
                }
                style={({ pressed }) => [
                  styles.toggleRow,
                  checkoutDraft.doNotCall ? styles.toggleRowActive : null,
                  pressed ? styles.toggleRowPressed : null,
                ]}
              >
                <View style={styles.toggleCopy}>
                  <Text style={styles.toggleTitle}>Не перезванивать</Text>
                  <Text style={styles.toggleText}>
                    Свяжемся только если потребуется уточнение по заказу.
                  </Text>
                </View>
                <View
                  style={[
                    styles.toggleKnob,
                    checkoutDraft.doNotCall ? styles.toggleKnobActive : null,
                  ]}
                />
              </Pressable>
            </SurfacePanel>
          </View>

          <View style={styles.sectionWrap}>
            <SectionBadge label="Итог" tone="accent" />
            <SurfacePanel style={styles.summaryPanel} tone="tint">
              <View style={styles.panelHead}>
                <View style={styles.panelTitleWrap}>
                  <Text style={styles.panelTitle}>Проверка перед оплатой</Text>
                  <Text style={styles.copy}>Осталось только подтвердить способ оплаты.</Text>
                </View>
                <StatusPill label={`${items.length} поз.`} tone="muted" />
              </View>

              <View style={styles.summaryRows}>
                <ListRow
                  subtitle={checkoutDraft.deliveryMethod === "delivery" ? "Доставка" : "Самовывоз"}
                  title={`Позиции в корзине: ${items.length}`}
                  tone="surface"
                  trailing={<Text style={styles.summaryValue}>{formatPrice(totalPrice)}</Text>}
                />
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Итого</Text>
                <Text style={styles.totalValue}>{formatPrice(totalPrice)}</Text>
              </View>

              <MeatButton fullWidth loading={submitting} onPress={handleSubmit} size="cta">
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
  content: {
    paddingBottom: spacing.xxxl,
  },
  headerWrap: {
    paddingHorizontal: spacing.lg,
  },
  sectionWrap: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  sectionBadge: {
    alignSelf: "flex-start",
    minHeight: 24,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
  },
  sectionBadgeAccent: {
    backgroundColor: colors.accentSoft,
  },
  sectionBadgeNeutral: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionBadgeSoft: {
    backgroundColor: colors.bgSoft,
  },
  sectionBadgeText: {
    fontSize: typography.caption,
    fontWeight: typography.semibold,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  sectionBadgeTextAccent: {
    color: colors.accent,
  },
  sectionBadgeTextNeutral: {
    color: colors.text,
  },
  sectionBadgeTextSoft: {
    color: colors.muted,
  },
  accentPanel: {
    borderWidth: 1,
    borderColor: "rgba(230, 122, 46, 0.18)",
  },
  softPanel: {
    borderWidth: 1,
    borderColor: colors.line,
  },
  summaryPanel: {
    borderWidth: 1,
    borderColor: "rgba(230, 122, 46, 0.18)",
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  panelTitleWrap: {
    flex: 1,
    gap: 4,
  },
  panelTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  copy: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 20,
  },
  actionRow: {
    gap: spacing.sm,
  },
  notePanel: {
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceStrong,
  },
  noteText: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 20,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceStrong,
  },
  toggleRowActive: {
    backgroundColor: colors.accentSoft,
  },
  toggleRowPressed: {
    opacity: 0.94,
  },
  toggleCopy: {
    flex: 1,
    gap: 3,
  },
  toggleTitle: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  toggleText: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleKnobActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  summaryRows: {
    gap: spacing.xs,
  },
  summaryValue: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.xs,
  },
  totalLabel: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  totalValue: {
    color: colors.text,
    fontSize: typography.titleSm,
    fontWeight: typography.semibold,
  },
});
