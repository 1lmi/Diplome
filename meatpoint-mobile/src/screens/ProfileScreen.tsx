import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { mobileApi } from "@/src/api/mobile-api";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { SectionCard } from "@/src/components/ui/SectionCard";
import { StatusPill } from "@/src/components/ui/StatusPill";
import { TextField } from "@/src/components/ui/TextField";
import { formatDateTime, normalizePhone } from "@/src/lib/format";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { useTrackingStore } from "@/src/store/tracking-store";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const trackedItems = useTrackingStore((state) => state.items);
  const saveTracking = useTrackingStore((state) => state.save);
  const removeTracking = useTrackingStore((state) => state.remove);

  const addressesQuery = useQuery({
    queryKey: ["addresses"],
    queryFn: mobileApi.getMyAddresses,
    enabled: Boolean(user),
  });
  const ordersQuery = useQuery({
    queryKey: ["me-orders"],
    queryFn: mobileApi.getMyOrders,
    enabled: Boolean(user),
  });

  const [orderId, setOrderId] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tracking, setTracking] = useState(false);

  const recentTracking = useMemo(
    () => [...trackedItems].sort((left, right) => right.savedAt - left.savedAt).slice(0, 3),
    [trackedItems]
  );

  const handleLogout = async () => {
    await logout();
    await queryClient.removeQueries({ queryKey: ["me-orders"] });
    await queryClient.removeQueries({ queryKey: ["addresses"] });
    pushToast({
      tone: "info",
      title: "Вы вышли из аккаунта",
    });
    router.replace("/profile");
  };

  const handleTrack = async (targetOrderId?: number, targetPhone?: string) => {
    const nextOrderId = String(targetOrderId ?? orderId).trim();
    const nextPhone = normalizePhone(targetPhone ?? phone);
    const nextErrors: Record<string, string> = {};

    if (!nextOrderId || Number.isNaN(Number(nextOrderId))) {
      nextErrors.orderId = "Укажите номер заказа.";
    }
    if (!nextPhone) {
      nextErrors.phone = "Укажите телефон, привязанный к заказу.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    try {
      setTracking(true);
      await mobileApi.trackOrder(Number(nextOrderId), nextPhone);
      saveTracking(Number(nextOrderId), nextPhone);
      router.push({
        pathname: "/order/[id]",
        params: { id: nextOrderId, phone: nextPhone },
      });
    } catch (error: any) {
      pushToast({
        tone: "error",
        title: "Не удалось найти заказ",
        description: error?.message || "Проверьте номер и телефон.",
      });
    } finally {
      setTracking(false);
    }
  };

  if (!user) {
    return (
      <Screen>
        <PageHeader showBack subtitle="Вход, guest tracking и история заказов" title="Профиль" />

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Оформляйте быстрее</Text>
          <Text style={styles.heroCopy}>
            Войдите, чтобы сохранить адреса и видеть все свои заказы в одном месте.
          </Text>
        </View>

        <SectionCard>
          <View style={styles.actionRow}>
            <MeatButton fullWidth onPress={() => router.push("/auth/sign-in")} variant="secondary">
              Войти
            </MeatButton>
            <MeatButton fullWidth onPress={() => router.push("/auth/sign-up")}>
              Создать аккаунт
            </MeatButton>
          </View>
        </SectionCard>

        <SectionCard>
          <Text style={styles.sectionTitle}>Отследить заказ</Text>
          <TextField
            error={errors.orderId}
            keyboardType="numeric"
            label="Номер заказа"
            onChangeText={(value) => {
              setErrors((current) => ({ ...current, orderId: "" }));
              setOrderId(value.replace(/[^\d]/g, ""));
            }}
            placeholder="Например, 128"
            value={orderId}
          />
          <TextField
            error={errors.phone}
            keyboardType="phone-pad"
            label="Телефон"
            onChangeText={(value) => {
              setErrors((current) => ({ ...current, phone: "" }));
              setPhone(value);
            }}
            placeholder="+7 999 123-45-67"
            value={phone}
          />
          <MeatButton fullWidth loading={tracking} onPress={() => handleTrack()}>
            Открыть заказ
          </MeatButton>
        </SectionCard>

        {recentTracking.length ? (
          <SectionCard>
            <Text style={styles.sectionTitle}>Последние отслеживания</Text>
            {recentTracking.map((item) => (
              <View key={item.orderId} style={styles.trackRow}>
                <Pressable onPress={() => handleTrack(item.orderId, item.phone)} style={styles.trackInfo}>
                  <Text style={styles.rowTitle}>Заказ №{item.orderId}</Text>
                  <Text style={styles.rowText}>{item.phone}</Text>
                </Pressable>
                <Pressable onPress={() => removeTracking(item.orderId)}>
                  <Text style={styles.link}>Удалить</Text>
                </Pressable>
              </View>
            ))}
          </SectionCard>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader showBack subtitle="Аккаунт, адреса и заказы" title="Профиль" />

      <SectionCard>
        <View style={styles.accountRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.first_name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.accountCopy}>
            <Text style={styles.accountName}>{user.full_name || user.first_name}</Text>
            <Text style={styles.accountLogin}>{user.login}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          {user.birth_date ? <StatusPill label={user.birth_date} tone="muted" /> : null}
          {user.gender ? <StatusPill label={user.gender} tone="muted" /> : null}
        </View>
        <MeatButton onPress={() => router.push("/profile/edit")} variant="secondary">
          Изменить профиль
        </MeatButton>
      </SectionCard>

      <SectionCard>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Адреса</Text>
          <Pressable onPress={() => router.push("/address/new")}>
            <Text style={styles.link}>Новый адрес</Text>
          </Pressable>
        </View>
        {addressesQuery.data?.length ? (
          addressesQuery.data.slice(0, 3).map((address) => (
            <Pressable
              key={address.id}
              onPress={() =>
                router.push({
                  pathname: "/address/[id]",
                  params: { id: String(address.id) },
                })
              }
              style={styles.addressRow}
            >
              <View style={[styles.addressMarker, address.is_default ? styles.addressMarkerActive : null]} />
              <View style={styles.addressCopyWrap}>
                <View style={styles.addressLabelRow}>
                  <Text style={styles.rowTitle}>{address.label || "Адрес"}</Text>
                  {address.is_default ? <StatusPill label="Основной" tone="accent" /> : null}
                </View>
                <Text style={styles.rowText}>{address.address}</Text>
              </View>
            </Pressable>
          ))
        ) : (
          <Text style={styles.copy}>Сохранённых адресов пока нет.</Text>
        )}
      </SectionCard>

      <SectionCard>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Последние заказы</Text>
          <Pressable onPress={() => router.push("/profile/orders")}>
            <Text style={styles.link}>Все</Text>
          </Pressable>
        </View>
        {ordersQuery.data?.length ? (
          ordersQuery.data.slice(0, 3).map((order) => (
            <Pressable
              key={order.id}
              onPress={() =>
                router.push({
                  pathname: "/order/[id]",
                  params: { id: String(order.id) },
                })
              }
              style={styles.orderRow}
            >
              <View style={styles.addressCopyWrap}>
                <Text style={styles.rowTitle}>Заказ №{order.id}</Text>
                <Text style={styles.rowText}>{formatDateTime(order.created_at)}</Text>
              </View>
              <StatusPill
                label={order.status_name}
                tone={order.status === "canceled" ? "danger" : "accent"}
              />
            </Pressable>
          ))
        ) : (
          <Text style={styles.copy}>Как только появится первый заказ, история покажется здесь.</Text>
        )}
      </SectionCard>

      <SectionCard compact>
        <MeatButton fullWidth onPress={handleLogout} variant="secondary">
          Выйти
        </MeatButton>
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  heroTitle: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: typography.semibold,
  },
  heroCopy: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 20,
    maxWidth: 320,
  },
  actionRow: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  copy: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 20,
  },
  link: {
    color: colors.accent,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.accent,
    fontSize: typography.titleSm,
    fontWeight: typography.semibold,
  },
  accountCopy: {
    flex: 1,
    gap: 2,
  },
  accountName: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  accountLogin: {
    color: colors.muted,
    fontSize: typography.bodySm,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  addressMarker: {
    width: 12,
    height: 12,
    borderRadius: radii.pill,
    marginTop: 4,
    backgroundColor: colors.surfaceMuted,
  },
  addressMarkerActive: {
    backgroundColor: colors.accent,
  },
  addressCopyWrap: {
    flex: 1,
    gap: 4,
  },
  addressLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowTitle: {
    color: colors.text,
    fontSize: typography.bodySm,
    fontWeight: typography.semibold,
  },
  rowText: {
    color: colors.muted,
    fontSize: typography.bodySm,
    lineHeight: 19,
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  trackInfo: {
    flex: 1,
    gap: 3,
  },
});
