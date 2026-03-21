import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { mobileApi } from "@/src/api/mobile-api";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { SurfacePanel } from "@/src/components/ui/SurfacePanel";
import { TextField } from "@/src/components/ui/TextField";
import {
  formatPhoneInput,
  isCompletePhoneInput,
  normalizePhoneValue,
} from "@/src/lib/phone";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { useCartStore } from "@/src/store/cart-store";
import { colors, spacing, typography } from "@/src/theme/tokens";

export default function SignUpScreen() {
  const completeAuth = useAuthStore((state) => state.completeAuth);
  const updateCheckoutDraft = useCartStore((state) => state.updateCheckoutDraft);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const nextErrors: Record<string, string> = {};
    if (!firstName.trim()) {
      nextErrors.firstName = "Укажите имя.";
    }
    if (!isCompletePhoneInput(phone)) {
      nextErrors.phone = "Укажите номер телефона в формате +7 (xxx) xxx-xx-xx.";
    }
    if (password.trim().length < 6) {
      nextErrors.password = "Пароль должен быть не короче 6 символов.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    try {
      setLoading(true);
      const auth = await mobileApi.register(
        firstName.trim(),
        normalizePhoneValue(phone),
        password
      );
      await completeAuth(auth);
      updateCheckoutDraft({
        guestMode: false,
        customerName: auth.user.full_name || auth.user.first_name,
        customerPhone: auth.user.login,
      });
      await queryClient.invalidateQueries();
      pushToast({
        tone: "success",
        title: "Аккаунт создан",
        description: "Теперь можно сохранять адреса и отслеживать заказы.",
      });
      router.replace("/profile");
    } catch (error: any) {
      pushToast({
        tone: "error",
        title: "Не удалось зарегистрироваться",
        description: error?.message || "Проверьте введённые данные.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen keyboard>
      <PageHeader
        showBack
        subtitle="Новый аккаунт для быстрых заказов и сохранённых адресов"
        title="Регистрация"
      />

      <View style={styles.intro}>
        <Text style={styles.introTitle}>Новый аккаунт</Text>
        <Text style={styles.introCopy}>
          Укажите имя, номер телефона и пароль. Этого достаточно, чтобы войти и
          сохранить адреса.
        </Text>
      </View>

      <SurfacePanel>
        <TextField
          error={errors.firstName}
          label="Имя"
          onChangeText={(value) => {
            setErrors((current) => ({ ...current, firstName: "" }));
            setFirstName(value);
          }}
          placeholder="Имя"
          value={firstName}
        />
        <TextField
          error={errors.phone}
          keyboardType="phone-pad"
          label="Номер телефона"
          onChangeText={(value) => {
            setErrors((current) => ({ ...current, phone: "" }));
            setPhone(formatPhoneInput(value));
          }}
          placeholder="+7 (999) 123-45-67"
          value={phone}
        />
        <TextField
          error={errors.password}
          helper="Минимум 6 символов."
          label="Пароль"
          onChangeText={(value) => {
            setErrors((current) => ({ ...current, password: "" }));
            setPassword(value);
          }}
          placeholder="Введите пароль"
          secureTextEntry
          value={password}
        />
        <MeatButton fullWidth loading={loading} onPress={handleSubmit} size="cta">
          Создать аккаунт
        </MeatButton>
      </SurfacePanel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  introTitle: {
    color: colors.text,
    fontSize: typography.titleSm,
    fontWeight: typography.semibold,
  },
  introCopy: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 20,
    maxWidth: 320,
  },
});
