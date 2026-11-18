import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { toMin } from '@/utils/time';

const CHANNEL_ID = 'gun-sonu';

export function configureNotifications(): void {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * (Re)schedules the single daily end-of-day reminder. Returns false when
 * notifications are unavailable or the student declined permission.
 */
export async function scheduleDailyCheckin(checkinTime: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return false;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Gün sonu hatırlatması',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    await Notifications.cancelAllScheduledNotificationsAsync();
    const minutes = toMin(checkinTime);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Günün nasıl geçti?',
        body: 'Planına uyabildin mi? Gel, yarını birlikte planlayalım.',
        data: { screen: 'chat' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: Math.floor(minutes / 60),
        minute: minutes % 60,
        channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Calls `onOpen` when the student taps the reminder. Returns an unsubscribe function. */
export function onReminderTapped(onOpen: () => void): () => void {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener(() => onOpen());
  return () => sub.remove();
}
