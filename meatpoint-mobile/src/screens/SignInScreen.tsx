import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { mobileApi } from "@/src/api/mobile-api";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { SectionCard } from "@/src/components/ui/SectionCard";
import { TextField } from "@/src/components/ui/TextField";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { useCartStore } from "@/src/store/cart-store";
import { colors, spacing, typography } from "@/src/theme/tokens";

export default function SignInScreen() {
  const completeAuth = useAuthStore((state) => state.completeAuth);
  const updateCheckoutDraft = useCartStore((state) => state.updateCheckoutDraft);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const nextErrors: Record<string, string> = {};
    if (!login.trim()) nextErrors.login = "Укажите логин.";
    if (!password) nextErrors.password = "Введите пароль.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    try {
      setLoading(true);
      const auth = await mobileApi.login(login.trim(), password);
      await completeAuth(auth);
      updateCheckoutDraft({
        guestMode: false,
        customerName: auth.user.full_name || auth.user.first_name,
      });
      await queryClient.invalidateQueries();
      pushToast({
        tone: "success",
        title: "Вход выполнен",
        description: "Профиль и адреса уже готовы.",
      });
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/profile");
      }
    } catch (error: any) {
      pushToast({
        tone: "error",
        title: "Не удалось войти",
        description: error?.message || "Проверьте логин и пароль.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen keyboard>
      <PageHeader showBack subtitle="Войдите, чтобы хранить адреса и историю" title="Вход" />

      <SectionCard>
        <Text style={styles.title}>Добро пожаловать</Text>
        <TextField
          autoCapitalize="none"
          error={errors.login}
          label="Логин"
          onChangeText={(value) => {
            setErrors((current) => ({ ...current, login: "" }));
            setLogin(value);
          }}
          placeholder="Введите логин"
          value={login}
        />
        <TextField
          error={errors.password}
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
          Войти
        </MeatButton>
      </SectionCard>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Нет аккаунта?</Text>
        <MeatButton onPress={() => router.replace("/auth/sign-up")} variant="ghost">
          Создать
        </MeatButton>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: typography.titleSm,
    fontWeight: typography.semibold,
  },
  footer: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  footerText: {
    color: colors.muted,
    fontSize: typography.bodySm,
  },
});
