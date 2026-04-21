import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { courierApi } from '@/src/api/courier-api';
import { ActionButton, AppScreen, Card, SectionTitle } from '@/src/components/ui';
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
    <AppScreen>
      <SectionTitle
        title={`Доставка №${orderId}`}
        subtitle="После вручения нажмите «Доставлено» и подтвердите действие."
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

          <View style={styles.actionsWrap}>
            <ActionButton title="Позвонить" variant="secondary" onPress={() => void handleCall()} disabled={!order.customer_phone} />
            <ActionButton title="Открыть в картах" variant="secondary" onPress={() => void handleMaps()} disabled={!order.customer_address} />
          </View>

          <ActionButton
            title="Доставлено"
            variant="danger"
            onPress={handleComplete}
            loading={completeMutation.isPending}
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
  actionsWrap: {
    gap: spacing.md,
  },
});
