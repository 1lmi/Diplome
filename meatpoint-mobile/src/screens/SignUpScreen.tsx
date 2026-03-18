import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { mobileApi } from "@/src/api/mobile-api";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { SectionCard } from "@/src/components/ui/SectionCard";
import { SegmentedControl } from "@/src/components/ui/SegmentedControl";
import { TextField } from "@/src/components/ui/TextField";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { useCartStore } from "@/src/store/cart-store";
import { colors, spacing, typography } from "@/src/theme/tokens";

const PASSWORD_POLICY_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

export default function SignUpScreen() {
  const completeAuth = useAuthStore((state) => state.completeAuth);
  const updateCheckoutDraft = useCartStore((state) => state.updateCheckoutDraft);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [login, setLogin] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("none");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const nextErrors: Record<string, string> = {};
    if (!firstName.trim()) nextErrors.firstName = "Укажите имя.";
    if (!login.trim()) nextErrors.login = "Укажите логин.";
    if (!PASSWORD_POLICY_RE.test(password)) {
      nextErrors.password = "Минимум 8 символов, 1 заглавная буква и 1 цифра.";
    }
    if (password !== confirmPassword) {
      nextErrors.confirmPassword = "Пароли не совпадают.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    try {
      setLoading(true);
      const auth = await mobileApi.register(
        firstName.trim(),
        login.trim(),
        password,
        lastName.trim() || undefined,
        birthDate.trim() || undefined,
        gender === "none" ? undefined : gender
      );
      await completeAuth(auth);
      updateCheckoutDraft({
        guestMode: false,
        customerName: auth.user.full_name || auth.user.first_name,
      });
      await queryClient.invalidateQueries();
      pushToast({
        tone: "success",
        title: "Аккаунт создан",
        description: "Теперь можно сохранять адреса и заказы.",
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
      <PageHeader showBack subtitle="Создайте аккаунт для быстрых заказов" title="Регистрация" />

      <SectionCard>
        <Text style={styles.title}>Новый аккаунт</Text>
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
          label="Фамилия"
          onChangeText={setLastName}
          placeholder="Фамилия"
          value={lastName}
        />
        <TextField
          autoCapitalize="none"
          error={errors.login}
          label="Логин"
          onChangeText={(value) => {
            setErrors((current) => ({ ...current, login: "" }));
            setLogin(value);
          }}
          placeholder="Придумайте логин"
          value={login}
        />
        <TextField
          helper="Формат YYYY-MM-DD"
          label="Дата рождения"
          onChangeText={setBirthDate}
          placeholder="2000-12-31"
          value={birthDate}
        />
        <View style={styles.group}>
          <Text style={styles.groupLabel}>Пол</Text>
          <SegmentedControl
            options={[
              { label: "Не указан", value: "none" },
              { label: "Мужской", value: "male" },
              { label: "Женский", value: "female" },
            ]}
            value={gender}
            onChange={setGender}
            scrollable
          />
        </View>
        <TextField
          error={errors.password}
          helper="Минимум 8 символов, 1 заглавная буква и 1 цифра."
          label="Пароль"
          onChangeText={(value) => {
            setErrors((current) => ({ ...current, password: "" }));
            setPassword(value);
          }}
          placeholder="Введите пароль"
          secureTextEntry
          value={password}
        />
        <TextField
          error={errors.confirmPassword}
          label="Повторите пароль"
          onChangeText={(value) => {
            setErrors((current) => ({ ...current, confirmPassword: "" }));
            setConfirmPassword(value);
          }}
          placeholder="Повторите пароль"
          secureTextEntry
          value={confirmPassword}
        />
        <MeatButton fullWidth loading={loading} onPress={handleSubmit} size="cta">
          Создать аккаунт
        </MeatButton>
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: typography.titleSm,
    fontWeight: typography.semibold,
  },
  group: {
    gap: spacing.sm,
  },
  groupLabel: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.medium,
  },
});
