import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { courierApi } from '../../../src/api/courier-api';
import type { Order } from '../../../src/api/types';
import { ActionButton, AppScreen, Card, IconButton } from '../../../src/components/ui';
import { formatPrice, formatReadyAge } from '../../../src/lib/format';
import { useAuthStore } from '../../../src/store/auth-store';
import { colors, radii, spacing } from '../../../src/theme/tokens';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function InfoLine({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.infoLine}>
      <Ionicons name={icon} size={15} color={colors.muted} />
      <Text style={styles.infoText} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

function StatusBadge({ order }: { order: Order }) {
  const isOnWay = order.status === 'on_way';
  const label = isOnWay ? 'В пути' : order.status === 'ready' ? 'Готов' : 'Готовится';
  return (
    <View style={[styles.statusBadge, isOnWay ? styles.statusBadgeActive : null]}>
      <Text style={[styles.statusBadgeText, isOnWay ? styles.statusBadgeTextActive : null]}>
        {label}
      </Text>
    </View>
  );
}

function SummaryTile({
  label,
  value,
  icon,
  tone,
  delay,
}: {
  label: string;
  value: string;
  icon: IconName;
  tone: 'orange' | 'green' | 'amber';
  delay: number;
}) {
  const iconStyle =
    tone === 'green'
      ? styles.summaryIconGreen
      : tone === 'amber'
        ? styles.summaryIconAmber
        : styles.summaryIconOrange;
  const iconColor = tone === 'green' ? colors.success : tone === 'amber' ? colors.warning : colors.accent;

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify().damping(16)}
      layout={LinearTransition.springify().damping(18)}
      style={styles.summaryTile}
    >
      <View style={[styles.summaryIcon, iconStyle]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </Animated.View>
  );
}

function OrderCard({
  order,
  actionTitle,
  onAction,
  disabled,
  index,
  featured,
}: {
  order: Order;
  actionTitle?: string;
  onAction?: () => void;
  disabled?: boolean;
  index: number;
  featured?: boolean;
}) {
  const actionIcon: IconName =
    order.status === 'on_way' ? 'navigate-outline' : actionTitle === 'Взять' ? 'bag-check-outline' : 'list-outline';

  return (
    <Animated.View
      entering={FadeInDown.delay(90 + index * 45).springify().damping(17)}
      layout={LinearTransition.springify().damping(18)}
    >
      <Card style={[styles.orderCard, featured ? styles.orderCardFeatured : null]}>
        <View style={styles.orderTop}>
          <View style={styles.orderTitleWrap}>
            <Text style={styles.orderId}>Заказ №{order.id}</Text>
            <StatusBadge order={order} />
          </View>
          <Text style={styles.amount}>{formatPrice(order.total_price)}</Text>
        </View>

        <View style={styles.orderMetaGrid}>
          <InfoLine icon="basket-outline" text={`${order.items.length} позиций`} />
          {order.ready_at ? <InfoLine icon="time-outline" text={formatReadyAge(order.ready_at)} /> : null}
        </View>

        <InfoLine icon="location-outline" text={order.customer_address || 'Адрес не указан'} />
        {order.courier_name ? <InfoLine icon="person-outline" text={`Курьер: ${order.courier_name}`} /> : null}

        {actionTitle && onAction ? (
          <ActionButton
            title={actionTitle}
            icon={actionIcon}
            onPress={onAction}
            disabled={disabled}
            variant={featured ? 'primary' : 'secondary'}
          />
        ) : null}
      </Card>
    </Animated.View>
  );
}

