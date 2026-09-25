import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_APP_SETTINGS,
  getAppSettings,
  resetAppSettings,
  subscribeAppSettings,
  updateAppSettings,
} from '../appSettings';

describe('appSettings', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await resetAppSettings();
  });

  it('loads defaults and persists changed preferences', async () => {
    await expect(getAppSettings()).resolves.toEqual(DEFAULT_APP_SETTINGS);

    await updateAppSettings({
      personalizedHome: false,
      preloadNextTrack: false,
    });

    await expect(getAppSettings()).resolves.toMatchObject({
      personalizedHome: false,
      preloadNextTrack: false,
      downloadNotifications: true,
    });
  });

  it('notifies mounted consumers after a change', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAppSettings(listener);

    await updateAppSettings({ downloadNotifications: false });
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ downloadNotifications: false })
    );

    unsubscribe();
  });

  it('preserves rapid changes to different preferences', async () => {
    await Promise.all([
      updateAppSettings({ personalizedHome: false }),
      updateAppSettings({ preloadNextTrack: false }),
      updateAppSettings({ automaticUpdates: false }),
    ]);

    await expect(getAppSettings()).resolves.toMatchObject({
      personalizedHome: false,
      preloadNextTrack: false,
      automaticUpdates: false,
    });
  });
});
