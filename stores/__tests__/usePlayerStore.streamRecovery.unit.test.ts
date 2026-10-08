jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@services', () => ({
  ...jest.requireActual('../../services/audio/playbackDuration'),
  DEFAULT_STATE: {
    isPlaying: false,
    isBuffering: false,
    isLoaded: false,
    positionMs: 0,
    durationMs: 0,
  },
  loadAndPlay: jest.fn(),
  beginTrackChange: jest.fn(),
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  seekTo: jest.fn().mockResolvedValue(undefined),
  unload: jest.fn().mockResolvedValue(undefined),
  getStatus: jest.fn(() => ({ isPlaying: false })),
  resolveAudioUrl: jest.fn(),
  getPlayableAudioUrl: jest.fn((url: string) => url),
  downloadTrack: jest.fn().mockResolvedValue(null),
  ensurePlaybackDiagnostics: jest.fn().mockResolvedValue(undefined),
  getDownloadedTrack: jest.fn().mockResolvedValue(null),
  fadeOutCurrent: jest.fn().mockResolvedValue(undefined),
  restoreCurrentVolume: jest.fn().mockResolvedValue(undefined),
  preloadAudio: jest.fn().mockResolvedValue(undefined),
  releasePreloadedAudio: jest.fn(),
  setRemotePlaybackHandlers: jest.fn(),
  recordInteraction: jest.fn().mockResolvedValue(undefined),
  reportDirectYouTubeStreamRefusal: jest.fn().mockResolvedValue(undefined),
  getDirectYouTubeMediaHeaders: jest.fn((url: string) => {
    if (url && url.includes('googlevideo.com')) {
      return { 'User-Agent': 'com.google.ios.youtube/19.09.3' };
    }
    return null;
  }),
  hasNativeYouTubePlayback: jest.fn().mockReturnValue(false),
  parseNativeYouTubePlaybackUri: jest.fn((uri: string) =>
    uri.startsWith('openfy-youtube://video/')
      ? uri.slice('openfy-youtube://video/'.length)
      : null
  ),
  resolveSpotifyTrackVideoId: jest.fn(),
  resolveCatalogYouTubeVideoId: jest.fn(),
  toNativeYouTubePlaybackUri: jest.fn(
    (videoId: string) => `openfy-youtube://video/${videoId}`
  ),
}));

jest.mock('../../services/lyrics/lyricsService', () => ({
  fetchLyrics: jest.fn().mockResolvedValue(null),
  saveLyricsOffline: jest.fn().mockResolvedValue(undefined),
}));

import {
  hasNativeYouTubePlayback,
  loadAndPlay,
  reportDirectYouTubeStreamRefusal,
  resolveAudioUrl,
  resolveSpotifyTrackVideoId,
  resolveCatalogYouTubeVideoId,
  seekTo,
  type PlayerState,
} from '@services';
import { usePlayerStore, type PlayerTrack } from '../usePlayerStore';
import * as FileSystem from 'expo-file-system/legacy';

const sampleTrack: PlayerTrack = {
  spotifyId: 'track_123',
  title: 'Musica Teste',
  artistName: 'Artista Teste',
  albumName: 'Album Teste',
  imageURL: 'https://image.test/cover.jpg',
  duration_ms: 210000,
};

