import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../../settings/appSettings';
import { fetchLyricsFromLetras, fetchLyricsFromLrclib, type LyricsData } from '../lyricsService';

let mockSettings: AppSettings;
jest.mock('../../settings/appSettings', () => ({
  ...jest.requireActual('../../settings/appSettings'), getCachedAppSettings: () => mockSettings,
}));
jest.mock('../../youtubeMusicClient', () => ({ getYouTubeMusicClient: jest.fn(), getYouTubeMusicText: jest.fn() }));
jest.mock('../lyricsService', () => ({ ...jest.requireActual('../lyricsService'),
  fetchLyricsFromLetras: jest.fn(), fetchLyricsFromLrclib: jest.fn(), getOfflineLyrics: jest.fn().mockResolvedValue(null),
}));

let repository: typeof import('../lyricsRepository');
const query = { trackId: 'recording', trackName: 'Song', artistName: 'Artist', durationMs: 3000 };
const plain: LyricsData = { trackName: 'Song', artistName: 'Artist', source: 'letras', isSynced: false,
  plainLyrics: 'Plain text', segments: [] };
const synced: LyricsData = { ...plain, source: 'lrclib', isSynced: true,
  segments: [{ index: 0, text: 'Timed line', startTimeMs: 1000, endTimeMs: 3000 }] };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

