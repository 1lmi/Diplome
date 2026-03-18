import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { mobileApi } from "@/src/api/mobile-api";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { SectionCard } from "@/src/components/ui/SectionCard";
import { SegmentedControl } from "@/src/components/ui/SegmentedControl";
import { TextField } from "@/src/components/ui/TextField";
import { formatPrice, normalizePhone } from "@/src/lib/format";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { getCartTotal, useCartStore } from "@/src/store/cart-store";
import { useTrackingStore } from "@/src/store/tracking-store";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

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
  const scrollRef = useRef<ScrollView>(null);
  const fieldPositions = useRef<Record<string, number>>({});

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const addressesQuery = useQuery({
    queryKey: ["addresses"],
    queryFn: mobileApi.getMyAddresses,
    enabled: Boolean(user),
  });

  const totalPrice = useMemo(() => getCartTotal(items), [items]);
  const defaultAddress = addressesQuery.data?.find((item) => item.is_default) || null;
  const needsAddress = checkoutDraft.deliveryMethod === "delivery";

  useEffect(() => {
    if (!user && !checkoutDraft.guestMode) {
      updateCheckoutDraft({ guestMode: true });
    }
  }, [checkoutDraft.guestMode, updateCheckoutDraft, user]);

  useEffect(() => {
    if (!user) return;

    const patch: Partial<typeof checkoutDraft> = {};
    if (checkoutDraft.guestMode) patch.guestMode = false;
    if (!checkoutDraft.customerName.trim() && user.full_name) {
      patch.customerName = user.full_name;
    }
    if (Object.keys(patch).length > 0) {
      updateCheckoutDraft(patch);
    }
  }, [checkoutDraft.customerName, checkoutDraft.guestMode, updateCheckoutDraft, user]);

  useEffect(() => {
    if (!user || checkoutDraft.deliveryMethod !== "delivery") return;
    if (checkoutDraft.address.trim() || !defaultAddress) return;
    updateCheckoutDraft({ address: defaultAddress.address });
  }, [checkoutDraft.address, checkoutDraft.deliveryMethod, defaultAddress, updateCheckoutDraft, user]);

  const registerField = (name: string) => (event: LayoutChangeEvent) => {
    fieldPositions.current[name] = event.nativeEvent.layout.y;
  };

  const scrollToField = (field: string) => {
    const top = fieldPositions.current[field];
    if (typeof top === "number") {
      scrollRef.current?.scrollTo({ y: Math.max(top - 20, 0), animated: true });
    }
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    if (!checkoutDraft.customerName.trim()) {
      nextErrors.customerName = "Укажите имя получателя.";
    }
    if (!normalizePhone(checkoutDraft.customerPhone)) {
      nextErrors.customerPhone = "Укажите телефон для заказа.";
    }
    if (needsAddress && !checkoutDraft.address.trim()) {
      nextErrors.address = "Укажите адрес доставки.";
    }

    if (
      checkoutDraft.paymentMethod === "cash" &&
      checkoutDraft.cashChangeFrom.trim() &&
      Number(checkoutDraft.cashChangeFrom) < totalPrice
    ) {
      nextErrors.cashChangeFrom = "Сумма для сдачи должна быть не меньше суммы заказа.";
    }

    return nextErrors;
  };

  const handleSubmit = async () => {
    if (submitting) return;

    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const firstField = Object.keys(nextErrors)[0];
      scrollToField(firstField);
      pushToast({
        tone: "error",
        title: "Форма заполнена не полностью",
        description: "Проверьте обязательные поля перед оформлением заказа.",
      });
      return;
    }

    try {
      setSubmitting(true);
      const normalizedPhone = normalizePhone(checkoutDraft.customerPhone);
      const order = await mobileApi.createOrder({
        customer: {
          name: checkoutDraft.customerName.trim() || null,
          phone: normalizedPhone,
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
        saveTracking(order.id, normalizedPhone);
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
        params: { id: String(order.id), phone: normalizedPhone },
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
        <PageHeader showBack subtitle="Корзина пуста" title="Оформление" />
        <EmptyState
          description="Сначала добавьте хотя бы одну позицию в корзину."
          icon="shopping-bag"
          title="Нечего оформлять"
        />
        <MeatButton fullWidth onPress={() => router.replace("/cart")} variant="secondary">
          Вернуться в корзину
        </MeatButton>
      </Screen>
    );
  }

  return (
    <Screen padded={false} scroll={false} keyboard>
      <View style={styles.root}>
        <ScrollView
          alwaysBounceVertical={false}
          bounces={false}
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerWrap}>
            <PageHeader
              showBack
              subtitle="Проверьте данные перед отправкой заказа"
              title="Оформление"
            />
          </View>

          {!user ? (
            <View style={styles.sectionWrap}>
              <SectionCard>
                <Text style={styles.sectionTitle}>Вы оформляете как гость</Text>
                <Text style={styles.helperCopy}>
                  Можно продолжить без аккаунта или войти, чтобы использовать сохранённые адреса и историю заказов.
                </Text>
                <View style={styles.authRow}>
                  <MeatButton onPress={() => router.push("/auth/sign-in")} variant="secondary">
                    Войти
                  </MeatButton>
                  <MeatButton onPress={() => updateCheckoutDraft({ guestMode: true })}>
                    Продолжить
                  </MeatButton>
                </View>
              </SectionCard>
            </View>
          ) : null}

          <View onLayout={registerField("customerName")} style={styles.sectionWrap}>
            <SectionCard>
              <Text style={styles.sectionTitle}>Контакты</Text>
              <TextField
                error={errors.customerName}
                label="Имя"
                onChangeText={(value) => {
                  setErrors((current) => ({ ...current, customerName: "" }));
                  updateCheckoutDraft({ customerName: value });
                }}
                placeholder="Как к вам обращаться"
                value={checkoutDraft.customerName}
              />
              <View onLayout={registerField("customerPhone")}>
                <TextField
                  error={errors.customerPhone}
                  helper="Нужен только для связи по заказу."
                  keyboardType="phone-pad"
                  label="Телефон для заказа"
                  onChangeText={(value) => {
                    setErrors((current) => ({ ...current, customerPhone: "" }));
                    updateCheckoutDraft({ customerPhone: value });
                  }}
                  placeholder="+7 999 123-45-67"
                  value={checkoutDraft.customerPhone}
                />
              </View>
            </SectionCard>
          </View>

          <View style={styles.sectionWrap}>
            <SectionCard>
              <Text style={styles.sectionTitle}>Получение</Text>
              <SegmentedControl
                options={[
                  { label: "Доставка", value: "delivery" },
                  { label: "Самовывоз", value: "pickup" },
                ]}
                tone="accent"
                value={checkoutDraft.deliveryMethod}
                onChange={(value) => {
                  updateCheckoutDraft({ deliveryMethod: value });
                  setErrors((current) => ({ ...current, address: "" }));
                }}
              />

              {needsAddress ? (
                <>
                  {user ? (
                    <View style={styles.addressesWrap}>
                      <View style={styles.addressesHead}>
                        <Text style={styles.helperLabel}>Сохранённые адреса</Text>
                        <Pressable onPress={() => router.push("/address/new")}>
                          <Text style={styles.link}>Новый адрес</Text>
                        </Pressable>
                      </View>
                      {addressesQuery.data?.length ? (
                        addressesQuery.data.map((address) => {
                          const active = checkoutDraft.address.trim() === address.address.trim();
                          return (
                            <Pressable
                              key={address.id}
                              onPress={() => {
                                setErrors((current) => ({ ...current, address: "" }));
                                updateCheckoutDraft({ address: address.address });
                              }}
                              style={[
                                styles.addressOption,
                                active ? styles.addressOptionActive : null,
                              ]}
                            >
                              <View style={styles.addressOptionCopy}>
                                <Text style={styles.addressOptionTitle}>
                                  {address.label || "Адрес"}
                                </Text>
                                <Text style={styles.addressOptionText}>{address.address}</Text>
                              </View>
                              {address.is_default ? <View style={styles.dotBadge} /> : null}
                            </Pressable>
                          );
                        })
                      ) : (
                        <Text style={styles.helperCopy}>
                          Сохранённых адресов пока нет. Можно ввести адрес вручную.
                        </Text>
                      )}
                    </View>
                  ) : null}

                  <View onLayout={registerField("address")}>
                    <TextField
                      error={errors.address}
                      label="Адрес доставки"
                      onChangeText={(value) => {
                        setErrors((current) => ({ ...current, address: "" }));
                        updateCheckoutDraft({ address: value });
                      }}
                      placeholder="Улица, дом, квартира"
                      value={checkoutDraft.address}
                    />
                  </View>
                </>
              ) : (
                <Text style={styles.helperCopy}>
                  Для самовывоза адрес не нужен. Детали заказа будут доступны сразу после оформления.
                </Text>
              )}

              <TextField
                label={needsAddress ? "Когда доставить" : "Когда подготовить"}
                onChangeText={(value) => updateCheckoutDraft({ deliveryTime: value })}
                placeholder="Например, к 19:30"
                value={checkoutDraft.deliveryTime}
              />
            </SectionCard>
          </View>

          <View style={styles.sectionWrap}>
            <SectionCard>
              <Text style={styles.sectionTitle}>Комментарий</Text>
              <TextField
                helper={`${checkoutDraft.comment.length}/300`}
                multiline
                onChangeText={(value) => updateCheckoutDraft({ comment: value.slice(0, 300) })}
                placeholder="Важная информация для кухни или курьера"
                value={checkoutDraft.comment}
              />
            </SectionCard>
          </View>

          <View style={styles.sectionWrap}>
            <SectionCard>
              <Text style={styles.sectionTitle}>Оплата</Text>
              <SegmentedControl
                options={[
                  { label: "Наличными", value: "cash" },
                  { label: "Картой", value: "card" },
                ]}
                value={checkoutDraft.paymentMethod}
                onChange={(value) =>
                  updateCheckoutDraft({
                    paymentMethod: value,
                    cashChangeFrom: value === "cash" ? checkoutDraft.cashChangeFrom : "",
                  })
                }
              />

              {checkoutDraft.paymentMethod === "cash" ? (
                <View onLayout={registerField("cashChangeFrom")}>
                  <TextField
                    error={errors.cashChangeFrom}
                    keyboardType="numeric"
                    label="Подготовить сдачу с"
                    onChangeText={(value) => {
                      setErrors((current) => ({ ...current, cashChangeFrom: "" }));
                      updateCheckoutDraft({
                        cashChangeFrom: value.replace(/[^\d]/g, ""),
                      });
                    }}
                    placeholder="Например, 2000"
                    value={checkoutDraft.cashChangeFrom}
                  />
                </View>
              ) : (
                <Text style={styles.helperCopy}>
                  Оплата картой при получении. Онлайн-эквайринг в приложении пока не используется.
                </Text>
              )}

              <Pressable
                onPress={() => updateCheckoutDraft({ doNotCall: !checkoutDraft.doNotCall })}
                style={[
                  styles.switchRow,
                  checkoutDraft.doNotCall ? styles.switchRowActive : null,
                ]}
              >
                <View style={styles.switchCopy}>
                  <Text style={styles.switchTitle}>Не перезванивать</Text>
                  <Text style={styles.switchText}>
                    Свяжемся только если потребуется уточнение по заказу.
                  </Text>
                </View>
                <View
                  style={[
                    styles.switchBullet,
                    checkoutDraft.doNotCall ? styles.switchBulletActive : null,
                  ]}
                />
              </Pressable>
            </SectionCard>
          </View>

          <View style={styles.sectionWrap}>
            <SectionCard>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Позиций</Text>
                <Text style={styles.summaryValue}>{items.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Итого</Text>
                <Text style={styles.summaryAmount}>{formatPrice(totalPrice)}</Text>
              </View>
              <MeatButton fullWidth loading={submitting} onPress={handleSubmit} size="cta">
                Оформить заказ
              </MeatButton>
            </SectionCard>
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
    paddingTop: spacing.sm,
  },
  sectionWrap: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  helperCopy: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 20,
  },
  authRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  helperLabel: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.medium,
  },
  addressesWrap: {
    gap: spacing.sm,
  },
  addressesHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  link: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: typography.medium,
  },
  addressOption: {
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceTint,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  addressOptionActive: {
    backgroundColor: colors.accentSoft,
  },
  addressOptionCopy: {
    flex: 1,
    gap: 4,
  },
  addressOptionTitle: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  addressOptionText: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  dotBadge: {
    width: 12,
    height: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
  switchRow: {
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceTint,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  switchRowActive: {
    backgroundColor: colors.accentSoft,
  },
  switchCopy: {
    flex: 1,
    gap: 4,
  },
  switchTitle: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  switchText: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  switchBullet: {
    width: 18,
    height: 18,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceStrong,
  },
  switchBulletActive: {
    backgroundColor: colors.accent,
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
