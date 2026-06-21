import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { Order, SettingsMap } from "@/src/api/types";
import { mobileApi } from "@/src/api/mobile-api";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { OrderProgress } from "@/src/components/ui/OrderProgress";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { StatusPill } from "@/src/components/ui/StatusPill";
import { SurfacePanel } from "@/src/components/ui/SurfacePanel";
import { formatDateTime, formatPrice, getDisplayImage } from "@/src/lib/format";
import {
  buildOrderProgress,
  getActiveHistoryEntry,
  isTerminalOrderStatus,
} from "@/src/lib/order-progress";
import { useAuthStore } from "@/src/store/auth-store";
import { useTrackingStore } from "@/src/store/tracking-store";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

function normalizeOrderStatus(status?: string | null) {
  return (status || "").trim().toLowerCase();
}

function getNextStep(order: Order) {
  const status = normalizeOrderStatus(order.status);
  const pickup = order.delivery_method === "pickup";

  if (status === "canceled" || status === "cancelled") {
    return {
      title: "Заказ отменён",
      text: "Если это неожиданно, лучше связаться с рестораном и уточнить детали.",
    };
  }

  if (status === "done" || status === "completed" || status === "finished") {
    return {
      title: "Заказ завершён",
      text: pickup ? "Заказ выдан. История останется в профиле." : "Доставка завершена. История останется в профиле.",
    };
  }

  if (status === "cooking") {
    return {
      title: "Кухня готовит заказ",
      text: pickup
        ? "Когда всё будет готово, статус сменится на «Готов». "
        : "Когда заказ соберут, его передадут курьеру.",
    };
  }

  if (status === "ready") {
    return {
      title: pickup ? "Можно забирать" : "Заказ готов",
      text: pickup
        ? "Покажите номер заказа сотруднику при получении."
        : "Заказ ждёт передачи курьеру.",
    };
  }

  if (status === "on_way") {
    return {
      title: "Курьер в пути",
      text: "Держите телефон рядом, если ресторану или курьеру понадобится уточнение.",
    };
  }

  return {
    title: "Заказ принят",
    text: pickup
      ? "Ресторан скоро начнёт готовить заказ к выдаче."
      : "Ресторан скоро начнёт готовить заказ к доставке.",
  };
}

function getContactPhone(settings?: SettingsMap | null) {
  return settings?.contact_phone?.trim() || "";
}

function buildTelUrl(phone: string) {
  const normalized = phone.replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : "";
}

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
    refetchInterval: (query) =>
      isTerminalOrderStatus((query.state.data as { status?: string | null } | undefined)?.status)
        ? false
        : 10_000,
    refetchIntervalInBackground: false,
    refetchOnMount: true,
    refetchOnReconnect: true,
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: mobileApi.getSettings,
    staleTime: 5 * 60_000,
  });

  const order = orderQuery.data;
  const orderRefreshing = orderQuery.isRefetching || settingsQuery.isRefetching;

  const refreshOrder = async () => {
    await Promise.all([orderQuery.refetch(), settingsQuery.refetch()]);
  };

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
      <Screen
        refreshing={orderRefreshing}
        onRefresh={() => {
          void refreshOrder();
        }}
      >
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
      <Screen
        refreshing={orderRefreshing}
        onRefresh={() => {
          void refreshOrder();
        }}
      >
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
  const nextStep = getNextStep(order);
  const contactPhone = getContactPhone(settingsQuery.data);
  const contactPhoneUrl = buildTelUrl(contactPhone);

  return (
    <Screen
      refreshing={orderRefreshing}
      onRefresh={() => {
        void refreshOrder();
      }}
    >
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
          <View style={styles.nextStepCard}>
            <View style={styles.nextStepIcon}>
              <Feather color={colors.accent} name="activity" size={17} />
            </View>
            <View style={styles.nextStepCopy}>
              <Text style={styles.nextStepTitle}>{nextStep.title}</Text>
              <Text style={styles.nextStepText}>{nextStep.text}</Text>
            </View>
          </View>
          <View style={styles.orderActions}>
            <Pressable
              onPress={() => {
                void refreshOrder();
              }}
              style={({ pressed }) => [styles.actionButton, pressed ? styles.actionButtonPressed : null]}
            >
              <Feather color={colors.text} name="refresh-cw" size={15} />
              <Text style={styles.actionButtonText}>Обновить</Text>
            </Pressable>
            {contactPhoneUrl ? (
              <Pressable
                onPress={() => {
                  void Linking.openURL(contactPhoneUrl);
                }}
                style={({ pressed }) => [styles.actionButton, pressed ? styles.actionButtonPressed : null]}
              >
                <Feather color={colors.text} name="phone" size={15} />
                <Text style={styles.actionButtonText}>Позвонить</Text>
              </Pressable>
            ) : null}
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
            {order.cash_change_from ? (
              <DetailCard label="Сдача с" value={formatPrice(order.cash_change_from)} />
            ) : null}
            {order.do_not_call ? <DetailCard label="Связь" value="Не звонить" /> : null}
            {order.delivery_time ? <DetailCard label="Когда" value={order.delivery_time} /> : null}
            {order.comment ? <DetailCard label="Комментарий" value={order.comment} /> : null}
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
  nextStepCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: "rgba(230, 122, 46, 0.22)",
    padding: spacing.md,
    flexDirection: "row",
    gap: spacing.md,
  },
  nextStepIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  nextStepCopy: {
    flex: 1,
    gap: 3,
  },
  nextStepTitle: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  nextStepText: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  orderActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionButton: {
    minHeight: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  actionButtonPressed: {
    opacity: 0.9,
  },
  actionButtonText: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
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
