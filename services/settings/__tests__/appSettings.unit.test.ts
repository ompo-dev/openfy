import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  getCachedAppSettings,
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

  it('migrates existing boolean preferences without dropping them', () => {
    expect(normalizeAppSettings({ personalizedHome: false, automaticUpdates: false })).toEqual({
      ...DEFAULT_APP_SETTINGS, personalizedHome: false, automaticUpdates: false,
    });
  });

  it('validates enum values and rejects corrupt stored types', () => {
    expect(normalizeAppSettings({ audioChannelMode: 'surround', streamingQuality: true,
      downloadQuality: {}, blurInactiveLyrics: 'false' })).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings({ audioChannelMode: 'mono', streamingQuality: 'economy',
      downloadQuality: 'high' })).toMatchObject({ audioChannelMode: 'mono', streamingQuality: 'economy', downloadQuality: 'high' });
  });

  it('persists audio and diagnostic preferences independently', async () => {
    await updateAppSettings({ audioChannelMode: 'mono', streamingQuality: 'economy',
      downloadQuality: 'high', captureLogs: false, verboseLogs: true });
    const stored = JSON.parse((await AsyncStorage.getItem('openfy_app_settings_v1'))!);
    expect(stored).toEqual(getCachedAppSettings());
    expect(stored).toMatchObject({ audioChannelMode: 'mono', streamingQuality: 'economy', downloadQuality: 'high', captureLogs: false, verboseLogs: true });
  });

  it('does not publish a preference when persistence fails', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAppSettings(listener);
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));
    await expect(updateAppSettings({ streamingQuality: 'economy' })).rejects.toThrow('storage full');
    expect(getCachedAppSettings().streamingQuality).toBe('high');
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
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
