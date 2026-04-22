import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { courierApi } from '../../src/api/courier-api';
import { ActionButton, AppScreen, Card, Field, SectionTitle } from '../../src/components/ui';
import { formatPhoneInput, isCompletePhoneInput, normalizePhoneValue } from '../../src/lib/phone';
import { useAuthStore } from '../../src/store/auth-store';
import { colors, spacing } from '../../src/theme/tokens';

export default function CourierSignInScreen() {
  const completeAuth = useAuthStore((state) => state.completeAuth);
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const nextErrors: Record<string, string> = {};
    if (!isCompletePhoneInput(phone)) {
      nextErrors.phone = 'Введите телефон в формате +7 (xxx) xxx-xx-xx.';
    }
    if (!password.trim()) {
      nextErrors.password = 'Введите пароль.';
    }
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length > 0) return;

    try {
      setLoading(true);
      const auth = await courierApi.login(normalizePhoneValue(phone), password.trim());
      await completeAuth(auth);
      await queryClient.invalidateQueries();
      router.replace('/orders');
    } catch (error: any) {
      setFormError(error?.message || 'Не удалось войти.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen>
      <View style={styles.hero}>
        <Text style={styles.badge}>SC Courier</Text>
        <SectionTitle
          title="Вход курьера"
          subtitle="После входа откроется экран активных delivery-заказов без истории."
        />
      </View>

      <Card>
        <Field
          label="Телефон / логин"
          value={phone}
          keyboardType="phone-pad"
          placeholder="+7 (999) 123-45-67"
          onChangeText={(value) => {
            setErrors((current) => ({ ...current, phone: '' }));
            setPhone(formatPhoneInput(value));
          }}
          error={errors.phone}
        />
        <Field
          label="Пароль"
          value={password}
          placeholder="Введите пароль"
          secureTextEntry
          onChangeText={(value) => {
            setErrors((current) => ({ ...current, password: '' }));
            setPassword(value);
          }}
          error={errors.password}
        />
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        <ActionButton title="Войти" onPress={handleSubmit} loading={loading} />
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    color: colors.accentDark,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    fontWeight: '700',
  },
  formError: {
    color: colors.danger,
    fontSize: 13,
  },
});
