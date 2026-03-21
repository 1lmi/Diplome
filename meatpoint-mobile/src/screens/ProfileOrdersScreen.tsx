import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { mobileApi } from "@/src/api/mobile-api";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { ListRow } from "@/src/components/ui/ListRow";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { StatusPill } from "@/src/components/ui/StatusPill";
import { SurfacePanel } from "@/src/components/ui/SurfacePanel";
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
            <SurfacePanel key={order.id} compact>
              <ListRow
                onPress={() =>
                  router.push({
                    pathname: "/order/[id]",
                    params: { id: String(order.id) },
                  })
                }
                subtitle={formatDateTime(order.created_at)}
                title={`Заказ №${order.id}`}
                trailing={
                  <StatusPill
                    label={order.status_name}
                    tone={order.status === "canceled" ? "danger" : "accent"}
                  />
                }
              />
              <View style={styles.cardFoot}>
                <Text style={styles.orderType}>
                  {order.delivery_method === "pickup" ? "Самовывоз" : "Доставка"}
                </Text>
                <Text style={styles.orderAmount}>{formatPrice(order.total_price)}</Text>
              </View>
            </SurfacePanel>
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
  cardFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
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
