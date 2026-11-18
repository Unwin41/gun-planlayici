import Ionicons from '@expo/vector-icons/Ionicons';
import { DarkTheme, DefaultTheme, ThemeProvider, router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme, type ColorValue } from 'react-native';

import { GradePrompt, Onboarding } from '@/components/Onboarding';
import { Colors } from '@/constants/theme';
import { useHydrated } from '@/hooks/use-hydrated';
import { configureNotifications, onReminderTapped } from '@/notifications';
import { useStore } from '@/store/useStore';

SplashScreen.preventAutoHideAsync();
configureNotifications();

type IconName = keyof typeof Ionicons.glyphMap;

/** Outline icon, filled when the tab is active. */
function tabIcon(name: IconName, activeName: IconName) {
  return function TabIcon({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
    return <Ionicons name={focused ? activeName : name} size={size} color={typeof color === 'string' ? color : undefined} />;
  };
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const hydrated = useHydrated();
  const onboarded = useStore((s) => s.settings.onboarded);
  const hasGrade = useStore((s) => s.settings.grade !== undefined);

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync();
  }, [hydrated]);

  useEffect(() => onReminderTapped(() => router.navigate('/chat')), []);

  if (!hydrated) return null;

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      {!onboarded ? (
        <Onboarding />
      ) : !hasGrade ? (
        <GradePrompt />
      ) : (
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
          }}>
          <Tabs.Screen name="index" options={{ title: 'Bugün', tabBarIcon: tabIcon('checkbox-outline', 'checkbox') }} />
          <Tabs.Screen name="chat" options={{ title: 'Koç', tabBarIcon: tabIcon('chatbubble-ellipses-outline', 'chatbubble-ellipses') }} />
          <Tabs.Screen name="history" options={{ title: 'Geçmiş', tabBarIcon: tabIcon('stats-chart-outline', 'stats-chart') }} />
          <Tabs.Screen name="settings" options={{ title: 'Ayarlar', tabBarIcon: tabIcon('settings-outline', 'settings') }} />
        </Tabs>
      )}
    </ThemeProvider>
  );
}
