export const LYRICS_PROVIDERS = [
  { id: 'lrc-red', name: 'lrc.red', timing: 'word' },
  { id: 'bini', name: 'BiniLyrics', timing: 'word' },
  { id: 'better', name: 'BetterLyrics', timing: 'word' },
  { id: 'portato', name: 'BetterLyrics Portato', timing: 'word' },
  { id: 'lyrics-plus', name: 'LyricsPlus', timing: 'word' },
  { id: 'unison', name: 'Unison', timing: 'word' },
  { id: 'youtube', name: 'YouTube Music', timing: 'plain' },
  { id: 'lrclib', name: 'LRCLIB', timing: 'line' },
  { id: 'letras', name: 'Letras', timing: 'plain' },
] as const;

export type LyricsProviderId = typeof LYRICS_PROVIDERS[number]['id'];
export type LyricsProviderSelection = LyricsProviderId | 'auto';
export type LyricsProviderStatus = 'loading' | 'found' | 'missing' | 'error' | 'cancelled' | 'timeout' | 'restricted';
export const DEFAULT_LYRICS_ORDER = LYRICS_PROVIDERS.map((provider) => provider.id);
export const isLyricsProvider = (value: unknown): value is LyricsProviderId =>
  LYRICS_PROVIDERS.some((provider) => provider.id === value);

export const normalizeLyricsOrder = (value: unknown): LyricsProviderId[] => {
  const stored = Array.isArray(value) ? value.filter(isLyricsProvider) : [];
  return [...new Set([...stored, ...DEFAULT_LYRICS_ORDER])];
};

export const lyricsProviderName = (id?: string) =>
  LYRICS_PROVIDERS.find((provider) => provider.id === id)?.name || id || 'Automatico';
