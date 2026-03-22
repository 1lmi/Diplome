import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { mobileApi } from "@/src/api/mobile-api";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { OrderProgress } from "@/src/components/ui/OrderProgress";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { StatusPill } from "@/src/components/ui/StatusPill";
import { SurfacePanel } from "@/src/components/ui/SurfacePanel";
import { formatDateTime, formatPrice, getDisplayImage } from "@/src/lib/format";
import { buildOrderProgress, getActiveHistoryEntry } from "@/src/lib/order-progress";
import { useAuthStore } from "@/src/store/auth-store";
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

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailCard}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

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

  const order = orderQuery.data;

  const progress = useMemo(
    () => (order ? buildOrderProgress(order) : []),
    [order]
  );
  const activeHistory = useMemo(
    () => (order ? getActiveHistoryEntry(order) : null),
    [order]
  );

  useEffect(() => {
    if (order && !user && phone) {
      saveTracking(order.id, phone);
    }
  }, [order, phone, saveTracking, user]);

  if (orderQuery.isLoading) {
    return (
      <Screen>
        <PageHeader
          showBack
          subtitle="Подгружаем детали заказа"
          title={`Заказ №${orderId || "—"}`}
        />
        <EmptyState
          description="Секунду, собираем статус и состав заказа."
          icon="loader"
          title="Загружаем"
        />
      </Screen>
    );
  }

  if (!order) {
    return (
      <Screen>
        <PageHeader
          showBack
          subtitle="Заказ недоступен"
          title={`Заказ №${orderId || "—"}`}
        />
        <EmptyState
          description="Проверьте номер заказа или попробуйте открыть его из истории."
          icon="alert-circle"
          title="Не удалось открыть заказ"
        />
      </Screen>
    );
  }

  const deliveryLabel = order.delivery_method === "pickup" ? "Самовывоз" : "Доставка";
  const paymentLabel =
    order.payment_method === "card" ? "Картой при получении" : "Наличными";
  const activeStatusText =
    activeHistory?.comment ||
    order.comment ||
    "Мы обновим этот экран, как только статус изменится.";

  return (
    <Screen>
      <PageHeader
        showBack
        subtitle={formatDateTime(order.created_at)}
        title={`Заказ №${order.id}`}
        right={
          <StatusPill
            label={order.status_name}
            tone={order.status === "canceled" ? "danger" : "accent"}
          />
        }
      />

      <View style={styles.summaryRow}>
        <View style={styles.summaryChip}>
          <Text style={styles.summaryChipLabel}>Получение</Text>
          <Text style={styles.summaryChipValue}>{deliveryLabel}</Text>
        </View>
        <View style={styles.summaryChip}>
          <Text style={styles.summaryChipLabel}>Оплата</Text>
          <Text style={styles.summaryChipValue}>{paymentLabel}</Text>
        </View>
        {order.delivery_time ? (
          <View style={styles.summaryChip}>
            <Text style={styles.summaryChipLabel}>Когда</Text>
            <Text style={styles.summaryChipValue}>{order.delivery_time}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.sectionBlock}>
        <SectionBadge label="Статус" tone="accent" />
        <SurfacePanel style={styles.sectionPanel}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Статус заказа</Text>
            <Text style={styles.sectionMeta}>
              {formatDateTime(activeHistory?.changed_at || order.created_at)}
            </Text>
          </View>
          <OrderProgress steps={progress} />
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>{activeHistory?.status_name || order.status_name}</Text>
            <Text style={styles.statusText}>{activeStatusText}</Text>
          </View>
        </SurfacePanel>
      </View>

      <View style={styles.sectionBlock}>
        <SectionBadge label="Состав" tone="soft" />
        <SurfacePanel style={styles.sectionPanel}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Состав заказа</Text>
            <Text style={styles.sectionMeta}>{order.items.length} поз.</Text>
          </View>

          <View style={styles.itemsStack}>
            {order.items.map((item, index) => (
              <View
                key={`${item.product_size_id}-${item.product_name}`}
                style={[styles.lineRow, index > 0 ? styles.lineRowBorder : null]}
              >
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
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Итого</Text>
            <Text style={styles.totalValue}>{formatPrice(order.total_price)}</Text>
          </View>
        </SurfacePanel>
      </View>

      <View style={styles.sectionBlock}>
        <SectionBadge label="Детали" />
        <SurfacePanel style={styles.sectionPanel}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Детали заказа</Text>
          </View>
          <View style={styles.detailsStack}>
            <DetailCard label="Получатель" value={order.customer_name || "—"} />
            <DetailCard label="Телефон" value={order.customer_phone || "—"} />
            <DetailCard label="Получение" value={deliveryLabel} />
            {order.delivery_method === "delivery" ? (
              <DetailCard label="Адрес" value={order.customer_address || "—"} />
            ) : null}
            <DetailCard label="Оплата" value={paymentLabel} />
            {order.delivery_time ? <DetailCard label="Когда" value={order.delivery_time} /> : null}
          </View>
        </SurfacePanel>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  summaryChip: {
    minWidth: 112,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  summaryChipLabel: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  summaryChipValue: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
  sectionBlock: {
    marginTop: spacing.xxl,
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
  sectionPanel: {
    borderWidth: 1,
    borderColor: colors.line,
    gap: spacing.lg,
  },
  sectionHead: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  sectionMeta: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  statusCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceTint,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  statusTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  statusText: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 20,
  },
  itemsStack: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  lineRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  lineImage: {
    width: 60,
    height: 60,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceTint,
  },
  lineCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  lineTitle: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
    lineHeight: 19,
  },
  lineMeta: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  lineAmount: {
    minWidth: 72,
    alignItems: "flex-end",
    gap: spacing.xs,
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
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
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
  detailsStack: {
    gap: spacing.sm,
  },
  detailCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceTint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  detailValue: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
    lineHeight: 20,
  },
});
