import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { mobileApi } from "@/src/api/mobile-api";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { SectionCard } from "@/src/components/ui/SectionCard";
import { StatusPill } from "@/src/components/ui/StatusPill";
import { formatDateTime, formatPrice } from "@/src/lib/format";
import { useAuthStore } from "@/src/store/auth-store";
import { colors, spacing, typography } from "@/src/theme/tokens";

export default function ProfileOrdersScreen() {
  const user = useAuthStore((state) => state.user);
  const ordersQuery = useQuery({
    queryKey: ["me-orders"],
    queryFn: mobileApi.getMyOrders,
    enabled: Boolean(user),
  });

  if (!user) {
    return (
      <Screen>
        <PageHeader showBack subtitle="История доступна только после входа" title="Все заказы" />
        <EmptyState
          description="Войдите в аккаунт, чтобы увидеть оформленные заказы и их статусы."
          icon="user"
          title="Вы ещё не вошли"
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader showBack subtitle="Актуальные и завершённые заказы" title="Все заказы" />

      {ordersQuery.isLoading ? (
        <EmptyState
          description="Подгружаем историю заказов."
          icon="loader"
          title="Обновляем список"
        />
      ) : ordersQuery.data?.length ? (
        <View style={styles.list}>
          {ordersQuery.data.map((order) => (
            <Pressable
              key={order.id}
              onPress={() =>
                router.push({
                  pathname: "/order/[id]",
                  params: { id: String(order.id) },
                })
              }
            >
              <SectionCard>
                <View style={styles.cardHead}>
                  <View style={styles.cardCopy}>
                    <Text style={styles.orderTitle}>Заказ №{order.id}</Text>
                    <Text style={styles.orderMeta}>{formatDateTime(order.created_at)}</Text>
                  </View>
                  <StatusPill
                    label={order.status_name}
                    tone={order.status === "canceled" ? "danger" : "accent"}
                  />
                </View>
                <View style={styles.cardFoot}>
                  <Text style={styles.orderType}>
                    {order.delivery_method === "pickup" ? "Самовывоз" : "Доставка"}
                  </Text>
                  <Text style={styles.orderAmount}>{formatPrice(order.total_price)}</Text>
                </View>
              </SectionCard>
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
  list: {
    gap: spacing.md,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  cardCopy: {
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
  cardFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  orderType: {
    color: colors.muted,
    fontSize: typography.bodySm,
  },
  orderAmount: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
});
