import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Как показывать пуш, когда приложение открыто (передний план).
export const configureNotificationHandler = () => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
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
    await ensureAndroidChannel();
    // С SDK 52 триггер без `type` отклоняется (TypeError) — раньше из-за `{ date }` ни одно
    // напоминание не ставилось, а ошибку глушил catch ниже.
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body, data, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'default' },
    });
  } catch {}
};

export const cancelAllScheduled = async () => {
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
};

/** Отменить одно запланированное уведомление (например, таймер отдыха). */
export const cancelScheduled = async (identifier: string) => {
  try { await Notifications.cancelScheduledNotificationAsync(identifier); } catch {}
};

/**
 * Отменить только «свои» уведомления по префиксу id. Раньше синхронизация напоминаний о
 * тренировках звала cancelAll — и заодно стирала, например, идущий таймер отдыха.
 */
export const cancelScheduledByPrefix = async (prefix: string) => {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(all
      .filter(n => n.identifier.startsWith(prefix))
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
  } catch {}
};

export { Notifications };
