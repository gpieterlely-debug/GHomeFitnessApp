import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { FULL_PLAN } from '../data/plan';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Schedule one notification per day for the next 28 days based on plan week.
// Re-call this whenever planStartDate, raceDate, or notification time changes.
export async function scheduleSessionReminders(
  planStartDate: string,
  hour: number,
  minute: number,
): Promise<void> {
  await cancelAllScheduledNotifications();

  const granted = await requestNotificationPermission();
  if (!granted) return;

  const start = new Date(planStartDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let dayOffset = 0; dayOffset < 28; dayOffset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + dayOffset);

    // Which plan week does this date fall in?
    const msSinceStart = date.getTime() - start.getTime();
    const planWeek = Math.min(24, Math.max(1, Math.floor(msSinceStart / (7 * 86400000)) + 1));

    const weekPlan = FULL_PLAN[planWeek - 1];
    const dayName = DAY_NAMES[date.getDay()];
    const dayPlan = weekPlan.days.find(d => d.day === dayName);

    if (!dayPlan) continue;

    const triggerDate = new Date(date);
    triggerDate.setHours(hour, minute, 0, 0);

    // Skip if trigger time is already past
    if (triggerDate.getTime() <= Date.now()) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Today: ${dayPlan.session}`,
        body: `${dayPlan.target} · ${dayPlan.details.split('—')[0].trim()}`,
        data: { week: planWeek, day: dayName },
      },
      trigger: { date: triggerDate },
    });
  }
}

export async function sendTestNotification(session: string, target: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Test: ${session}`,
      body: target,
    },
    trigger: { seconds: 3 },
  });
}
