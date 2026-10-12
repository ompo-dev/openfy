import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LYRICS_ORDER, isLyricsProvider, normalizeLyricsOrder, type LyricsProviderId } from '../lyrics/lyricsSources';

export type AudioChannelMode = 'stereo' | 'mono';
export type AudioQuality = 'high' | 'economy';

export type AppSettings = {
  personalizedHome: boolean;
  allowExplicitRecommendations: boolean;
  preloadNextTrack: boolean;
  downloadNotifications: boolean;
  automaticUpdates: boolean;
  audioChannelMode: AudioChannelMode;
  streamingQuality: AudioQuality;
  downloadQuality: AudioQuality;
  blurInactiveLyrics: boolean;
  captureLogs: boolean;
  verboseLogs: boolean;
  developerTools: boolean;
  lyricsEnabled: boolean;
  lyricsWordHighlight: boolean;
  lyricsAutoScroll: boolean;
  lyricsFontSize: number;
  reduceAnimations: boolean;
  reduceDynamicBlur: boolean;
  artworkBackdrop: boolean;
  preloadRadius: number;
  lyricsPreferSynced: boolean;
  lyricsOffsetMs: number;
  lyricsSourceOrder: LyricsProviderId[];
  lyricsDisabledSources: LyricsProviderId[];
  playbackSpeed: number;
  equalizerEnabled: boolean;
  equalizerMode: 'manual' | 'tone';
  equalizerBands: number[];
  equalizerToneX: number;
  equalizerToneY: number;
  equalizerFocused: boolean;
  audioBalance: number;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  personalizedHome: true,
  allowExplicitRecommendations: true,
  preloadNextTrack: true,
  downloadNotifications: true,
  automaticUpdates: true,
  audioChannelMode: 'stereo',
  streamingQuality: 'high',
  downloadQuality: 'high',
  blurInactiveLyrics: true,
  captureLogs: true,
  verboseLogs: false,
  developerTools: true,
  lyricsEnabled: true,
  lyricsWordHighlight: true,
  lyricsAutoScroll: true,
  lyricsFontSize: 26,
  reduceAnimations: false,
  reduceDynamicBlur: false,
  artworkBackdrop: true,
  preloadRadius: 2,
  lyricsPreferSynced: true,
  lyricsOffsetMs: 0,
  lyricsSourceOrder: DEFAULT_LYRICS_ORDER,
  lyricsDisabledSources: [],
  playbackSpeed: 1,
  equalizerEnabled: false,
  equalizerMode: 'manual',
  equalizerBands: [0, 0, 0, 0, 0, 0, 0],
  equalizerToneX: 0,
  equalizerToneY: 0,
  equalizerFocused: false,
  audioBalance: 0,
};

const STORAGE_KEY = 'openfy_app_settings_v1';
const listeners = new Set<(settings: AppSettings) => void>();
let cachedSettings = DEFAULT_APP_SETTINGS;
let hydration: Promise<AppSettings> | null = null;
let hydrated = false;
let mutationQueue: Promise<unknown> = Promise.resolve();

export const normalizeAppSettings = (value: unknown): AppSettings => {
  const stored = value && typeof value === 'object'
    ? value as Partial<AppSettings>
    : {};

  const base = Object.fromEntries(
    Object.entries(DEFAULT_APP_SETTINGS).map(([key, fallback]) => [
      key,
      typeof fallback === 'boolean'
        ? typeof stored[key as keyof AppSettings] === 'boolean'
          ? stored[key as keyof AppSettings] : fallback
        : typeof fallback !== 'string' ? fallback : typeof stored[key as keyof AppSettings] === 'string' &&
          (key === 'equalizerMode' ? ['manual', 'tone'] :
          (key === 'audioChannelMode' ? ['stereo', 'mono'] : ['high', 'economy'])
          ).includes(String(stored[key as keyof AppSettings]))
          ? stored[key as keyof AppSettings] : fallback,
    ])
  ) as AppSettings;
  const numeric = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  return { ...base,
    lyricsSourceOrder: normalizeLyricsOrder(stored.lyricsSourceOrder),
    lyricsDisabledSources: Array.isArray(stored.lyricsDisabledSources)
      ? [...new Set(stored.lyricsDisabledSources.filter(isLyricsProvider))] : [],
    lyricsOffsetMs: numeric(stored.lyricsOffsetMs, 0, -10_000, 10_000),
    lyricsFontSize: numeric(stored.lyricsFontSize, 26, 18, 34),
    preloadRadius: Math.round(numeric(stored.preloadRadius, 2, 1, 3)),
    playbackSpeed: numeric(stored.playbackSpeed, 1, 0.5, 2),
    equalizerBands: DEFAULT_APP_SETTINGS.equalizerBands.map((_, index) =>
      numeric(Array.isArray(stored.equalizerBands) ? stored.equalizerBands[index] : undefined, 0, -12, 12)),
    equalizerToneX: numeric(stored.equalizerToneX, 0, -5, 5),
    equalizerToneY: numeric(stored.equalizerToneY, 0, -5, 5),
    audioBalance: numeric(stored.audioBalance, 0, -1, 1),
  };
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
      const settings = normalizeAppSettings(raw ? JSON.parse(raw) : null);
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
    const next = normalizeAppSettings({ ...current, ...update });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    publish(next);
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
