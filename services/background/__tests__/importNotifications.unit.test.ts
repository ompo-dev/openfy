import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getImportDestination, notifyLibraryImport, prepareImportNotifications } from '../importNotifications';

jest.mock('../downloadNotifications', () => ({}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notification'),
  IosAuthorizationStatus: { PROVISIONAL: 3 }, AndroidImportance: { DEFAULT: 3 },
}));
const platform = Platform.OS;
afterEach(() => { Platform.OS = platform; });
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: true } as any);
});

it('uses existing permission and delivers an actionable album notification', async () => {
  Platform.OS = 'ios';
  expect(await prepareImportNotifications()).toBe(true);
  await notifyLibraryImport('KM2', { kind: 'album', id: 'km2' });
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
    content: { title: 'Adicionado à biblioteca', body: 'KM2', sound: false,
      data: { type: 'library-import', kind: 'album', id: 'km2' } },
    trigger: null,
  });
});

it('creates the Android channel before requesting permission', async () => {
  Platform.OS = 'android';
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false } as any);
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ granted: true } as any);
  expect(await prepareImportNotifications()).toBe(true);
  await notifyLibraryImport('Rádio', { kind: 'playlist', id: 'local_radio' });
  expect(jest.mocked(Notifications.setNotificationChannelAsync).mock.invocationCallOrder[0])
    .toBeLessThan(jest.mocked(Notifications.requestPermissionsAsync).mock.invocationCallOrder[0]);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({ trigger: { channelId: 'library-imports' } }));
});

it('does not call native permission APIs on web', async () => {
  Platform.OS = 'web';
  expect(await prepareImportNotifications()).toBe(false);
  expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
});

it('accepts only completed library import destinations', () => {
  expect(getImportDestination({ type: 'library-import', kind: 'track', id: 'song' })).toEqual({ kind: 'track', id: 'song' });
  expect(getImportDestination({ type: 'download', kind: 'album', id: 'a' })).toBeNull();
  expect(getImportDestination({ type: 'library-import', kind: 'artist', id: 'a' })).toBeNull();
  expect(getImportDestination({ type: 'library-import', kind: 'playlist', id: '' })).toBeNull();
});
