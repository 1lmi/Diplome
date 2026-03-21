import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { mobileApi } from "@/src/api/mobile-api";
import { ListRow } from "@/src/components/ui/ListRow";
import { MeatButton } from "@/src/components/ui/MeatButton";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Screen } from "@/src/components/ui/Screen";
import { StatusPill } from "@/src/components/ui/StatusPill";
import { SurfacePanel } from "@/src/components/ui/SurfacePanel";
import { TextField } from "@/src/components/ui/TextField";
import { formatDateTime, normalizePhone } from "@/src/lib/format";
import { formatPhoneInput } from "@/src/lib/phone";
import { useToast } from "@/src/providers/ToastProvider";
import { useAuthStore } from "@/src/store/auth-store";
import { useTrackingStore } from "@/src/store/tracking-store";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

function SectionBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "accent" | "neutral" | "soft";
}) {
  return (
    <View
      style={[
        styles.sectionBadge,
        tone === "accent"
          ? styles.sectionBadgeAccent
          : tone === "soft"
            ? styles.sectionBadgeSoft
            : styles.sectionBadgeNeutral,
      ]}
    >
      <Text
        style={[
          styles.sectionBadgeText,
          tone === "accent"
            ? styles.sectionBadgeTextAccent
            : tone === "soft"
              ? styles.sectionBadgeTextSoft
              : styles.sectionBadgeTextNeutral,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

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
        description: error?.message || "Проверьте номер заказа и телефон.",
      });
    } finally {
      setTracking(false);
    }
  };

  if (!user) {
    return (
      <Screen>
        <PageHeader
          showBack
          subtitle="Вход, отслеживание и история заказов"
          title="Профиль"
        />

        <View style={styles.sectionBlock}>
          <SectionBadge label="Аккаунт" tone="accent" />
          <SurfacePanel style={styles.accountPanel} tone="tint">
            <View style={styles.intro}>
              <Text style={styles.introTitle}>Оформляйте быстрее</Text>
              <Text style={styles.introCopy}>
                Войдите в аккаунт, чтобы сохранить адреса и видеть все свои заказы в одном
                месте.
              </Text>
            </View>
            <View style={styles.actionRow}>
              <MeatButton fullWidth onPress={() => router.push("/auth/sign-in")} variant="secondary">
                Войти
              </MeatButton>
              <MeatButton fullWidth onPress={() => router.push("/auth/sign-up")}>
                Создать аккаунт
              </MeatButton>
            </View>
          </SurfacePanel>
        </View>

        <View style={styles.sectionBlock}>
          <SectionBadge label="Отслеживание" />
          <SurfacePanel style={styles.sectionPanel}>
            <Text style={styles.sectionTitle}>Найти заказ по номеру и телефону</Text>
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
                setPhone(formatPhoneInput(value));
              }}
              placeholder="+7 (999) 123-45-67"
              value={phone}
            />
            <MeatButton fullWidth loading={tracking} onPress={() => handleTrack()}>
              Открыть заказ
            </MeatButton>
          </SurfacePanel>
        </View>

        {recentTracking.length ? (
          <View style={styles.sectionBlock}>
            <SectionBadge label="Недавние" tone="soft" />
            <SurfacePanel style={styles.softPanel} tone="soft">
              <Text style={styles.sectionTitle}>Последние отслеживания</Text>
              <View style={styles.listStack}>
                {recentTracking.map((item) => (
                  <ListRow
                    key={item.orderId}
                    onPress={() => handleTrack(item.orderId, item.phone)}
                    subtitle={formatPhoneInput(item.phone) || item.phone}
                    title={`Заказ №${item.orderId}`}
                    tone="surface"
                    trailing={
                      <Pressable onPress={() => removeTracking(item.orderId)}>
                        <Text style={styles.link}>Удалить</Text>
                      </Pressable>
                    }
                  />
                ))}
              </View>
            </SurfacePanel>
          </View>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader showBack subtitle="Аккаунт, адреса и заказы" title="Профиль" />

      <View style={styles.sectionBlock}>
        <SectionBadge label="Аккаунт" tone="accent" />
        <SurfacePanel style={styles.accountPanel} tone="tint">
          <View style={styles.accountRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user.first_name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.accountCopy}>
              <Text style={styles.accountName}>{user.first_name || user.full_name}</Text>
              <Text style={styles.accountLogin}>{formatPhoneInput(user.login) || user.login}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            {user.birth_date ? <StatusPill label={user.birth_date} tone="muted" /> : null}
          </View>
          <MeatButton onPress={() => router.push("/profile/edit")} variant="secondary">
            Изменить профиль
          </MeatButton>
        </SurfacePanel>
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHead}>
          <SectionBadge label="Адреса" />
          <Pressable onPress={() => router.push("/address/new")}>
            <Text style={styles.link}>Новый адрес</Text>
          </Pressable>
        </View>
        <SurfacePanel style={styles.sectionPanel}>
          {addressesQuery.data?.length ? (
            <View style={styles.listStack}>
              {addressesQuery.data.slice(0, 3).map((address) => (
                <ListRow
                  key={address.id}
                  onPress={() =>
                    router.push({
                      pathname: "/address/[id]",
                      params: { id: String(address.id) },
                    })
                  }
                  subtitle={address.address}
                  title={address.label || "Адрес"}
                  tone="surface"
                  trailing={
                    address.is_default ? (
                      <StatusPill label="Основной" tone="accent" />
                    ) : undefined
                  }
                />
              ))}
            </View>
          ) : (
            <Text style={styles.copy}>Сохранённых адресов пока нет.</Text>
          )}
        </SurfacePanel>
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHead}>
          <SectionBadge label="Заказы" tone="soft" />
          <Pressable onPress={() => router.push("/profile/orders")}>
            <Text style={styles.link}>Все</Text>
          </Pressable>
        </View>
        <SurfacePanel style={styles.softPanel} tone="soft">
          {ordersQuery.data?.length ? (
            <View style={styles.listStack}>
              {ordersQuery.data.slice(0, 3).map((order) => (
                <ListRow
                  key={order.id}
                  onPress={() =>
                    router.push({
                      pathname: "/order/[id]",
                      params: { id: String(order.id) },
                    })
                  }
                  subtitle={formatDateTime(order.created_at)}
                  title={`Заказ №${order.id}`}
                  tone="surface"
                  trailing={
                    <StatusPill
                      label={order.status_name}
                      tone={order.status === "canceled" ? "danger" : "accent"}
                    />
                  }
                />
              ))}
            </View>
          ) : (
            <Text style={styles.copy}>
              Как только появится первый заказ, история покажется здесь.
            </Text>
          )}
        </SurfacePanel>
      </View>

      <View style={styles.logoutWrap}>
        <Pressable hitSlop={12} onPress={handleLogout}>
          <Text style={styles.logoutText}>Выйти</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionBlock: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sectionBadge: {
    alignSelf: "flex-start",
    minHeight: 24,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
  },
  sectionBadgeAccent: {
    backgroundColor: colors.accentSoft,
  },
  sectionBadgeNeutral: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionBadgeSoft: {
    backgroundColor: colors.bgSoft,
  },
  sectionBadgeText: {
    fontSize: typography.caption,
    fontWeight: typography.semibold,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  sectionBadgeTextAccent: {
    color: colors.accent,
  },
  sectionBadgeTextNeutral: {
    color: colors.text,
  },
  sectionBadgeTextSoft: {
    color: colors.muted,
  },
  sectionPanel: {
    borderWidth: 1,
    borderColor: colors.line,
  },
  accountPanel: {
    borderWidth: 1,
    borderColor: "rgba(230, 122, 46, 0.18)",
  },
  softPanel: {
    borderWidth: 1,
    borderColor: colors.line,
  },
  intro: {
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
  actionRow: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
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
  listStack: {
    gap: spacing.xs,
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
    backgroundColor: colors.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.accent,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  accountCopy: {
    flex: 1,
    gap: 3,
  },
  accountName: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.semibold,
  },
  accountLogin: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  logoutWrap: {
    marginTop: "auto",
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
    alignItems: "center",
  },
  logoutText: {
    color: colors.muted,
    fontSize: typography.bodySm,
    fontWeight: typography.medium,
  },
});
