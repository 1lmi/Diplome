import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { courierApi } from '@/src/api/courier-api';
import { ActionButton, BaseAppScreen, Card, SectionTitle } from '@/src/components/ui';
import { formatPrice } from '@/src/lib/format';
import { useAuthStore } from '@/src/store/auth-store';
import { colors, spacing } from '@/src/theme/tokens';

export default function CourierDeliveryScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const orderId = Number(params.id);
  const queryClient = useQueryClient();
  const clearSession = useAuthStore((state) => state.clearSession);

  const orderQuery = useQuery({
    queryKey: ['courier-order', orderId],
    queryFn: () => courierApi.getOrder(orderId),
    enabled: Number.isFinite(orderId),
    refetchInterval: 10_000,
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
  }, [orderQuery.error, clearSession]);

  const completeMutation = useMutation({
    mutationFn: () => courierApi.completeDelivery(orderId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['courier-board'] });
      await queryClient.invalidateQueries({ queryKey: ['courier-order', orderId] });
      router.replace('/orders');
    },
    onError: (error: Error) => {
      Alert.alert('Не удалось завершить доставку', error.message);
    },
  });

  const order = orderQuery.data;

  const handleCall = async () => {
    if (!order?.customer_phone) return;
    await Linking.openURL(`tel:${order.customer_phone}`);
  };

  const handleMaps = async () => {
    if (!order?.customer_address) return;
    await Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.customer_address)}`
    );
  };

  const handleComplete = () => {
    Alert.alert('Подтвердить завершение', `Подтвердить, что заказ №${orderId} доставлен?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Доставлено', onPress: () => completeMutation.mutate() },
    ]);
  };

  return (
    <BaseAppScreen
      footer={
        order ? (
          <>
            <View style={styles.footerRow}>
              <View style={styles.footerButtonWrap}>
                <ActionButton
                  title="Позвонить"
                  variant="secondary"
                  onPress={() => void handleCall()}
                  disabled={!order.customer_phone}
                />
              </View>
              <View style={styles.footerButtonWrap}>
                <ActionButton
                  title="Открыть в картах"
                  variant="secondary"
                  onPress={() => void handleMaps()}
                  disabled={!order.customer_address}
                />
              </View>
            </View>

            <ActionButton
              title="Доставлено"
              variant="danger"
              onPress={handleComplete}
              loading={completeMutation.isPending}
            />
          </>
        ) : null
      }
    >
      <SectionTitle
        title={`Доставка №${orderId}`}
        subtitle="Проверьте адрес и состав заказа. После вручения нажмите «Доставлено»."
      />

      {orderQuery.isLoading ? <Text style={styles.metaText}>Загружаем данные клиента...</Text> : null}

      {order ? (
        <>
          <Card>
            <View style={styles.infoBlock}>
              <Text style={styles.label}>Получатель</Text>
              <Text style={styles.value}>{order.customer_name || 'Гость'}</Text>
            </View>
            <View style={styles.infoBlock}>
              <Text style={styles.label}>Телефон</Text>
              <Text style={styles.value}>{order.customer_phone || '—'}</Text>
            </View>
            <View style={styles.infoBlock}>
              <Text style={styles.label}>Адрес</Text>
              <Text style={styles.value}>{order.customer_address || '—'}</Text>
            </View>
          </Card>

          <Card>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Состав заказа</Text>
              <Text style={styles.sectionMeta}>{order.items.length} поз.</Text>
            </View>

            <View style={styles.itemsWrap}>
              {order.items.map((item, index) => (
                <View
                  key={`${item.product_size_id}-${index}`}
                  style={[styles.itemRow, index > 0 ? styles.itemRowBorder : null]}
                >
                  <View style={styles.itemMain}>
                    <Text style={styles.itemTitle}>{item.product_name}</Text>
                    {item.size_name ? <Text style={styles.itemMeta}>{item.size_name}</Text> : null}
                  </View>
                  <View style={styles.itemAmount}>
                    <Text style={styles.itemMeta}>×{item.quantity}</Text>
                    <Text style={styles.itemPrice}>{formatPrice(item.line_total)}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Итого</Text>
              <Text style={styles.totalValue}>{formatPrice(order.total_price)}</Text>
            </View>
          </Card>
        </>
      ) : null}
    </BaseAppScreen>
  );
}

const styles = StyleSheet.create({
  metaText: {
    color: colors.muted,
    fontSize: 14,
  },
  infoBlock: {
    gap: spacing.xs,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  footerButtonWrap: {
    flex: 1,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  sectionMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  itemsWrap: {
    gap: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  itemRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  itemMain: {
    flex: 1,
    gap: spacing.xs,
  },
  itemTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  itemMeta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  itemAmount: {
    minWidth: 72,
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  itemPrice: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  totalLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  totalValue: {
    color: colors.accentDark,
    fontSize: 18,
    fontWeight: '700',
  },
});
