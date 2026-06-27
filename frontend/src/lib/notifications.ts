import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Как показывать пуш, когда приложение открыто (передний план).
export const configureNotificationHandler = () => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
};

const ensureAndroidChannel = async () => {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Уведомления',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#8B5CF6',
  });
};

const getProjectId = (): string | undefined =>
  (Constants.expoConfig as any)?.extra?.eas?.projectId ||
  (Constants as any)?.easConfig?.projectId;

/**
 * Запрос разрешения + получение Expo push-токена.
 * Возвращает токен (ExponentPushToken[...]) или null (эмулятор / отказ / ошибка).
 */
export const registerForPushNotificationsAsync = async (): Promise<string | null> => {
  try {
    await ensureAndroidChannel();
    if (!Device.isDevice) return null; // на эмуляторе пуш-токен не выдаётся

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    const projectId = getProjectId();
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data || null;
  } catch (e) {
    return null;
  }
};

/** Локальное напоминание на конкретное время (если оно в будущем). */
export const scheduleLocalReminder = async (
  identifier: string,
  title: string,
  body: string,
  date: Date,
  data: Record<string, any> = {}
) => {
  if (date.getTime() <= Date.now()) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body, data, sound: true },
      trigger: { date } as any,
    });
  } catch {}
};

export const cancelAllScheduled = async () => {
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
};

export { Notifications };