/** Deterministic promise/microtask flush helper (setTimeout 0 runs in next macrotask turn) */
const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('usePlayerStore — Stream Recovery Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadAndPlay).mockReset();
    jest.mocked(resolveAudioUrl).mockReset();
    jest.mocked(resolveSpotifyTrackVideoId).mockReset();
    jest.mocked(resolveCatalogYouTubeVideoId).mockReset();
    const { ensurePlaybackDiagnostics } = jest.requireMock('@services');
    (ensurePlaybackDiagnostics as jest.Mock)
      .mockReset()
      .mockResolvedValue(undefined);
    jest.mocked(hasNativeYouTubePlayback).mockReturnValue(false);
    usePlayerStore.setState({
      activeRequestId: 0,
      queue: [],
      queueIndex: 0,
      currentTrack: null,
      isLoadingAudio: false,
      playerState: {
        isPlaying: false,
        isBuffering: false,
        isLoaded: false,
        positionMs: 0,
        durationMs: 0,
      },
    });
  });

  it('routes a catalog-only track through the native iOS streaming engine', async () => {
    jest.mocked(hasNativeYouTubePlayback).mockReturnValue(true);
    jest.mocked(resolveSpotifyTrackVideoId).mockResolvedValue({
      status: 'resolved',
      videoId: 'V1M1hYxmRvA',
      confidence: 100,
      matchedBy: 'search',
    } as any);
    jest.mocked(loadAndPlay).mockResolvedValue(true);

    await usePlayerStore.getState().playTrack(sampleTrack);

    expect(loadAndPlay).toHaveBeenCalledWith(
      'openfy-youtube://video/V1M1hYxmRvA',
      expect.any(Function),
      expect.objectContaining({ title: sampleTrack.title }),
      0,
      sampleTrack,
      { trackChangeAlreadyBegun: true }
    );
    expect(resolveAudioUrl).not.toHaveBeenCalled();
  });

  it('validates a YouTube catalog song before starting native playback', async () => {
    jest.mocked(hasNativeYouTubePlayback).mockReturnValue(true);
    jest.mocked(resolveCatalogYouTubeVideoId).mockResolvedValue({
      status: 'resolved', videoId: '9ld721cY0Uk', confidence: 100,
    });
    jest.mocked(loadAndPlay).mockResolvedValue(true);
    const track = { ...sampleTrack, spotifyId: 'yt_9jqQYznGl-w', title: 'Tres da Madruga',
      artistName: 'Yago Oproprio, Ro Rosa', duration_ms: 150000 };
    await usePlayerStore.getState().playTrack(track);
    expect(loadAndPlay).toHaveBeenCalledWith(
      'openfy-youtube://video/9ld721cY0Uk', expect.any(Function),
      expect.any(Object), 0, track, { trackChangeAlreadyBegun: true }
    );
    expect(resolveCatalogYouTubeVideoId).toHaveBeenCalledWith({
      videoId: '9jqQYznGl-w', title: track.title, artists: [track.artistName], durationMs: 150000,
    });
    expect(resolveAudioUrl).not.toHaveBeenCalled();
  });

  it('reconciles a doubled media timeline with the canonical track duration', async () => {
    const durationTrack = {
      ...sampleTrack,
      spotifyId: 'track_duration_double',
    };
    let status!: (state: PlayerState) => void;
    jest.mocked(resolveAudioUrl).mockResolvedValue({
      url: 'https://media.test/song.m4a',
      source: 'youtube',
    } as any);
    jest.mocked(loadAndPlay).mockImplementation(async (_source, callback) => {
      status = callback!;
      return true;
    });

    await usePlayerStore.getState().playTrack(durationTrack);
    status({
      isPlaying: true,
      isBuffering: false,
      isLoaded: true,
      positionMs: 42000,
      durationMs: durationTrack.duration_ms * 2,
    });

    expect(usePlayerStore.getState().playerState).toMatchObject({
      positionMs: 42000,
      durationMs: durationTrack.duration_ms,
    });
  });

  it('completes the full recovery cycle on mid-stream 403 refusal: reports refusal, re-resolves fresh, reloads with headers, seeks to last position, and resets recovery flag', async () => {
    const oldUrl = 'https://rr1---sn-ab5szn7e.googlevideo.com/videoplayback?c=IOS';
    const freshUrl = 'https://rr2---sn-ab5szn7e.googlevideo.com/videoplayback?c=ANDROID_MUSIC';
    const freshHeaders = { 'User-Agent': 'com.google.android.youtube/21.03.36' };

    let capturedStatusCb: ((state: PlayerState) => void) | null = null;

    // Initial resolution returns oldUrl
    (resolveAudioUrl as jest.Mock).mockResolvedValueOnce({
      url: oldUrl,
      source: 'youtube',
      headers: { 'User-Agent': 'com.google.ios.youtube/19.09.3' },
    });

    // loadAndPlay captures the status callback
    (loadAndPlay as jest.Mock).mockImplementation((source, onStatus) => {
      capturedStatusCb = onStatus;
      return Promise.resolve(true);
    });

    // 1. Play track
    await usePlayerStore.getState().playTrack(sampleTrack);

    expect(loadAndPlay).toHaveBeenCalledTimes(1);
    expect(capturedStatusCb).toBeDefined();

    // Setup mock for fresh recovery resolution
    (resolveAudioUrl as jest.Mock).mockResolvedValueOnce({
      url: freshUrl,
      source: 'youtube',
      headers: freshHeaders,
    });

    // 2. Simulate mid-stream 403 failure at 83.42s
    capturedStatusCb!({
      isPlaying: false,
      isBuffering: false,
      isLoaded: false,
      positionMs: 83420,
      durationMs: 210000,
      error: 'HTTP 403 Forbidden',
    });

    // Flush async recovery microtasks
    await flushPromises();
    await flushPromises();

    // 3. Verify report refusal was called with old URL
    expect(reportDirectYouTubeStreamRefusal).toHaveBeenCalledWith(oldUrl, 403);

    // 4. Verify fresh resolution was requested (forceFresh = true)
    expect(resolveAudioUrl).toHaveBeenLastCalledWith(
      sampleTrack.title,
      sampleTrack.artistName,
      sampleTrack.spotifyId,
      sampleTrack.duration_ms,
      undefined,
      true,
      'high'
    );

    // 5. Verify loadAndPlay was called with recovered source including headers
    expect(loadAndPlay).toHaveBeenCalledTimes(2);
    expect(loadAndPlay).toHaveBeenLastCalledWith(
      { uri: freshUrl, headers: freshHeaders },
      expect.any(Function),
      expect.objectContaining({
        title: sampleTrack.title,
        artist: sampleTrack.artistName,
      }),
      0,
      sampleTrack
    );

    // 6. Verify seekTo was called with the exact last position
    expect(seekTo).toHaveBeenCalledWith(83420);

    // 7. Verify isRecoveringStream was reset: another mid-stream error should trigger recovery again
    const secondFreshUrl = 'https://rr3---sn-ab5szn7e.googlevideo.com/videoplayback?c=IOS';
    (resolveAudioUrl as jest.Mock).mockResolvedValueOnce({
      url: secondFreshUrl,
      source: 'youtube',
      headers: { 'User-Agent': 'com.google.ios.youtube/19.09.3' },
    });

    capturedStatusCb!({
      isPlaying: false,
      isBuffering: false,
      isLoaded: false,
      positionMs: 120000,
      durationMs: 210000,
      error: 'HTTP 410 Gone',
    });

    await flushPromises();
    await flushPromises();

    expect(reportDirectYouTubeStreamRefusal).toHaveBeenCalledWith(freshUrl, 403);
    expect(loadAndPlay).toHaveBeenCalledTimes(3);
    expect(seekTo).toHaveBeenCalledWith(120000);
  });

  it('does NOT report refusal for decoder/timeout errors but still recovers stream', async () => {
    const initialUrl = 'https://rr1---sn-ab5szn7e.googlevideo.com/videoplayback?c=IOS';
    const recoveredUrl = 'https://rr2---sn-ab5szn7e.googlevideo.com/videoplayback?c=IOS';

    let capturedStatusCb: ((state: PlayerState) => void) | null = null;

    (resolveAudioUrl as jest.Mock).mockResolvedValueOnce({
      url: initialUrl,
      source: 'youtube',
    });

    (loadAndPlay as jest.Mock).mockImplementation((source, onStatus) => {
      capturedStatusCb = onStatus;
      return Promise.resolve(true);
    });

    await usePlayerStore.getState().playTrack(sampleTrack);

    (resolveAudioUrl as jest.Mock).mockResolvedValueOnce({
      url: recoveredUrl,
      source: 'youtube',
    });

    // Simulate decoder error
    capturedStatusCb!({
      isPlaying: false,
      isBuffering: false,
      isLoaded: false,
      positionMs: 45000,
      durationMs: 210000,
      error: 'AVFoundation decoder error -12939',
    });

    await flushPromises();
    await flushPromises();

    // Refusal should NOT be reported (avoid penalising healthy client)
    expect(reportDirectYouTubeStreamRefusal).not.toHaveBeenCalled();

    // Fresh resolve should still happen
    expect(resolveAudioUrl).toHaveBeenLastCalledWith(
      sampleTrack.title,
      sampleTrack.artistName,
      sampleTrack.spotifyId,
      sampleTrack.duration_ms,
      undefined,
      true,
      'high'
    );

    expect(loadAndPlay).toHaveBeenCalledTimes(2);
    expect(seekTo).toHaveBeenCalledWith(45000);
  });

  it('stops recovery after 3 consecutive rapid failures without stability, but resets after 10s of stable playback', async () => {
    let capturedStatusCb: ((state: PlayerState) => void) | null = null;

    (resolveAudioUrl as jest.Mock).mockResolvedValue({
      url: 'https://rr1---sn-ab5szn7e.googlevideo.com/videoplayback?c=IOS',
      source: 'youtube',
    });

    (loadAndPlay as jest.Mock).mockImplementation((source, onStatus) => {
      capturedStatusCb = onStatus;
      return Promise.resolve(true);
    });

    await usePlayerStore.getState().playTrack(sampleTrack);

    // 1. Trigger recovery #1 at 10s
    capturedStatusCb!({
      isPlaying: false,
      isBuffering: false,
      isLoaded: false,
      positionMs: 10000,
      durationMs: 210000,
      error: 'HTTP 403 Forbidden',
    });
    await flushPromises();
    await flushPromises();
    expect(loadAndPlay).toHaveBeenCalledTimes(2);

    // 2. Stream plays stably for >=10s past the resume position (10s + 10s = 20s)
    capturedStatusCb!({
      isPlaying: true,
      isBuffering: false,
      isLoaded: true,
      positionMs: 22000,
      durationMs: 210000,
    });

    // 3. Now trigger 3 consecutive rapid failures (attempts 1, 2, 3 of new streak)
    for (let i = 1; i <= 3; i++) {
      capturedStatusCb!({
        isPlaying: false,
        isBuffering: false,
        isLoaded: false,
        positionMs: 22000 + i * 1000,
        durationMs: 210000,
        error: 'HTTP 403 Forbidden',
      });
      await flushPromises();
      await flushPromises();
    }

    // Total loadAndPlay calls: 1 initial + 1 (first recovery) + 3 (consecutive recoveries) = 5
    expect(loadAndPlay).toHaveBeenCalledTimes(5);

    // 4. Trigger 4th consecutive failure without stable playback — blocked by limit
    capturedStatusCb!({
      isPlaying: false,
      isBuffering: false,
      isLoaded: false,
      positionMs: 26000,
      durationMs: 210000,
      error: 'HTTP 403 Forbidden',
    });
    await flushPromises();
    await flushPromises();

    // Still 5 calls (4th rapid failure was ignored)
    expect(loadAndPlay).toHaveBeenCalledTimes(5);
  });

  it('preserves identity headers when replaying from track.streamUrl cache in getFreshPreloadedSource', async () => {
    const googlevideoUrl = 'https://rr5---sn-ab5szn7e.googlevideo.com/videoplayback?c=IOS';
    const cachedTrack: PlayerTrack = {
      ...sampleTrack,
      spotifyId: 'track_cached',
      streamUrl: googlevideoUrl,
      streamExpiresAt: Date.now() + 60_000,
    };

    (loadAndPlay as jest.Mock).mockResolvedValue(true);

    await usePlayerStore.getState().playTrack(cachedTrack);

    // loadAndPlay should have received an object with headers, not just a raw string
    expect(loadAndPlay).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: googlevideoUrl,
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('youtube'),
        }),
      }),
      expect.any(Function),
      expect.any(Object),
      expect.any(Number),
      cachedTrack,
      { trackChangeAlreadyBegun: true }
    );
  });

  it('recovers a downloaded track offline from its last known position without contacting a provider', async () => {
    const local = {
      ...sampleTrack,
      spotifyId: 'offline-recovery',
      localAudioPath: 'file:///offline.m4a',
      localImagePath: 'file:///offline-cover.jpg',
    };
    jest
      .mocked(FileSystem.getInfoAsync)
      .mockResolvedValue({ exists: true, size: 80000 } as any);
    let status!: (state: PlayerState) => void;
    jest.mocked(loadAndPlay).mockImplementation(async (_source, callback) => {
      status = callback!;
      return true;
    });
    await usePlayerStore.getState().playTrack(local);
    status({
      isPlaying: true,
      isLoaded: true,
      isBuffering: false,
      positionMs: 83000,
      durationMs: 210000,
    });
    status({
      isPlaying: false,
      isLoaded: false,
      isBuffering: false,
      positionMs: 0,
      durationMs: 0,
      error: 'decoder reset',
    });
    await flushPromises();
    expect(resolveAudioUrl).not.toHaveBeenCalled();
    expect(reportDirectYouTubeStreamRefusal).not.toHaveBeenCalled();
    expect(loadAndPlay).toHaveBeenLastCalledWith(
      local.localAudioPath,
      expect.any(Function),
      expect.objectContaining({ artworkUrl: local.localImagePath }),
      0,
      local
    );
    expect(seekTo).toHaveBeenCalledWith(83000);
    jest.mocked(FileSystem.getInfoAsync).mockReset();
  });

  it('retries an initial local load in place without resolving an online version', async () => {
    const local = { ...sampleTrack, spotifyId: 'initial-local-retry', localAudioPath: 'file:///ay-bebe.m4a' };
    jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 80000 } as any);
    jest.mocked(loadAndPlay).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await usePlayerStore.getState().playTrack(local);
    expect(loadAndPlay).toHaveBeenCalledTimes(2);
    expect(loadAndPlay).toHaveBeenLastCalledWith(local.localAudioPath, expect.any(Function), expect.any(Object), 0, local);
    expect(resolveAudioUrl).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().history[0].spotifyId).toBe(local.spotifyId);
    expect(usePlayerStore.getState().isLoadingAudio).toBe(false);
    jest.mocked(FileSystem.getInfoAsync).mockReset();
  });

  it('bounds failed local retries and never substitutes another recording', async () => {
    const local = { ...sampleTrack, spotifyId: 'initial-local-failure', localAudioPath: 'file:///broken.m4a' };
    jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 80000 } as any);
    jest.mocked(loadAndPlay).mockImplementation(async (_source, callback) => {
      callback!({ isPlaying: false, isLoaded: false, isBuffering: false, positionMs: 0, durationMs: 0, error: 'decoder error' });
      return false;
    });
    await usePlayerStore.getState().playTrack(local);
    expect(loadAndPlay).toHaveBeenCalledTimes(2);
    expect(resolveAudioUrl).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().playerState.error).toBe('decoder error');
    jest.mocked(FileSystem.getInfoAsync).mockReset();
  });

  it('keeps request ids monotonic when playback diagnostics hydrate slowly', async () => {
    const firstTrack = { ...sampleTrack, spotifyId: 'track_slow', title: 'Lenta' };
    const secondTrack = { ...sampleTrack, spotifyId: 'track_fast', title: 'Nova' };
    let finishDiagnostics!: () => void;
    const { ensurePlaybackDiagnostics } = jest.requireMock('@services');
    (ensurePlaybackDiagnostics as jest.Mock)
      .mockReturnValueOnce(new Promise<void>((resolve) => {
        finishDiagnostics = resolve;
      }))
      .mockResolvedValueOnce(undefined);
    (resolveAudioUrl as jest.Mock)
      .mockResolvedValueOnce({ url: 'https://media.test/slow.m4a' })
      .mockResolvedValueOnce({ url: 'https://media.test/new.m4a' });
    (loadAndPlay as jest.Mock).mockResolvedValue(true);

    const first = usePlayerStore.getState().playTrack(firstTrack);
    const second = usePlayerStore.getState().playTrack(secondTrack);
    await second;
    finishDiagnostics();
    await first;

    expect(usePlayerStore.getState().activeRequestId).toBe(2);
    expect(usePlayerStore.getState().currentTrack?.spotifyId).toBe('track_fast');
    expect(loadAndPlay).toHaveBeenCalledTimes(1);
    expect(loadAndPlay).toHaveBeenCalledWith(
      'https://media.test/new.m4a',
      expect.any(Function),
      expect.objectContaining({ title: 'Nova' }),
      0,
      secondTrack,
      { trackChangeAlreadyBegun: true }
    );
  });
});