describe('lyric provider orchestration', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockSettings = { ...DEFAULT_APP_SETTINGS, lyricsSourceOrder: ['letras', 'lrclib'], lyricsDisabledSources: [] };
    jest.mocked(fetchLyricsFromLetras).mockReset().mockResolvedValue(plain);
    jest.mocked(fetchLyricsFromLrclib).mockReset().mockResolvedValue(synced);
    jest.mocked(fetch).mockReset();
    jest.isolateModules(() => { repository = require('../lyricsRepository'); });
  });
  afterEach(async () => { await flush(); jest.useRealTimers(); jest.restoreAllMocks(); });

  it('waits for the preferred source rather than selecting the fastest response', async () => {
    mockSettings.lyricsPreferSynced = false;
    let finish!: (lyrics: LyricsData) => void;
    jest.mocked(fetchLyricsFromLetras).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const result = repository.fetchProviderLyrics(query);
    await flush();
    expect(fetchLyricsFromLrclib).toHaveBeenCalled();
    finish(plain);
    await expect(result).resolves.toEqual(plain);
  });

  it('prefers available synchronization over plain text and skips disabled sources', async () => {
    await expect(repository.fetchProviderLyrics(query)).resolves.toEqual(synced);
    mockSettings.lyricsDisabledSources = ['lrclib'];
    jest.mocked(fetchLyricsFromLrclib).mockClear();
    await expect(repository.fetchProviderLyrics(query)).resolves.toEqual(plain);
    expect(fetchLyricsFromLrclib).not.toHaveBeenCalled();
  });

  it('persists an explicit choice, consults only that provider and reuses it offline', async () => {
    await repository.setTrackLyricsProvider(query.trackId, 'lrclib');
    await expect(repository.fetchProviderLyrics(query)).resolves.toEqual(synced);
    await flush();
    expect(fetchLyricsFromLetras).not.toHaveBeenCalled();
    const key = (await AsyncStorage.getAllKeys()).find((key) => key.startsWith('openfy_provider_lyrics_v1:result:'))!;
    expect(JSON.parse((await AsyncStorage.getItem(key))!).lyrics.source).toBe('lrclib');
    jest.isolateModules(() => { repository = require('../lyricsRepository'); });
    jest.mocked(fetchLyricsFromLrclib).mockClear();
    await expect(repository.fetchProviderLyrics({ ...query, offline: true })).resolves.toEqual(synced);
    expect(fetchLyricsFromLrclib).not.toHaveBeenCalled();
    await expect(repository.getTrackLyricsProvider(query.trackId)).resolves.toBe('lrclib');
  });

  it('refreshes an explicitly selected source instead of returning its cached result', async () => {
    await repository.fetchProviderLyrics({ ...query, provider: 'lrclib' });
    jest.mocked(fetchLyricsFromLrclib).mockResolvedValueOnce({ ...synced, plainLyrics: 'New result' });
    await expect(repository.fetchProviderLyrics({ ...query, provider: 'lrclib', force: true }))
      .resolves.toMatchObject({ plainLyrics: 'New result' });
    expect(fetchLyricsFromLrclib).toHaveBeenCalledTimes(2);
  });

  it('does not leave cancelled lower-priority sources indefinitely loading', async () => {
    mockSettings.lyricsPreferSynced = false;
    mockSettings.lyricsSourceOrder = ['lrclib', 'letras'];
    jest.mocked(fetchLyricsFromLetras).mockImplementationOnce(() => new Promise(() => {}));
    const onAttempt = jest.fn();
    await expect(repository.fetchProviderLyrics({ ...query, onAttempt })).resolves.toEqual(synced);
    expect(onAttempt).toHaveBeenCalledWith('letras', 'cancelled');
  });

  it('does not let an older warmup overwrite a forced refresh in the offline cache', async () => {
    let finishOld!: (value: LyricsData) => void;
    jest.mocked(fetchLyricsFromLrclib).mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValueOnce({ ...synced, plainLyrics: 'Refreshed text' });
    const old = repository.fetchProviderLyrics({ ...query, provider: 'lrclib' });
    await flush();
    await repository.fetchProviderLyrics({ ...query, provider: 'lrclib', force: true });
    finishOld(synced);
    await old;
    await expect(repository.fetchProviderLyrics({ ...query, provider: 'lrclib', offline: true }))
      .resolves.toMatchObject({ plainLyrics: 'Refreshed text' });
  });

  it('does not make a network request when lyrics are disabled', async () => {
    mockSettings.lyricsEnabled = false;
    await expect(repository.fetchProviderLyrics(query)).resolves.toBeNull();
    expect(fetchLyricsFromLrclib).not.toHaveBeenCalled();
    expect(fetchLyricsFromLetras).not.toHaveBeenCalled();
  });

  it('uses a supplied ISRC to select the exact Bini recording, not a same-title first hit', async () => {
    const isrc = 'BRABC2600001';
    jest.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ results: [
      { track_name: 'Song', artist_name: 'Artist', isrc: 'BRABC2600002', lyricsUrl: 'https://lrc.red/s/wrong.ttml' },
      { track_name: 'Alternate title', isrc, lyricsUrl: `https://lrc.red/s/${isrc}.ttml` },
    ] }) } as Response).mockResolvedValueOnce({ ok: true, status: 200,
      text: async () => '<tt><body><p begin="1s" end="3s">Exact recording</p></body></tt>' } as Response);
    await expect(repository.fetchProviderLyrics({ ...query, provider: 'bini', isrc })).resolves.toMatchObject({
      source: 'bini', segments: [{ text: 'Exact recording', startTimeMs: 1000 }] });
    expect(fetch).toHaveBeenNthCalledWith(2, `https://lrc.red/s/${isrc}.ttml`, expect.anything());
  });

  it('bounds stalled requests and cancels immediately even when a source ignores abort', async () => {
    jest.useFakeTimers();
    jest.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const cancelled = repository.fetchProviderLyrics({ ...query, provider: 'better', signal: controller.signal });
    await flush();
    controller.abort();
    await expect(cancelled).resolves.toBeNull();
    const stalled = repository.fetchProviderLyrics({ ...query, provider: 'better' });
    await flush();
    jest.advanceTimersByTime(8001);
    await expect(stalled).resolves.toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not publish a choice when persistence fails', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));
    await expect(repository.setTrackLyricsProvider(query.trackId, 'better')).rejects.toThrow('storage full');
    expect(repository.getCachedTrackLyricsProvider(query.trackId)).toBe('auto');
    await repository.setTrackLyricsProvider(query.trackId, 'lrclib');
    expect(repository.getCachedTrackLyricsProvider(query.trackId)).toBe('lrclib');
  });
});
