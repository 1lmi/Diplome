import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { courierApi } from '@/src/api/courier-api';
import type { Order } from '@/src/api/types';
import { ActionButton, AppScreen, Card, SectionTitle } from '@/src/components/ui';
import { formatPrice, formatReadyAge } from '@/src/lib/format';
import { useAuthStore } from '@/src/store/auth-store';
import { colors, radii, spacing } from '@/src/theme/tokens';

function OrderCard({
  order,
  actionTitle,
  onAction,
  disabled,
}: {
  order: Order;
  actionTitle?: string;
  onAction?: () => void;
  disabled?: boolean;
}) {
  return (
    <Card>
      <View style={styles.rowBetween}>
        <Text style={styles.orderId}>Заказ №{order.id}</Text>
        <Text style={styles.amount}>{formatPrice(order.total_price)}</Text>
      </View>
      <Text style={styles.metaText}>{order.items.length} позиций</Text>
      <Text style={styles.addressText}>{order.customer_address || 'Адрес не указан'}</Text>
      {order.ready_at ? <Text style={styles.metaText}>{formatReadyAge(order.ready_at)}</Text> : null}
      {order.courier_name ? <Text style={styles.metaText}>Курьер: {order.courier_name}</Text> : null}
      {actionTitle && onAction ? (
        <ActionButton title={actionTitle} onPress={onAction} disabled={disabled} />
      ) : null}
    </Card>
  );
}

export default function CourierOrdersScreen() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const logout = useAuthStore((state) => state.logout);

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

  return (
    <AppScreen>
      <View style={styles.headerRow}>
        <SectionTitle
          title="Активные заказы"
          subtitle={`Здравствуйте, ${user?.courier_profile?.display_name || user?.full_name || 'курьер'}.`}
        />
        <ActionButton title="Выйти" variant="secondary" onPress={() => void logout().then(() => router.replace('/auth/sign-in'))} />
      </View>

      {boardQuery.isLoading ? <Text style={styles.metaText}>Загружаем доску заказов...</Text> : null}
      {boardQuery.error && (boardQuery.error as any)?.status !== 401 && (boardQuery.error as any)?.status !== 403 ? (
        <Card>
          <Text style={styles.errorText}>{(boardQuery.error as Error).message}</Text>
          <ActionButton title="Повторить" variant="secondary" onPress={() => void boardQuery.refetch()} />
        </Card>
      ) : null}

      {myActive ? (
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>Мой текущий заказ</Text>
          <OrderCard
            order={myActive}
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
        <Text style={styles.sectionLabel}>Готовые</Text>
        {board?.ready.length ? (
          board.ready.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              actionTitle="Взять"
              onAction={() => handleClaim(order)}
              disabled={Boolean(myActive) || claimMutation.isPending}
            />
          ))
        ) : (
          <Card>
            <Text style={styles.metaText}>Сейчас нет готовых заказов для доставки.</Text>
          </Card>
        )}
      </View>

      <View style={styles.sectionWrap}>
        <Text style={styles.sectionLabel}>Готовятся</Text>
        {board?.cooking.length ? (
          board.cooking.map((order) => <OrderCard key={order.id} order={order} />)
        ) : (
          <Card>
            <Text style={styles.metaText}>Нет delivery-заказов в приготовлении.</Text>
          </Card>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    gap: spacing.md,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  orderId: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  amount: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.accentDark,
  },
  sectionWrap: {
    gap: spacing.md,
  },
  sectionLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  metaText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  addressText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
  },
});
