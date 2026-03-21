import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { mobileApi } from "@/src/api/mobile-api";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { SegmentedControl } from "@/src/components/ui/SegmentedControl";
import { SurfacePanel } from "@/src/components/ui/SurfacePanel";
import { TextField } from "@/src/components/ui/TextField";
import { formatPhoneInput } from "@/src/lib/phone";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const FALLBACK_BIRTH_DATE = new Date(2000, 0, 1);

function parseBirthDate(value: string) {
  if (!value) return FALLBACK_BIRTH_DATE;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? FALLBACK_BIRTH_DATE : parsed;
}

function formatBirthDateLabel(value: string) {
  if (!value) return "Выберите дату";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseBirthDate(value));
}

function formatBirthDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ProfileEditScreen() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [birthDate, setBirthDate] = useState(user?.birth_date || "");
  const [gender, setGender] = useState(user?.gender || "none");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      router.replace("/auth/sign-in");
    }
  }, [user]);

  if (!user) return null;

  const birthDateValue = parseBirthDate(birthDate);

  const handleBirthDateChange = (event: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS !== "android") {
      setShowDatePicker(false);
    }
    if (event.type !== "set" || !value) {
      return;
    }
    setBirthDate(formatBirthDateValue(value));
  };

  const openBirthDatePicker = () => {
    setError("");
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: birthDateValue,
        mode: "date",
        maximumDate: new Date(),
        onChange: handleBirthDateChange,
      });
      return;
    }
    setShowDatePicker((current) => !current);
  };

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
        last_name: null,
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
      <PageHeader
        showBack
        subtitle="Личные данные и отображение профиля"
        title="Редактировать профиль"
      />

      <SurfacePanel>
        <TextField
          editable={false}
          label="Номер телефона"
          value={formatPhoneInput(user.login) || user.login}
        />
        <TextField label="Имя" onChangeText={setFirstName} value={firstName} />

        <View style={styles.group}>
          <Text style={styles.groupLabel}>Дата рождения</Text>
          <Pressable onPress={openBirthDatePicker} style={styles.dateField}>
            <Text style={[styles.dateFieldText, !birthDate ? styles.dateFieldTextMuted : null]}>
              {formatBirthDateLabel(birthDate)}
            </Text>
          </Pressable>
          {Platform.OS !== "android" && showDatePicker ? (
            <View style={styles.datePickerWrap}>
              <DateTimePicker
                display="spinner"
                maximumDate={new Date()}
                mode="date"
                onChange={handleBirthDateChange}
                value={birthDateValue}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>Пол</Text>
          <SegmentedControl
            options={[
              { label: "Не указан", value: "none" },
              { label: "Мужской", value: "male" },
              { label: "Женский", value: "female" },
            ]}
            scrollable
            value={gender}
            onChange={setGender}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <MeatButton fullWidth loading={loading} onPress={handleSave} size="cta">
          Сохранить
        </MeatButton>
      </SurfacePanel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  groupLabel: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.medium,
  },
  dateField: {
    minHeight: 46,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceTint,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  dateFieldText: {
    color: colors.text,
    fontSize: typography.body,
  },
  dateFieldTextMuted: {
    color: colors.muted,
  },
  datePickerWrap: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceStrong,
    overflow: "hidden",
    paddingVertical: spacing.xs,
  },
  error: {
    color: colors.danger,
    fontSize: typography.caption,
  },
});
