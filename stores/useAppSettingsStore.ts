import { create } from 'zustand';

import {
  DEFAULT_APP_SETTINGS,
  getAppSettings,
  resetAppSettings,
  subscribeAppSettings,
  updateAppSettings,
  type AppSettings,
} from '../services/settings/appSettings';
import { executeCommand } from '../src/application/commandBus';
import { log, logConfig } from '../utils/appLogger';
import { setAudioChannelMode } from '../services/audio/playerService';

type AppSettingsState = {
  settings: AppSettings;
  isReady: boolean;
  hydrate: () => Promise<void>;
  setSetting: <Key extends keyof AppSettings>(
    key: Key,
    value: AppSettings[Key]
  ) => Promise<void>;
  resetSettings: () => Promise<void>;
};

let hydration: Promise<void> | null = null;
let unsubscribeSettings: (() => void) | null = null;

export const useAppSettingsStore = create<AppSettingsState>((set, get) => ({
  settings: DEFAULT_APP_SETTINGS,
  isReady: false,
  hydrate: () => {
    if (get().isReady) return Promise.resolve();
    if (hydration) return hydration;
    const finish = log.time('ui', 'settings store hydration');
    unsubscribeSettings ||= subscribeAppSettings((settings) => {
      logConfig.capture = settings.captureLogs;
      logConfig.verbose = settings.verboseLogs;
      set({ settings });
    });
    hydration = getAppSettings()
      .then((settings) => {
        logConfig.capture = settings.captureLogs;
        logConfig.verbose = settings.verboseLogs;
        set({ settings, isReady: true });
        finish({ ok: true });
      })
      .catch((error: unknown) => {
        finish({ ok: false, error: String(error) });
        throw error;
      })
      .finally(() => {
        hydration = null;
      });
    return hydration;
  },
  setSetting: async (key, value) => {
    await executeCommand({
      name: 'settings.update',
      category: 'ui',
      idempotencyKey: `${key}:${String(value)}`,
      successTtlMs: 0,
      execute: async () => {
        const previousMode = get().settings.audioChannelMode;
        let settings: AppSettings;
        try {
          if (key === 'audioChannelMode') await setAudioChannelMode(value as AppSettings['audioChannelMode']);
          settings = await updateAppSettings({ [key]: value });
        } catch (error) {
          if (key === 'audioChannelMode') await setAudioChannelMode(previousMode).catch(() => {});
          throw error;
        }
        set({ settings, isReady: true });
      },
    });
  },
  resetSettings: async () => {
    await executeCommand({
      name: 'settings.reset',
      category: 'ui',
      successTtlMs: 0,
      execute: async () => {
        const settings = await resetAppSettings();
        set({ settings, isReady: true });
      },
    });
  },
}));

export const initializeAppSettingsStore = () =>
  useAppSettingsStore.getState().hydrate();