export default function CourierOrdersScreen() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  const boardQuery = useQuery({
    queryKey: ['courier-board'],
    queryFn: courierApi.getBoard,
    refetchInterval: 10_000,
  });

  useEffect(() => {
    const status = (boardQuery.error as Error & { status?: number } | null)?.status;
    if (status === 401 || status === 403) {
      void clearSession().then(() => router.replace('/auth/sign-in'));
    }
  }, [boardQuery.error, clearSession]);

  const claimMutation = useMutation({
    mutationFn: (orderId: number) => courierApi.claimOrder(orderId),
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: ['courier-board'] });
      router.push(`/orders/checklist/${order.id}`);
    },
    onError: (error: Error) => {
      Alert.alert('Не удалось взять заказ', error.message);
    },
  });

  const handleClaim = (order: Order) => {
    Alert.alert(
      'Подтвердить взятие',
      `Подтвердить, что вы берёте заказ №${order.id} в доставку?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Подтвердить',
          onPress: () => claimMutation.mutate(order.id),
        },
      ]
    );
  };

  const board = boardQuery.data;
  const myActive = board?.my_active || null;
  const displayName = user?.courier_profile?.display_name || user?.full_name || 'курьер';
  const readyCount = board?.ready.length ?? 0;
  const cookingCount = board?.cooking.length ?? 0;

  return (
    <AppScreen>
      <Animated.View entering={FadeInDown.duration(360)} style={styles.hero}>
        <View style={styles.heroText}>
          <Text style={styles.eyebrow}>Смена активна</Text>
          <Text style={styles.title}>Работа, {displayName}</Text>
          <Text style={styles.subtitle}>
            Доска обновляется автоматически. Берите один заказ за раз и двигайтесь по шагам.
          </Text>
        </View>
        <IconButton
          icon="refresh-outline"
          label="Обновить заказы"
          onPress={() => void boardQuery.refetch()}
          disabled={boardQuery.isFetching}
        />
      </Animated.View>

      <View style={styles.summaryRow}>
        <SummaryTile
          label="Текущий"
          value={myActive ? `№${myActive.id}` : 'Нет'}
          icon="navigate-circle-outline"
          tone="orange"
          delay={70}
        />
        <SummaryTile label="Готовы" value={String(readyCount)} icon="bag-check-outline" tone="green" delay={120} />
        <SummaryTile label="Готовятся" value={String(cookingCount)} icon="flame-outline" tone="amber" delay={170} />
      </View>

      {boardQuery.isLoading ? <Text style={styles.metaText}>Загружаем доску заказов...</Text> : null}
      {boardQuery.error && (boardQuery.error as any)?.status !== 401 && (boardQuery.error as any)?.status !== 403 ? (
        <Card>
          <Text style={styles.errorText}>{(boardQuery.error as Error).message}</Text>
          <ActionButton
            title="Повторить"
            icon="refresh-outline"
            variant="secondary"
            onPress={() => void boardQuery.refetch()}
          />
        </Card>
      ) : null}

      {myActive ? (
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Мой текущий заказ</Text>
            <Text style={styles.sectionHint}>Продолжите маршрут</Text>
          </View>
          <OrderCard
            order={myActive}
            featured
            index={0}
            actionTitle={myActive.status === 'on_way' ? 'Открыть доставку' : 'Открыть чек-лист'}
            onAction={() =>
              router.push(
                myActive.status === 'on_way'
                  ? `/orders/delivery/${myActive.id}`
                  : `/orders/checklist/${myActive.id}`
              )
            }
          />
        </View>
      ) : null}

      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Готовые</Text>
          <Text style={styles.sectionHint}>{readyCount} доступно</Text>
        </View>
        {board?.ready.length ? (
          board.ready.map((order, index) => (
            <OrderCard
              key={order.id}
              order={order}
              index={index + 1}
              actionTitle="Взять"
              onAction={() => handleClaim(order)}
              disabled={Boolean(myActive) || claimMutation.isPending}
            />
          ))
        ) : (
          <Card style={styles.emptyCard}>
            <Ionicons name="checkmark-done-outline" size={22} color={colors.success} />
            <Text style={styles.metaText}>Сейчас нет готовых заказов для доставки.</Text>
          </Card>
        )}
      </View>

      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Готовятся</Text>
          <Text style={styles.sectionHint}>{cookingCount} в работе кухни</Text>
        </View>
        {board?.cooking.length ? (
          board.cooking.map((order, index) => <OrderCard key={order.id} order={order} index={index + 5} />)
        ) : (
          <Card style={styles.emptyCard}>
            <Ionicons name="restaurant-outline" size={22} color={colors.warning} />
            <Text style={styles.metaText}>Нет delivery-заказов в приготовлении.</Text>
          </Card>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroText: {
    flex: 1,
    gap: spacing.xs,
  },
  eyebrow: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.successSoft,
    color: colors.success,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryTile: {
    flex: 1,
    minHeight: 98,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIconOrange: {
    backgroundColor: colors.accentSoft,
  },
  summaryIconGreen: {
    backgroundColor: colors.successSoft,
  },
  summaryIconAmber: {
    backgroundColor: colors.warningSoft,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  sectionWrap: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  sectionHint: {
    color: colors.muted,
    fontSize: 13,
  },
  orderCard: {
    gap: spacing.md,
  },
  orderCardFeatured: {
    borderColor: '#ffd5b8',
    backgroundColor: colors.surfaceRaised,
  },
  orderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  orderTitleWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  orderId: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accentDark,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    backgroundColor: colors.surfaceMuted,
  },
  statusBadgeActive: {
    backgroundColor: colors.accentSoft,
  },
  statusBadgeText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadgeTextActive: {
    color: colors.accentDark,
  },
  orderMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  infoLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    flexShrink: 1,
  },
  infoText: {
    flexShrink: 1,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
  },
});
