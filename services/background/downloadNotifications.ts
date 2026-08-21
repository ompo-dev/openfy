import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const isNative = Platform.OS !== 'web';
const CHANNEL_ID = 'downloads';

if (isNative) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

const hasPermission = (
  permission: Notifications.NotificationPermissionsStatus
) =>
  permission.granted ||
  permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

export const requestDownloadNotificationPermission = async () => {
  if (!isNative) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Downloads',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (hasPermission(current)) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return hasPermission(requested);
};

export const notifyDownloadResult = async (
  completed: number,
  failed = 0
) => {
  if (!isNative || completed === 0) return;

  const permission = await Notifications.getPermissionsAsync();
  if (!hasPermission(permission)) return;

  const title = completed === 1 ? 'Download concluído' : 'Downloads concluídos';
  const body = [
    `${completed} ${completed === 1 ? 'música baixada' : 'músicas baixadas'}.`,
    failed > 0
      ? `${failed} ${failed === 1 ? 'download será retomado' : 'downloads serão retomados'}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: null,
  });
};
