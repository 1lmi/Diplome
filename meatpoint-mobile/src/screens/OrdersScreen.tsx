import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { mobileApi } from "@/src/api/mobile-api";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { SectionCard } from "@/src/components/ui/SectionCard";
import { StatusPill } from "@/src/components/ui/StatusPill";
import { TextField } from "@/src/components/ui/TextField";
import { formatDateTime, formatPrice, normalizePhone } from "@/src/lib/format";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { useTrackingStore } from "@/src/store/tracking-store";
import { colors, spacing, typography } from "@/src/theme/tokens";

export default function OrdersScreen() {
  const user = useAuthStore((state) => state.user);
  const trackedItems = useTrackingStore((state) => state.items);
  const saveTracking = useTrackingStore((state) => state.save);
  const removeTracking = useTrackingStore((state) => state.remove);
  const { pushToast } = useToast();

  const ordersQuery = useQuery({
    queryKey: ["me-orders"],
    queryFn: mobileApi.getMyOrders,
    enabled: Boolean(user),
  });

  const [orderId, setOrderId] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tracking, setTracking] = useState(false);

  const sortedTracked = useMemo(
    () => [...trackedItems].sort((left, right) => right.savedAt - left.savedAt),
    [trackedItems]
  );

  const handleTrack = async (targetOrderId?: number, targetPhone?: string) => {
    const nextOrderId = String(targetOrderId ?? orderId).trim();
    const nextPhone = normalizePhone(targetPhone ?? phone);
    const nextErrors: Record<string, string> = {};

    if (!nextOrderId || Number.isNaN(Number(nextOrderId))) {
      nextErrors.orderId = "Укажите номер заказа.";
    }
    if (!nextPhone) {
      nextErrors.phone = "Укажите телефон, привязанный к заказу.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    try {
      setTracking(true);
      await mobileApi.trackOrder(Number(nextOrderId), nextPhone);
      saveTracking(Number(nextOrderId), nextPhone);
      router.push({
        pathname: "/order/[id]",
        params: { id: nextOrderId, phone: nextPhone },
      });
    } catch (error: any) {
      pushToast({
        tone: "error",
        title: "Не удалось найти заказ",
        description: error?.message || "Проверьте номер и телефон.",
      });
    } finally {
      setTracking(false);
    }
  };

  if (!user) {
    return (
      <Screen keyboard>
        <PageHeader subtitle="Отслеживание гостевых заказов" title="Заказы" />

        <SectionCard>
          <Text style={styles.sectionTitle}>Отследить заказ</Text>
          <TextField
            error={errors.orderId}
            keyboardType="numeric"
            label="Номер заказа"
            onChangeText={(value) => {
              setErrors((current) => ({ ...current, orderId: "" }));
              setOrderId(value.replace(/[^\d]/g, ""));
            }}
            placeholder="Например, 128"
            value={orderId}
          />
          <TextField
            error={errors.phone}
            keyboardType="phone-pad"
            label="Телефон"
            onChangeText={(value) => {
              setErrors((current) => ({ ...current, phone: "" }));
              setPhone(value);
            }}
            placeholder="+7 999 123-45-67"
            value={phone}
          />
          <MeatButton fullWidth loading={tracking} onPress={() => handleTrack()}>
            Открыть заказ
          </MeatButton>
        </SectionCard>

        {sortedTracked.length > 0 ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>Последние отслеживания</Text>
            {sortedTracked.map((item) => (
              <View key={item.orderId} style={styles.trackRow}>
                <Pressable onPress={() => handleTrack(item.orderId, item.phone)} style={styles.trackInfo}>
                  <Text style={styles.trackTitle}>Заказ №{item.orderId}</Text>
                  <Text style={styles.trackMeta}>{item.phone}</Text>
                </Pressable>
                <Pressable onPress={() => removeTracking(item.orderId)}>
                  <Text style={styles.remove}>Удалить</Text>
                </Pressable>
              </View>
            ))}
          </SectionCard>
        ) : null}

        <SectionCard>
          <Text style={styles.sectionTitle}>Хотите историю заказов?</Text>
          <Text style={styles.copy}>
            Войдите в аккаунт, чтобы видеть заказы, адреса и данные профиля в одном месте.
          </Text>
          <View style={styles.authActions}>
            <MeatButton fullWidth onPress={() => router.push("/auth/sign-in")} variant="secondary">
              Войти
            </MeatButton>
            <MeatButton fullWidth onPress={() => router.push("/auth/sign-up")}>
              Регистрация
            </MeatButton>
          </View>
        </SectionCard>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader subtitle="Ваши актуальные и завершённые заказы" title="Заказы" />

      {ordersQuery.isLoading ? (
        <EmptyState
          description="Подгружаем вашу историю заказов."
          icon="loader"
          title="Обновляем список"
        />
      ) : ordersQuery.data?.length ? (
        <View style={styles.orderList}>
          {ordersQuery.data.map((order) => (
            <Pressable
              key={order.id}
              onPress={() =>
                router.push({
                  pathname: "/order/[id]",
                  params: { id: String(order.id) },
                })
              }
              style={styles.orderCard}
            >
              <View style={styles.orderHead}>
                <View style={styles.orderHeadCopy}>
                  <Text style={styles.orderTitle}>Заказ №{order.id}</Text>
                  <Text style={styles.orderMeta}>{formatDateTime(order.created_at)}</Text>
                </View>
                <StatusPill label={order.status_name} />
              </View>
              <View style={styles.orderFoot}>
                <Text style={styles.orderSecondary}>
                  {order.delivery_method === "pickup" ? "Самовывоз" : "Доставка"}
                </Text>
                <Text style={styles.orderAmount}>{formatPrice(order.total_price)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <EmptyState
          description="Как только оформите первый заказ, история появится здесь."
          icon="clock"
          title="Заказов пока нет"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  authActions: {
    gap: spacing.sm,
  },
  copy: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 20,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  trackInfo: {
    flex: 1,
    gap: 2,
  },
  trackTitle: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  trackMeta: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  remove: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: typography.medium,
  },
  orderList: {
    gap: spacing.md,
  },
  orderCard: {
    borderRadius: 20,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  orderHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  orderHeadCopy: {
    flex: 1,
    gap: 4,
  },
  orderTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  orderMeta: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  orderFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  orderSecondary: {
    color: colors.muted,
    fontSize: typography.bodySm,
  },
  orderAmount: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
});
