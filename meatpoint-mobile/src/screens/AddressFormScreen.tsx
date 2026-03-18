import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { mobileApi } from "@/src/api/mobile-api";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { SectionCard } from "@/src/components/ui/SectionCard";
import { TextField } from "@/src/components/ui/TextField";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export function AddressFormScreen({ addressId }: { addressId?: number | null }) {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const addressesQuery = useQuery({
    queryKey: ["addresses"],
    queryFn: mobileApi.getMyAddresses,
    enabled: Boolean(user),
  });

  const editingAddress = useMemo(
    () =>
      addressId
        ? addressesQuery.data?.find((item) => item.id === addressId) || null
        : null,
    [addressId, addressesQuery.data]
  );

  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      router.replace("/auth/sign-in");
    }
  }, [user]);

  useEffect(() => {
    if (!editingAddress) return;
    setLabel(editingAddress.label || "");
    setAddress(editingAddress.address);
    setIsDefault(editingAddress.is_default);
  }, [editingAddress]);

  if (!user) return null;

  const handleSave = async () => {
    if (!address.trim()) {
      setError("Введите адрес.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      if (editingAddress) {
        await mobileApi.updateAddress(editingAddress.id, {
          label: label.trim() || null,
          address: address.trim(),
          is_default: isDefault,
        });
      } else {
        await mobileApi.createAddress({
          label: label.trim() || null,
          address: address.trim(),
          is_default: isDefault,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      pushToast({
        tone: "success",
        title: editingAddress ? "Адрес обновлён" : "Адрес добавлен",
        description: "Изменения сохранены.",
      });
      router.back();
    } catch (err: any) {
      setError(err?.message || "Не удалось сохранить адрес.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!editingAddress) return;

    Alert.alert("Удалить адрес?", "Это действие нельзя отменить.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            await mobileApi.deleteAddress(editingAddress.id);
            await queryClient.invalidateQueries({ queryKey: ["addresses"] });
            pushToast({
              tone: "info",
              title: "Адрес удалён",
            });
            router.back();
          } catch (err: any) {
            setError(err?.message || "Не удалось удалить адрес.");
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  return (
    <Screen keyboard>
      <PageHeader
        showBack
        subtitle={editingAddress ? "Обновите сохранённый адрес" : "Добавьте новый адрес для доставки"}
        title={editingAddress ? "Редактировать адрес" : "Новый адрес"}
      />

      <SectionCard>
        <TextField
          helper="Например: Дом, Работа, Студия"
          label="Название"
          onChangeText={setLabel}
          value={label}
        />
        <TextField
          error={error}
          label="Адрес"
          onChangeText={(value) => {
            setError("");
            setAddress(value);
          }}
          placeholder="Улица, дом, квартира"
          value={address}
        />
        <Pressable
          onPress={() => setIsDefault((current) => !current)}
          style={[styles.toggle, isDefault ? styles.toggleActive : null]}
        >
          <View style={styles.toggleCopy}>
            <Text style={styles.toggleTitle}>Сделать основным</Text>
            <Text style={styles.toggleText}>
              Этот адрес будет подставляться в доставку по умолчанию.
            </Text>
          </View>
          <View style={[styles.toggleDot, isDefault ? styles.toggleDotActive : null]} />
        </Pressable>

        <MeatButton fullWidth loading={loading} onPress={handleSave} size="cta">
          Сохранить
        </MeatButton>
        {editingAddress ? (
          <MeatButton fullWidth onPress={handleDelete} variant="secondary">
            Удалить адрес
          </MeatButton>
        ) : null}
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggle: {
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceTint,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  toggleActive: {
    backgroundColor: colors.accentSoft,
  },
  toggleCopy: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  toggleText: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  toggleDot: {
    width: 18,
    height: 18,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceStrong,
  },
  toggleDotActive: {
    backgroundColor: colors.accent,
  },
});
