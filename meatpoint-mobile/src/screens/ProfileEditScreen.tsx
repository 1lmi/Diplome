import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { mobileApi } from "@/src/api/mobile-api";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { SectionCard } from "@/src/components/ui/SectionCard";
import { SegmentedControl } from "@/src/components/ui/SegmentedControl";
import { TextField } from "@/src/components/ui/TextField";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { colors, typography } from "@/src/theme/tokens";

export default function ProfileEditScreen() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [birthDate, setBirthDate] = useState(user?.birth_date || "");
  const [gender, setGender] = useState(user?.gender || "none");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      router.replace("/auth/sign-in");
    }
  }, [user]);

  if (!user) return null;

  const handleSave = async () => {
    if (!firstName.trim()) {
      setError("Имя не может быть пустым.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const nextUser = await mobileApi.updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        birth_date: birthDate.trim() || null,
        gender: gender === "none" ? null : gender,
      });
      updateUser(nextUser);
      await queryClient.invalidateQueries({ queryKey: ["me-orders"] });
      pushToast({
        tone: "success",
        title: "Профиль обновлён",
        description: "Изменения сохранены.",
      });
      router.back();
    } catch (err: any) {
      setError(err?.message || "Не удалось сохранить изменения.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen keyboard>
      <PageHeader showBack subtitle="Обновите свои данные" title="Личные данные" />

      <SectionCard>
        <TextField label="Логин" value={user.login} editable={false} />
        <TextField label="Имя" onChangeText={setFirstName} value={firstName} />
        <TextField label="Фамилия" onChangeText={setLastName} value={lastName} />
        <TextField
          helper="Формат YYYY-MM-DD"
          label="Дата рождения"
          onChangeText={setBirthDate}
          value={birthDate}
        />
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
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <MeatButton fullWidth loading={loading} onPress={handleSave} size="cta">
          Сохранить
        </MeatButton>
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: {
    color: colors.danger,
    fontSize: typography.caption,
  },
});
