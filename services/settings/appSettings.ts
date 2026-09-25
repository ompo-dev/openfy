import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppSettings = {
  personalizedHome: boolean;
  allowExplicitRecommendations: boolean;
  preloadNextTrack: boolean;
  downloadNotifications: boolean;
  automaticUpdates: boolean;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  personalizedHome: true,
  allowExplicitRecommendations: true,
  preloadNextTrack: true,
  downloadNotifications: true,
  automaticUpdates: true,
};

const STORAGE_KEY = 'openfy_app_settings_v1';
const listeners = new Set<(settings: AppSettings) => void>();
let cachedSettings = DEFAULT_APP_SETTINGS;
let hydration: Promise<AppSettings> | null = null;
let hydrated = false;
let mutationQueue: Promise<unknown> = Promise.resolve();

const normalizeSettings = (value: unknown): AppSettings => {
  const stored = value && typeof value === 'object'
    ? value as Partial<AppSettings>
    : {};

  return Object.fromEntries(
    Object.entries(DEFAULT_APP_SETTINGS).map(([key, fallback]) => [
      key,
      typeof stored[key as keyof AppSettings] === 'boolean'
        ? stored[key as keyof AppSettings]
        : fallback,
    ])
  ) as AppSettings;
};

const publish = (settings: AppSettings) => {
  cachedSettings = settings;
  listeners.forEach((listener) => listener(settings));
};

export const getCachedAppSettings = (): AppSettings => cachedSettings;

export const getAppSettings = async (): Promise<AppSettings> => {
  if (hydrated) return cachedSettings;
  if (hydration) return hydration;

  hydration = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const settings = normalizeSettings(raw ? JSON.parse(raw) : null);
      publish(settings);
      hydrated = true;
      return settings;
    } catch {
      publish(DEFAULT_APP_SETTINGS);
      hydrated = true;
      return DEFAULT_APP_SETTINGS;
    }
  })();

  try {
    return await hydration;
  } finally {
    hydration = null;
  }
};

export const updateAppSettings = async (
  update: Partial<AppSettings>
): Promise<AppSettings> => {
  const mutation = mutationQueue.then(async () => {
    const current = await getAppSettings();
    const next = normalizeSettings({ ...current, ...update });
    publish(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  });
  mutationQueue = mutation.catch(() => {});
  return mutation;
};

export const resetAppSettings = async (): Promise<AppSettings> => {
  const mutation = mutationQueue.then(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    hydrated = true;
    publish(DEFAULT_APP_SETTINGS);
    return DEFAULT_APP_SETTINGS;
  });
  mutationQueue = mutation.catch(() => {});
  return mutation;
};

export const subscribeAppSettings = (
  listener: (settings: AppSettings) => void
) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
