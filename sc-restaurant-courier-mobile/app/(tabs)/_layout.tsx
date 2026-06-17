import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import React from 'react';

import { colors, radii, spacing } from '../../src/theme/tokens';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabBarIcon({
  name,
  color,
  size,
}: {
  name: IconName;
  color: string;
  size: number;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

function WorkTabIcon({ color, size }: { color: string; size: number }) {
  return <TabBarIcon name="bicycle-outline" color={color} size={size} />;
}

function ProfileTabIcon({ color, size }: { color: string; size: number }) {
  return <TabBarIcon name="person-circle-outline" color={color} size={size} />;
}

export default function CourierTabsLayout() {
  return (
    <Tabs
      initialRouteName="orders/index"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarStyle: {
          height: 68,
          paddingTop: spacing.xs,
          paddingBottom: spacing.sm,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        },
        tabBarItemStyle: {
          borderRadius: radii.md,
          marginHorizontal: spacing.xs,
        },
      }}
    >
      <Tabs.Screen
        name="orders/index"
        options={{
          title: 'Работа',
          tabBarIcon: WorkTabIcon,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Профиль',
          tabBarIcon: ProfileTabIcon,
        }}
      />
    </Tabs>
  );
}
