import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { courierApi } from '@/src/api/courier-api';
import { ActionButton, AppScreen, Card, SectionTitle } from '@/src/components/ui';
import { formatPrice } from '@/src/lib/format';
import { useAuthStore } from '@/src/store/auth-store';
import { colors, radii, spacing } from '@/src/theme/tokens';

export default function CourierChecklistScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const orderId = Number(params.id);
  const queryClient = useQueryClient();
  const clearSession = useAuthStore((state) => state.clearSession);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const orderQuery = useQuery({
    queryKey: ['courier-order', orderId],
    queryFn: () => courierApi.getOrder(orderId),
    enabled: Number.isFinite(orderId),
  });

  useEffect(() => {
    const status = (orderQuery.error as Error & { status?: number } | null)?.status;
    if (status === 401) {
      void clearSession().then(() => router.replace('/auth/sign-in'));
      return;
    }
    if (status === 403 && (orderQuery.error as Error)?.message.includes('доступ отключён')) {
      void clearSession().then(() => router.replace('/auth/sign-in'));
      return;
    }
    if (status === 403) {
      Alert.alert('Нет доступа', (orderQuery.error as Error).message, [
        { text: 'Назад', onPress: () => router.replace('/orders') },
      ]);
    }
  }, [orderQuery.error, clearSession]);

  useEffect(() => {
    if (!orderQuery.data) return;
    const next: Record<string, boolean> = {};
    orderQuery.data.items.forEach((item, index) => {
      next[`${item.product_size_id}-${index}`] = false;
    });
    setChecked(next);
  }, [orderQuery.data?.id]);

  const startMutation = useMutation({
    mutationFn: () => courierApi.startDelivery(orderId),
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: ['courier-board'] });
      await queryClient.invalidateQueries({ queryKey: ['courier-order', orderId] });
      router.replace(`/orders/delivery/${order.id}`);
    },
    onError: (error: Error) => {
      Alert.alert('Не удалось начать доставку', error.message);
    },
  });

  const allChecked = useMemo(() => {
    const values = Object.values(checked);
    return values.length > 0 && values.every(Boolean);
  }, [checked]);

  const order = orderQuery.data;

  return (
    <AppScreen>
      <SectionTitle
        title={`Чек-лист заказа №${orderId}`}
        subtitle="Перед стартом доставки отметьте каждую позицию заказа."
      />

      {orderQuery.isLoading ? <Text style={styles.metaText}>Загружаем заказ...</Text> : null}

      {order ? (
        <>
          <Card>
            <Text style={styles.infoText}>Позиций: {order.items.length}</Text>
            <Text style={styles.infoText}>Сумма: {formatPrice(order.total_price)}</Text>
            <Text style={styles.infoText}>Адрес: {order.customer_address || '—'}</Text>
          </Card>

          <View style={styles.listWrap}>
            {order.items.map((item, index) => {
              const key = `${item.product_size_id}-${index}`;
              const isChecked = checked[key] || false;
              return (
                <Pressable
                  key={key}
                  style={[styles.checkRow, isChecked ? styles.checkRowActive : null]}
                  onPress={() => setChecked((prev) => ({ ...prev, [key]: !prev[key] }))}
                >
                  <View style={[styles.checkbox, isChecked ? styles.checkboxActive : null]}>
                    {isChecked ? <Text style={styles.checkboxTick}>✓</Text> : null}
                  </View>
                  <View style={styles.checkContent}>
                    <Text style={styles.checkTitle}>{item.product_name}</Text>
                    <Text style={styles.metaText}>
                      {item.quantity} шт. · {formatPrice(item.line_total)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <ActionButton
            title="Начать доставку"
            onPress={() => startMutation.mutate()}
            disabled={!allChecked}
            loading={startMutation.isPending}
          />
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  metaText: {
    color: colors.muted,
    fontSize: 14,
  },
  infoText: {
    color: colors.text,
    fontSize: 15,
  },
  listWrap: {
    gap: spacing.md,
  },
  checkRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  checkRowActive: {
    borderColor: colors.success,
    backgroundColor: '#eefaf4',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  checkboxActive: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  checkboxTick: {
    color: '#fff',
    fontWeight: '700',
  },
  checkContent: {
    flex: 1,
    gap: spacing.xs,
  },
  checkTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
