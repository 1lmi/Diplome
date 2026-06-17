import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { courierApi } from '../../src/api/courier-api';
import type { CourierStatsPoint } from '../../src/api/types';
import { ActionButton, AppScreen, Card } from '../../src/components/ui';
import { formatDateTime, formatPrice } from '../../src/lib/format';
import { useAuthStore } from '../../src/store/auth-store';
import { colors, radii, spacing } from '../../src/theme/tokens';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function initialsFromName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SC';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatMinutes(value: number | null) {
  if (value === null) return '—';
  if (value < 60) return `${value} мин`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`;
}

function StatCard({
  label,
  value,
  icon,
  delay,
}: {
  label: string;
  value: string;
  icon: IconName;
  delay: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify().damping(17)}
      layout={LinearTransition.springify().damping(18)}
      style={styles.statCard}
    >
      <View style={styles.statIcon}>
        <Ionicons name={icon} size={17} color={colors.accent} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

function DeliveryChart({ points }: { points: CourierStatsPoint[] }) {
  const maxDelivered = Math.max(1, ...points.map((point) => point.delivered_count));

  return (
    <View style={styles.chart}>
      {points.map((point, index) => {
        const height = 10 + Math.round((point.delivered_count / maxDelivered) * 82);
        return (
          <View key={point.date} style={styles.chartColumn}>
            <View style={styles.chartTrack}>
              <Animated.View
                entering={FadeInDown.delay(180 + index * 45).springify().damping(16)}
                layout={LinearTransition.springify().damping(18)}
                style={[styles.chartBar, { height }]}
              />
            </View>
            <Text style={styles.chartValue}>{point.delivered_count}</Text>
            <Text style={styles.chartLabel}>{point.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  onChange,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={18} color={colors.text} />
      </View>
      <View style={styles.settingText}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.surfaceMuted, true: '#ffd5b8' }}
        thumbColor={value ? colors.accent : '#fff'}
      />
    </View>
  );
}

export default function CourierProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const logout = useAuthStore((state) => state.logout);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [compactCards, setCompactCards] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const statsQuery = useQuery({
    queryKey: ['courier-stats'],
    queryFn: courierApi.getStats,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const status = (statsQuery.error as Error & { status?: number } | null)?.status;
    if (status === 401 || status === 403) {
      void clearSession().then(() => router.replace('/auth/sign-in'));
    }
  }, [statsQuery.error, clearSession]);

  const profile = user?.courier_profile;
  const displayName = profile?.display_name || user?.full_name || 'Курьер';
  const phone = profile?.phone || user?.login || '—';
  const stats = statsQuery.data;

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await refreshUser();
      await statsQuery.refetch();
    } catch (error: any) {
      Alert.alert('Не удалось обновить профиль', error?.message || 'Попробуйте позже.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = () => {
    void logout().then(() => router.replace('/auth/sign-in'));
  };

  return (
    <AppScreen>
      <Animated.View entering={FadeInDown.duration(360)} style={styles.profileHero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsFromName(displayName)}</Text>
        </View>
        <View style={styles.profileHeroText}>
          <Text style={styles.eyebrow}>Профиль курьера</Text>
          <Text style={styles.title}>{displayName}</Text>
          <Text style={styles.subtitle}>{phone}</Text>
        </View>
      </Animated.View>

      <Card style={styles.statusCard}>
        <View style={styles.statusTop}>
          <View>
            <Text style={styles.cardTitle}>Смена</Text>
            <Text style={styles.cardSubtitle}>
              {profile?.is_active === false ? 'Доступ отключён' : 'На линии и готов к доставкам'}
            </Text>
          </View>
          <View style={[styles.liveBadge, profile?.is_active === false ? styles.liveBadgeDanger : null]}>
            <Text style={[styles.liveBadgeText, profile?.is_active === false ? styles.liveBadgeDangerText : null]}>
              {profile?.is_active === false ? 'OFF' : 'LIVE'}
            </Text>
          </View>
        </View>
        <View style={styles.statusTimeline}>
          <View style={styles.timelineDot} />
          <Text style={styles.timelineText}>
            Профиль обновлён: {formatDateTime(profile?.updated_at)}
          </Text>
        </View>
        {profile?.notes ? <Text style={styles.notes}>{profile.notes}</Text> : null}
      </Card>

      <View style={styles.statsGrid}>
        <StatCard
          label="Доставлено сегодня"
          value={String(stats?.today_delivered ?? 0)}
          icon="checkmark-done-outline"
          delay={80}
        />
        <StatCard
          label="Сумма сегодня"
          value={formatPrice(stats?.today_amount ?? 0)}
          icon="wallet-outline"
          delay={120}
        />
        <StatCard
          label="За неделю"
          value={String(stats?.week_delivered ?? 0)}
          icon="calendar-outline"
          delay={160}
        />
        <StatCard
          label="Среднее время"
          value={formatMinutes(stats?.avg_delivery_minutes ?? null)}
          icon="timer-outline"
          delay={200}
        />
      </View>

      <Card>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>График доставок</Text>
            <Text style={styles.cardSubtitle}>Последние 7 дней</Text>
          </View>
          <Text style={styles.chartAmount}>{formatPrice(stats?.week_amount ?? 0)}</Text>
        </View>
        {statsQuery.isLoading ? (
          <Text style={styles.metaText}>Загружаем статистику...</Text>
        ) : statsQuery.error ? (
          <Text style={styles.errorText}>{(statsQuery.error as Error).message}</Text>
        ) : (
          <DeliveryChart points={stats?.points ?? []} />
        )}
      </Card>

      <Card>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Настройки</Text>
            <Text style={styles.cardSubtitle}>Локальные настройки интерфейса</Text>
          </View>
        </View>
        <SettingRow
          icon="volume-medium-outline"
          title="Звук"
          subtitle="Сигнал при обновлении доски"
          value={soundEnabled}
          onChange={setSoundEnabled}
        />
        <SettingRow
          icon="phone-portrait-outline"
          title="Вибро"
          subtitle="Мягкий отклик на действия"
          value={vibrationEnabled}
          onChange={setVibrationEnabled}
        />
        <SettingRow
          icon="albums-outline"
          title="Компактные карточки"
          subtitle="Плотнее показывать заказы"
          value={compactCards}
          onChange={setCompactCards}
        />
      </Card>

      <View style={styles.actionsRow}>
        <View style={styles.actionWrap}>
          <ActionButton
            title="Обновить"
            icon="refresh-outline"
            variant="secondary"
            onPress={() => void handleRefresh()}
            loading={refreshing}
          />
        </View>
        <View style={styles.actionWrap}>
          <ActionButton title="Выйти" icon="log-out-outline" variant="ghost" onPress={handleLogout} />
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  profileHeroText: {
    flex: 1,
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  statusCard: {
    gap: spacing.md,
  },
  statusTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  liveBadge: {
    borderRadius: radii.pill,
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  liveBadgeDanger: {
    backgroundColor: colors.dangerSoft,
  },
  liveBadgeText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '800',
  },
  liveBadgeDangerText: {
    color: colors.danger,
  },
  statusTimeline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  timelineText: {
    flex: 1,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  notes: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    width: '48.8%',
    minHeight: 112,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  statIcon: {
    width: 31,
    height: 31,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  statValue: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  chartAmount: {
    color: colors.accentDark,
    fontSize: 15,
    fontWeight: '700',
  },
  chart: {
    height: 150,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  chartColumn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  chartTrack: {
    width: '100%',
    height: 96,
    borderRadius: radii.md,
    justifyContent: 'flex-end',
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  chartBar: {
    width: '100%',
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    backgroundColor: colors.accent,
  },
  chartValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  chartLabel: {
    color: colors.muted,
    fontSize: 11,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  settingText: {
    flex: 1,
    gap: 2,
  },
  settingTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  settingSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionWrap: {
    flex: 1,
  },
  metaText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
});
