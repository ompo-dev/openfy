import { create } from 'zustand';

import {
  DEFAULT_APP_SETTINGS,
  getAppSettings,
  resetAppSettings,
  subscribeAppSettings,
  updateAppSettings,
  normalizeAppSettings,
  type AppSettings,
} from '../services/settings/appSettings';
import { executeCommand } from '../src/application/commandBus';
import { log, logConfig } from '../utils/appLogger';
import { applyAudioPreferences } from '../services/audio/playerService';

type AppSettingsState = {
  settings: AppSettings;
  isReady: boolean;
  hydrate: () => Promise<void>;
  setSetting: <Key extends keyof AppSettings>(
    key: Key,
    value: AppSettings[Key] | ((current: AppSettings[Key]) => AppSettings[Key])
  ) => Promise<void>;
  resetSettings: () => Promise<void>;
};

let hydration: Promise<void> | null = null;
let unsubscribeSettings: (() => void) | null = null;
let mutations: Promise<unknown> = Promise.resolve();
const AUDIO_KEYS = new Set<keyof AppSettings>(['audioChannelMode', 'playbackSpeed', 'equalizerEnabled',
  'equalizerMode', 'equalizerBands', 'equalizerToneX', 'equalizerToneY', 'equalizerFocused', 'audioBalance']);

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
      idempotencyKey: typeof value === 'function' ? undefined : `${key}:${String(value)}`,
      successTtlMs: 0,
      execute: async () => {
        const mutation = mutations.then(async () => {
          const previous = await getAppSettings();
          const updated = typeof value === 'function' ? value(previous[key]) : value;
          const next = normalizeAppSettings({ ...previous, [key]: updated });
          const finish = log.time('ui', 'setting change', { key, previous: previous[key], next: next[key],
            audioProcessing: AUDIO_KEYS.has(key) });
          try {
            if (AUDIO_KEYS.has(key)) await applyAudioPreferences(next);
            const settings = await updateAppSettings({ [key]: updated });
            set({ settings, isReady: true });
            finish({ ok: true, key, value: settings[key] });
          } catch (error) {
            if (AUDIO_KEYS.has(key)) await applyAudioPreferences(previous).catch((reason) =>
              log.error('audio settings rollback failed', { key, error: reason }));
            finish({ ok: false, key, error: String(error) });
            throw error;
          }
        });
        mutations = mutation.catch(() => {});
        await mutation;
      },
    });
  },
  resetSettings: async () => {
    await executeCommand({
      name: 'settings.reset',
      category: 'ui',
      successTtlMs: 0,
      execute: async () => {
        const mutation = mutations.then(async () => {
          const previous = await getAppSettings();
          const finish = log.time('ui', 'settings reset and audio apply');
          try {
            await applyAudioPreferences(DEFAULT_APP_SETTINGS);
            const settings = await resetAppSettings();
            set({ settings, isReady: true });
            finish({ ok: true });
          } catch (error) {
            await applyAudioPreferences(previous).catch((reason) => log.error('audio settings reset rollback failed', reason));
            finish({ ok: false, error: String(error) }); throw error;
          }
        });
        mutations = mutation.catch(() => {});
        await mutation;
      },
    });
  },
}));

export const initializeAppSettingsStore = () =>
  useAppSettingsStore.getState().hydrate();
