import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyAudioPreferences } from '../../services/audio/playerService';
import { getCachedAppSettings, resetAppSettings, updateAppSettings } from '../../services/settings/appSettings';
import { logConfig } from '../../utils/appLogger';
import { useAppSettingsStore } from '../useAppSettingsStore';

jest.mock('../../services/audio/playerService', () => ({
  applyAudioPreferences: jest.fn().mockResolvedValue(undefined),
}));

describe('settings store audio output', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.mocked(applyAudioPreferences).mockReset().mockResolvedValue(undefined);
    await resetAppSettings();
    useAppSettingsStore.setState({ isReady: false });
    await useAppSettingsStore.getState().hydrate();
  });

  it('applies real channel processing before publishing the preference', async () => {
    jest.mocked(applyAudioPreferences).mockImplementationOnce(async () => {
      expect(getCachedAppSettings().audioChannelMode).toBe('stereo');
    });
    await useAppSettingsStore.getState().setSetting('audioChannelMode', 'mono');
    expect(applyAudioPreferences).toHaveBeenCalledWith(expect.objectContaining({ audioChannelMode: 'mono' }));
    expect(useAppSettingsStore.getState().settings.audioChannelMode).toBe('mono');
  });

  it('does not save mono if the active engine refuses it', async () => {
    jest.mocked(applyAudioPreferences).mockRejectedValueOnce(new Error('CORS unavailable'));
    await expect(useAppSettingsStore.getState().setSetting('audioChannelMode', 'mono')).rejects.toThrow('CORS unavailable');
    expect(getCachedAppSettings().audioChannelMode).toBe('stereo');
  });

  it('restores the output mode if persistence fails after processing changes', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));
    await expect(useAppSettingsStore.getState().setSetting('audioChannelMode', 'mono')).rejects.toThrow('storage full');
    expect(applyAudioPreferences).toHaveBeenNthCalledWith(1, expect.objectContaining({ audioChannelMode: 'mono' }));
    expect(applyAudioPreferences).toHaveBeenNthCalledWith(2, expect.objectContaining({ audioChannelMode: 'stereo' }));
    expect(useAppSettingsStore.getState().settings.audioChannelMode).toBe('stereo');
  });

  it('synchronizes persisted logging settings even after early hydration', async () => {
    await updateAppSettings({ captureLogs: false, verboseLogs: true });
    logConfig.capture = true;
    logConfig.verbose = false;
    useAppSettingsStore.setState({ isReady: false });
    await useAppSettingsStore.getState().hydrate();
    expect(logConfig.capture).toBe(false);
    expect(logConfig.verbose).toBe(true);
  });

  it('restores actual processing, not only settings, when resetting', async () => {
    await useAppSettingsStore.getState().setSetting('equalizerBands', [6, 0, 0, 0, 0, 0, 0]);
    await useAppSettingsStore.getState().resetSettings();
    expect(applyAudioPreferences).toHaveBeenLastCalledWith(expect.objectContaining({
      equalizerEnabled: false, equalizerBands: [0, 0, 0, 0, 0, 0, 0], playbackSpeed: 1 }));
  });

  it('keeps rapid changes to different EQ bands instead of overwriting a stale array', async () => {
    const update = (index: number, gain: number) => (bands: number[]) => bands.map((value, i) => index === i ? gain : value);
    await Promise.all([
      useAppSettingsStore.getState().setSetting('equalizerBands', update(0, 6)),
      useAppSettingsStore.getState().setSetting('equalizerBands', update(1, 4)),
    ]);
    expect(getCachedAppSettings().equalizerBands).toEqual([6, 4, 0, 0, 0, 0, 0]);
  });
});
