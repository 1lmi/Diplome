import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import { mobileApi } from "@/src/api/mobile-api";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { OrderProgress } from "@/src/components/ui/OrderProgress";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { SectionCard } from "@/src/components/ui/SectionCard";
import { StatusPill } from "@/src/components/ui/StatusPill";
import {
  formatDateTime,
  formatPrice,
  getDisplayImage,
} from "@/src/lib/format";
import { buildOrderProgress, getActiveHistoryEntry } from "@/src/lib/order-progress";
import { useAuthStore } from "@/src/store/auth-store";
import { useTrackingStore } from "@/src/store/tracking-store";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export default function OrderScreen() {
  const params = useLocalSearchParams<{ id: string; phone?: string | string[] }>();
  const user = useAuthStore((state) => state.user);
  const trackedItems = useTrackingStore((state) => state.items);
  const saveTracking = useTrackingStore((state) => state.save);
  const orderId = Number(params.id);

  const phoneFromParams = typeof params.phone === "string" ? params.phone : undefined;
  const trackedPhone = trackedItems.find((item) => item.orderId === orderId)?.phone;
  const phone = phoneFromParams || trackedPhone;

  const orderQuery = useQuery({
    queryKey: ["order", orderId, phone || "auth"],
    queryFn: () => mobileApi.getOrder(orderId, phone),
    enabled: Number.isFinite(orderId) && orderId > 0,
  });

  const progress = useMemo(
    () => (orderQuery.data ? buildOrderProgress(orderQuery.data) : []),
    [orderQuery.data]
  );
  const activeHistory = useMemo(
    () => (orderQuery.data ? getActiveHistoryEntry(orderQuery.data) : null),
    [orderQuery.data]
  );

  if (orderQuery.data && !user && phone) {
    saveTracking(orderQuery.data.id, phone);
  }

  if (orderQuery.isLoading) {
    return (
      <Screen>
        <PageHeader showBack subtitle="Подгружаем детали" title={`Заказ №${orderId || "—"}`} />
        <EmptyState description="Секунду, собираем статус и состав заказа." icon="loader" title="Загружаем" />
      </Screen>
    );
  }

  if (!orderQuery.data) {
    return (
      <Screen>
        <PageHeader showBack subtitle="Заказ недоступен" title={`Заказ №${orderId || "—"}`} />
        <EmptyState
          description="Проверьте номер заказа или попробуйте открыть его из истории."
          icon="alert-circle"
          title="Не удалось открыть заказ"
        />
      </Screen>
    );
  }

  const order = orderQuery.data;

  return (
    <Screen>
      <PageHeader
        showBack
        subtitle={formatDateTime(order.created_at)}
        title={`Заказ №${order.id}`}
        right={<StatusPill label={order.status_name} tone={order.status === "canceled" ? "danger" : "accent"} />}
      />

      <SectionCard>
        <Text style={styles.sectionTitle}>Статус заказа</Text>
        <OrderProgress steps={progress} />
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>{activeHistory?.status_name || order.status_name}</Text>
          <Text style={styles.statusMeta}>
            {formatDateTime(activeHistory?.changed_at || order.created_at)}
          </Text>
          <Text style={styles.statusText}>
            {activeHistory?.comment || order.comment || "Мы обновим этот экран, как только статус изменится."}
          </Text>
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Состав заказа</Text>
        {order.items.map((item) => (
          <View key={`${item.product_size_id}-${item.product_name}`} style={styles.lineRow}>
            <Image
              contentFit="cover"
              source={{ uri: getDisplayImage(item.image_url) }}
              style={styles.lineImage}
            />
            <View style={styles.lineCopy}>
              <Text style={styles.lineTitle}>{item.product_name}</Text>
              {item.size_name ? <Text style={styles.lineMeta}>{item.size_name}</Text> : null}
            </View>
            <View style={styles.lineAmount}>
              <Text style={styles.lineQty}>×{item.quantity}</Text>
              <Text style={styles.linePrice}>{formatPrice(item.line_total)}</Text>
            </View>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Итого</Text>
          <Text style={styles.totalValue}>{formatPrice(order.total_price)}</Text>
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Детали</Text>
        <DetailRow label="Получатель" value={order.customer_name || "—"} />
        <DetailRow label="Телефон" value={order.customer_phone || "—"} />
        <DetailRow
          label="Получение"
          value={order.delivery_method === "pickup" ? "Самовывоз" : "Доставка"}
        />
        {order.delivery_method === "delivery" ? (
          <DetailRow label="Адрес" value={order.customer_address || "—"} />
        ) : null}
        <DetailRow
          label="Оплата"
          value={order.payment_method === "card" ? "Картой при получении" : "Наличными"}
        />
        {order.delivery_time ? <DetailRow label="Когда" value={order.delivery_time} /> : null}
      </SectionCard>
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  statusCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statusTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  statusMeta: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  statusText: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 20,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lineImage: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
  },
  lineCopy: {
    flex: 1,
    gap: 4,
  },
  lineTitle: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  lineMeta: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  lineAmount: {
    alignItems: "flex-end",
    gap: 4,
  },
  lineQty: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  linePrice: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
  },
  totalLabel: {
    color: colors.muted,
    fontSize: typography.bodySm,
  },
  totalValue: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  detailRow: {
    gap: 4,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  detailValue: {
    color: colors.text,
    fontSize: typography.bodySm,
    lineHeight: 19,
    fontWeight: typography.medium,
  },
});
