import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAudioChannelMode } from '../../services/audio/playerService';
import { getCachedAppSettings, resetAppSettings, updateAppSettings } from '../../services/settings/appSettings';
import { logConfig } from '../../utils/appLogger';
import { useAppSettingsStore } from '../useAppSettingsStore';

jest.mock('../../services/audio/playerService', () => ({
  setAudioChannelMode: jest.fn().mockResolvedValue(undefined),
}));

describe('settings store audio output', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.mocked(setAudioChannelMode).mockReset().mockResolvedValue(undefined);
    await resetAppSettings();
    useAppSettingsStore.setState({ isReady: false });
    await useAppSettingsStore.getState().hydrate();
  });

  it('applies real channel processing before publishing the preference', async () => {
    jest.mocked(setAudioChannelMode).mockImplementationOnce(async () => {
      expect(getCachedAppSettings().audioChannelMode).toBe('stereo');
    });
    await useAppSettingsStore.getState().setSetting('audioChannelMode', 'mono');
    expect(setAudioChannelMode).toHaveBeenCalledWith('mono');
    expect(useAppSettingsStore.getState().settings.audioChannelMode).toBe('mono');
  });

  it('does not save mono if the active engine refuses it', async () => {
    jest.mocked(setAudioChannelMode).mockRejectedValueOnce(new Error('CORS unavailable'));
    await expect(useAppSettingsStore.getState().setSetting('audioChannelMode', 'mono')).rejects.toThrow('CORS unavailable');
    expect(getCachedAppSettings().audioChannelMode).toBe('stereo');
  });

  it('restores the output mode if persistence fails after processing changes', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));
    await expect(useAppSettingsStore.getState().setSetting('audioChannelMode', 'mono')).rejects.toThrow('storage full');
    expect(setAudioChannelMode).toHaveBeenNthCalledWith(1, 'mono');
    expect(setAudioChannelMode).toHaveBeenNthCalledWith(2, 'stereo');
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
});
