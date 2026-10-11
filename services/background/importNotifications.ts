import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import './downloadNotifications';

export type ImportDestination = { kind: 'track' | 'album' | 'playlist'; id: string };
const CHANNEL_ID = 'library-imports';
const hasPermission = (permission: Notifications.NotificationPermissionsStatus) =>
  permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

export const prepareImportNotifications = async () => {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Biblioteca', importance: Notifications.AndroidImportance.DEFAULT,
  });
  const permission = await Notifications.getPermissionsAsync();
  if (hasPermission(permission)) return true;
  return hasPermission(await Notifications.requestPermissionsAsync());
};

export const notifyLibraryImport = (title: string, destination: ImportDestination) =>
  Notifications.scheduleNotificationAsync({
    content: {
      title: 'Adicionado à biblioteca', body: title, sound: false,
      data: { type: 'library-import', kind: destination.kind, id: destination.id },
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });

export const getImportDestination = (data: Record<string, unknown>): ImportDestination | null =>
  data.type === 'library-import' && typeof data.id === 'string' && data.id.length > 0 &&
    (data.kind === 'track' || data.kind === 'album' || data.kind === 'playlist')
    ? { kind: data.kind, id: data.id } : null;
