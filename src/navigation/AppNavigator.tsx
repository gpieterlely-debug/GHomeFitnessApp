import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { DashboardScreen } from '../screens/DashboardScreen';
import { PlanScreen } from '../screens/PlanScreen';
import { LogScreen } from '../screens/LogScreen';
import { KBScreen } from '../screens/KBScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { colors, typography } from '../theme';

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Dashboard: 'activity',
  Plan: 'calendar',
  Log: 'edit-3',
  Kettlebell: 'zap',
  Connect: 'link',
};

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => (
            <Feather name={TAB_ICONS[route.name] ?? 'circle'} size={size} color={color} />
          ),
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            backgroundColor: colors.panel,
            borderTopColor: colors.line,
            borderTopWidth: 1,
          },
          tabBarLabelStyle: { fontSize: typography.xs, fontWeight: '600' },
          headerStyle: { backgroundColor: colors.panel, borderBottomColor: colors.line, borderBottomWidth: 1 },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '800', fontSize: typography.base },
        })}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Plan" component={PlanScreen} />
        <Tab.Screen name="Log" component={LogScreen} />
        <Tab.Screen name="Kettlebell" component={KBScreen} options={{ title: 'KB' }} />
        <Tab.Screen name="Connect" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
