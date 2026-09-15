jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  preload: jest.fn(),
  clearPreloadedSource: jest.fn(),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));
jest.mock('../localAudioRepair', () => ({ prepareLocalAudioForPlayback: jest.fn().mockResolvedValue(undefined) }));
import { prepareLocalAudioForPlayback } from '../localAudioRepair';

import {
  clearPreloadedSource,
  createAudioPlayer,
  preload,
  setAudioModeAsync,
} from 'expo-audio';
import { Platform } from 'react-native';
import {
  _resetDownloadDiagnosticsForTests,
  ensurePlaybackDiagnostics,
  getDownloadDiagnostics,
} from '../../download/downloadDiagnostics';
import {
  fadeOutCurrent,
  getAudioDiagnosticsSnapshot,
  loadAndPlay,
  preloadAudio,
  recordAudioDiagnostic,
  releasePreloadedAudio,
  unload,
  toAudioSource,
} from '../playerService';

const createPlayer = () => ({
  currentStatus: {
    isLoaded: true,
    playing: false,
    currentTime: 0,
    duration: 0,
  },
  volume: 1,
  play: jest.fn(),
  pause: jest.fn(),
  addListener: jest.fn(),
  remove: jest.fn(),
  clearLockScreenControls: jest.fn(),
});

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('playerService fades', () => {
  it('waits for local container repair before creating or preloading a player', async () => {
    (Platform as { OS: string }).OS = 'ios';
    const uri = 'file:///downloaded.m4a';
    let complete!: () => void;
    let started!: () => void;
    const repairStarted = new Promise<void>((resolve) => { started = resolve; });
    jest.mocked(prepareLocalAudioForPlayback).mockImplementationOnce(() => new Promise<void>((resolve) => {
      complete = resolve;
      started();
    }));
    const loading = loadAndPlay(uri);
    await repairStarted;
    expect(createAudioPlayer).not.toHaveBeenCalled();
    complete();
    await loading;
    expect(createAudioPlayer).toHaveBeenCalledWith(uri, {
      updateInterval: 500,
      keepAudioSessionActive: true,
      preferredForwardBufferDuration: 30,
    });
    await preloadAudio('file:///next.m4a');
    expect(prepareLocalAudioForPlayback).toHaveBeenCalledWith('file:///next.m4a');
  });
  beforeEach(() => {
    jest.useFakeTimers();
    (createAudioPlayer as jest.Mock).mockReturnValue(createPlayer());
    (preload as jest.Mock).mockResolvedValue(undefined);
    jest.mocked(prepareLocalAudioForPlayback).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await unload();
    _resetDownloadDiagnosticsForTests();
    (Platform as { OS: string }).OS = 'web';
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('fades out active track, then fades replacement in', async () => {
    const current = createPlayer();
    const replacement = createPlayer();
    (createAudioPlayer as jest.Mock)
      .mockReturnValueOnce(current)
      .mockReturnValueOnce(replacement);

    await loadAndPlay('https://media.test/current.m4a');
    const fadeOut = fadeOutCurrent(2000);
    jest.advanceTimersByTime(1000);
    expect(current.volume).toBeCloseTo(0.5, 1);
    jest.advanceTimersByTime(1000);
    await fadeOut;
    expect(current.volume).toBe(0);

    await loadAndPlay(
      'https://media.test/replacement.m4a',
      undefined,
      undefined,
      2000
    );
    expect(replacement.volume).toBe(0);
    jest.advanceTimersByTime(2000);
    expect(replacement.volume).toBe(1);
  });

  it('does not fetch remote audio into a blob on web', async () => {
    await preloadAudio('https://r1.googlevideo.com/audio.m4a');

    expect(preload).not.toHaveBeenCalled();
  });

  it('releases a preloaded neighbor that leaves the playback window', async () => {
    (Platform as { OS: string }).OS = 'ios';
    const uri = 'https://media.test/previous.m4a';

    await preloadAudio(uri);
    releasePreloadedAudio(uri);
    await flushMicrotasks();

    expect(clearPreloadedSource).toHaveBeenCalledWith(uri);
  });

  it('bounds native preload players and ignores evicted repair completions', async () => {
    (Platform as { OS: string }).OS = 'ios';
    const completions: Array<() => void> = [];
    jest.mocked(prepareLocalAudioForPlayback).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          completions.push(resolve);
        })
    );

    const first = preloadAudio('file:///first.m4a');
    const second = preloadAudio('file:///second.m4a');
    const third = preloadAudio('file:///third.m4a');
    const fourth = preloadAudio('file:///fourth.m4a');

    await flushMicrotasks();
    expect(clearPreloadedSource).not.toHaveBeenCalledWith('file:///first.m4a');
    completions.forEach((complete) => complete());
    await Promise.all([first, second, third, fourth]);

    expect(preload).not.toHaveBeenCalledWith(
      'file:///first.m4a',
      expect.any(Object)
    );
    expect(preload).toHaveBeenCalledWith('file:///second.m4a', {
      preferredForwardBufferDuration: 5,
    });
    expect(preload).toHaveBeenCalledWith('file:///fourth.m4a', {
      preferredForwardBufferDuration: 5,
    });
  });

  it('clears a native preload that is released while the native preload call is pending', async () => {
    (Platform as { OS: string }).OS = 'ios';
    let finishNativePreload!: () => void;
    (preload as jest.Mock).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishNativePreload = resolve;
      })
    );

    const pending = preloadAudio('file:///native-pending.m4a');
    await flushMicrotasks();
    expect(preload).toHaveBeenCalledWith('file:///native-pending.m4a', {
      preferredForwardBufferDuration: 5,
    });
    releasePreloadedAudio('file:///native-pending.m4a');
    finishNativePreload();
    await pending;

    expect(clearPreloadedSource).toHaveBeenCalledWith('file:///native-pending.m4a');
  });

  it('waits for native preload cleanup before re-adding the same URI', async () => {
    (Platform as { OS: string }).OS = 'ios';
    let finishNativeClear!: () => void;
    (clearPreloadedSource as jest.Mock).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishNativeClear = resolve;
      })
    );

    await preloadAudio('file:///reused.m4a');
    releasePreloadedAudio('file:///reused.m4a');
    (preload as jest.Mock).mockClear();

    const readd = preloadAudio('file:///reused.m4a');
    await flushMicrotasks();
    expect(preload).not.toHaveBeenCalled();

    finishNativeClear();
    await readd;

    expect(clearPreloadedSource).toHaveBeenCalledWith('file:///reused.m4a');
    expect(preload).toHaveBeenCalledTimes(1);
    expect(preload).toHaveBeenCalledWith('file:///reused.m4a', {
      preferredForwardBufferDuration: 5,
    });
  });

  it('does not let a cancelled same-URI preload delete or complete a newer entry', async () => {
    (Platform as { OS: string }).OS = 'ios';
    let finishOldRepair!: () => void;
    jest.mocked(prepareLocalAudioForPlayback)
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishOldRepair = resolve;
        })
      )
      .mockResolvedValueOnce(undefined);

    const first = preloadAudio('file:///same-uri.m4a');
    await flushMicrotasks();
    releasePreloadedAudio('file:///same-uri.m4a');
    const second = preloadAudio('file:///same-uri.m4a');
    finishOldRepair();
    await Promise.all([first, second]);

    expect(preload).toHaveBeenCalledTimes(1);
    expect(preload).toHaveBeenCalledWith('file:///same-uri.m4a', {
      preferredForwardBufferDuration: 5,
    });
  });

  it('enriches googlevideo URLs with User-Agent media headers', () => {
    const googlevideoUrl =
      'https://rr1---sn-ax87en7z.googlevideo.com/videoplayback?c=ANDROID_MUSIC';
    const source = toAudioSource(googlevideoUrl);

    expect(source.uri).toBe(googlevideoUrl);
    expect(source.headers).toBeDefined();
    expect(source.headers?.['User-Agent']).toBeDefined();
  });

  it('passes AudioSource object with headers to createAudioPlayer', async () => {
    const googlevideoUrl =
      'https://rr1---sn-ax87en7z.googlevideo.com/videoplayback?c=IOS';
    await loadAndPlay(googlevideoUrl);

    expect(createAudioPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: googlevideoUrl,
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
        }),
      }),
      { updateInterval: 100 }
    );
  });

  it('keeps a bounded diagnostic snapshot for playback lifecycle evidence', async () => {
    (Platform as { OS: string }).OS = 'ios';
    await ensurePlaybackDiagnostics({
      spotifyId: 'track_diagnostic',
      title: 'Diagnóstico',
      artistName: 'Artista',
      albumName: 'Álbum',
      imageURL: '',
      duration_ms: 120000,
    });
    await loadAndPlay(
      'file:///diagnostic.m4a',
      undefined,
      undefined,
      0,
      {
        spotifyId: 'track_diagnostic',
        title: 'Diagnóstico',
        artistName: 'Artista',
        albumName: 'Álbum',
      }
    );
    recordAudioDiagnostic('app-state', 'background');

    const snapshot = getAudioDiagnosticsSnapshot();
    const persisted = await getDownloadDiagnostics('track_diagnostic');

    expect(snapshot).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'app-state',
          note: 'background',
          sourceKind: 'local',
        }),
      ])
    );
    expect(persisted?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'player.app-state' }),
      ])
    );
  });

  it('does not let an older local repair publish diagnostics or create a player after a newer load wins', async () => {
    (Platform as { OS: string }).OS = 'ios';
    let finishOldRepair!: () => void;
    jest.mocked(prepareLocalAudioForPlayback)
      .mockReturnValueOnce(new Promise((resolve) => {
        finishOldRepair = () => resolve({
          repaired: false,
          protectionRelaxed: true,
          protectionBefore: 'complete',
          protectionAfter: 'completeUntilFirstUserAuthentication',
        });
      }))
      .mockResolvedValueOnce(null);

    const oldLoad = loadAndPlay(
      'file:///old.m4a',
      undefined,
      undefined,
      0,
      {
        spotifyId: 'track_old',
        title: 'Velha',
        artistName: 'Artista',
        albumName: 'Álbum',
      }
    );
    await loadAndPlay(
      'file:///new.m4a',
      undefined,
      undefined,
      0,
      {
        spotifyId: 'track_new',
        title: 'Nova',
        artistName: 'Artista',
        albumName: 'Álbum',
      }
    );
    finishOldRepair();
    await oldLoad;

    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(createAudioPlayer).toHaveBeenCalledWith(
      'file:///new.m4a',
      expect.any(Object)
    );
    expect(getAudioDiagnosticsSnapshot()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'file-protection',
          note: 'complete -> completeUntilFirstUserAuthentication',
        }),
      ])
    );
  });

  it('ignores delayed status updates from a player that has already been replaced', async () => {
    (Platform as { OS: string }).OS = 'ios';
    let oldStatus!: (status: any) => void;
    const oldPlayer = {
      ...createPlayer(),
      addListener: jest.fn((_event, callback) => {
        oldStatus = callback;
      }),
    };
    const newPlayer = createPlayer();
    const oldCallback = jest.fn();
    (createAudioPlayer as jest.Mock)
      .mockReturnValueOnce(oldPlayer)
      .mockReturnValueOnce(newPlayer);

    await loadAndPlay('file:///old-player.m4a', oldCallback);
    await loadAndPlay('file:///new-player.m4a');
    oldStatus({
      playing: false,
      isBuffering: false,
      isLoaded: true,
      currentTime: 12,
      duration: 120,
      error: 'late error',
    });

    expect(oldCallback).not.toHaveBeenCalled();
    expect(getAudioDiagnosticsSnapshot()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'playback-error',
          state: expect.objectContaining({ error: 'late error' }),
        }),
      ])
    );
  });

  it('persists audio session configuration failures for the active playback track', async () => {
    (Platform as { OS: string }).OS = 'ios';
    jest.mocked(setAudioModeAsync).mockRejectedValueOnce(
      new Error('session failed https://rr1.googlevideo.test/audio.m4a?sig=secret-value')
    );
    await ensurePlaybackDiagnostics({
      spotifyId: 'track_session',
      title: 'Sessão',
      artistName: 'Artista',
      albumName: 'Álbum',
      imageURL: '',
      duration_ms: 120000,
    });

    await loadAndPlay(
      'file:///session.m4a',
      undefined,
      undefined,
      0,
      {
        spotifyId: 'track_session',
        title: 'Sessão',
        artistName: 'Artista',
        albumName: 'Álbum',
      }
    );

    const persisted = await getDownloadDiagnostics('track_session');

    expect(persisted?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: 'player.audio-session-config-failed',
          details: expect.objectContaining({
            error:
              'session failed https://rr1.googlevideo.test/audio.m4a?sig=…',
          }),
        }),
      ])
    );
  });
});
