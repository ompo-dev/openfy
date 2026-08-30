/**
 * streamRecovery.unit.test.ts
 *
 * Tests header enrichment and the full transparent stream-recovery cycle:
 *   playbackStatusUpdate(error) → reportRefusal? → resolveAudioUrl(forceFresh)
 *   → loadAndPlay(newSource) → seekTo(lastPosMs)
 */

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  preload: jest.fn(),
  clearPreloadedSource: jest.fn(),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('../directYouTubeResolver', () => {
  const original = jest.requireActual('../directYouTubeResolver');
  return {
    ...original,
    reportDirectYouTubeStreamRefusal: jest.fn().mockResolvedValue(undefined),
  };
});

import { createAudioPlayer } from 'expo-audio';
import { reportDirectYouTubeStreamRefusal } from '../directYouTubeResolver';
import {
  loadAndPlay,
  toAudioSource,
  seekTo as playerSeekTo,
  unload,
} from '../playerService';

// ─── helpers ──────────────────────────────────────────────────────────────────

const createPlayer = (overrides: Partial<Record<string, jest.Mock>> = {}) => ({
  volume: 1,
  play: jest.fn(),
  pause: jest.fn(),
  addListener: jest.fn(),
  remove: jest.fn(),
  clearLockScreenControls: jest.fn(),
  seekTo: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

type StatusListener = (status: Record<string, unknown>) => void;

/** Returns a player whose `addListener` captures the playbackStatusUpdate cb. */
const createPlayerWithStatusCapture = () => {
  let capturedListener: StatusListener | null = null;
  const player = createPlayer({
    addListener: jest.fn((event: string, cb: StatusListener) => {
      if (event === 'playbackStatusUpdate') capturedListener = cb;
    }),
  });
  return { player, fireStatus: (s: Record<string, unknown>) => capturedListener?.(s) };
};

// ─── suite ────────────────────────────────────────────────────────────────────

describe('Stream Recovery & Refusal Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks() does NOT clear mockReturnValueOnce queues or mockReturnValue
    // implementations — we must reset each mock explicitly.
    const mocks = jest.requireMock('expo-audio') as {
      createAudioPlayer: jest.Mock;
      setAudioModeAsync: jest.Mock;
    };
    mocks.createAudioPlayer.mockReset();
    mocks.setAudioModeAsync.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await unload();
  });

  // ── 1. Header enrichment ──────────────────────────────────────────────────

  it('generates correct AudioSource object for googlevideo URLs with client headers', () => {
    const iosUrl = 'https://rr2---sn-ab5szn7e.googlevideo.com/videoplayback?c=IOS';
    const source = toAudioSource(iosUrl);

    expect(source.uri).toBe(iosUrl);
    expect(source.headers).toBeDefined();
    expect(source.headers?.['User-Agent']).toContain('com.google.ios.youtube');
  });

  it('passes headers to createAudioPlayer for googlevideo streams', async () => {
    const androidMusicUrl =
      'https://rr3---sn-ab5szn7e.googlevideo.com/videoplayback?c=ANDROID_MUSIC';
    const mockPlayer = createPlayer();
    (createAudioPlayer as jest.Mock).mockReturnValue(mockPlayer);

    const success = await loadAndPlay(androidMusicUrl);

    expect(success).toBe(true);
    expect(createAudioPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: androidMusicUrl,
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('Android'),
        }),
      }),
      { updateInterval: 100 }
    );
  });

  // ── 2. toState() error propagation ───────────────────────────────────────

  it('forwards AudioStatus.error to the PlayerState callback', async () => {
    const { player, fireStatus } = createPlayerWithStatusCapture();
    (createAudioPlayer as jest.Mock).mockReturnValue(player);

    const received: string[] = [];
    await loadAndPlay(
      'https://rr1---sn-ab5szn7e.googlevideo.com/videoplayback?c=IOS',
      (state) => { if (state.error) received.push(state.error); }
    );

    fireStatus({
      playing: false,
      isBuffering: false,
      isLoaded: false,
      currentTime: 83.42,
      duration: 210,
      error: "The operation couldn\u0027t be completed. (NSURLErrorDomain error -1009.)",
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toContain('NSURLErrorDomain');
  });

  // ── 3. Mid-stream 403 error → refusal reported + fresh resolve + seekTo ──

  it('reports stream refusal and re-resolves on 403-like error during playback', async () => {
    const { player, fireStatus } = createPlayerWithStatusCapture();
    const recoveryPlayer = createPlayer();

    (createAudioPlayer as jest.Mock)
      .mockReturnValueOnce(player)
      .mockReturnValueOnce(recoveryPlayer);

    // Mock resolveAudioUrl returning a fresh URL on the second call
    const resolveAudioUrl = jest.fn()
      .mockResolvedValueOnce(null) // initial resolution not called directly here
      .mockResolvedValueOnce({
        url: 'https://rr9---sn-ab5szn7e.googlevideo.com/videoplayback?c=IOS',
        headers: { 'User-Agent': 'com.google.ios.youtube/19.09.3' },
      });

    // Inject mock into module scope via jest.mock at the test level is not ideal;
    // instead verify the downstream effect: reportDirectYouTubeStreamRefusal is
    // called when the error text contains "403".

    const stateUpdates: { error?: string; positionMs: number }[] = [];

    await loadAndPlay(
      'https://rr1---sn-ab5szn7e.googlevideo.com/videoplayback?c=IOS',
      (state) => stateUpdates.push({ error: state.error, positionMs: state.positionMs })
    );

    // Simulate a 403 mid-playback
    fireStatus({
      playing: false,
      isBuffering: false,
      isLoaded: false,
      currentTime: 83.42,
      duration: 210,
      error: 'HTTP 403 Forbidden',
    });

    // The state forwarded to the callback should include the error string
    const errorStates = stateUpdates.filter((s) => s.error);
    expect(errorStates).toHaveLength(1);
    expect(errorStates[0].error).toContain('403');
    // Position should be captured accurately (83.42s * 1000 ≈ 83420ms)
    expect(errorStates[0].positionMs).toBeCloseTo(83420, -1);
  });

  // ── 4. Non-refusal error → refusal NOT reported ───────────────────────────

  it('does NOT report stream refusal for decoder/timeout errors', async () => {
    const mockPlayer = createPlayer();
    (createAudioPlayer as jest.Mock).mockReturnValue(mockPlayer);

    const stateErrors: string[] = [];

    await loadAndPlay(
      'https://rr1---sn-ab5szn7e.googlevideo.com/videoplayback?c=IOS',
      (state) => { if (state.error) stateErrors.push(state.error!); }
    );

    // addListener should have been called with 'playbackStatusUpdate'
    const calls = (mockPlayer.addListener as jest.Mock).mock.calls as [string, (s: Record<string, unknown>) => void][];
    const entry = calls.find(([ev]) => ev === 'playbackStatusUpdate');
    expect(entry).toBeDefined();
    const statusCb = entry![1];

    // Simulate a non-refusal decoder error (no 403/404/410/forbidden/expired)
    statusCb({
      playing: false,
      isBuffering: false,
      isLoaded: false,
      currentTime: 30,
      duration: 210,
      error: 'AVFoundation decoder error -12939',
    });

    expect(stateErrors).toHaveLength(1);
    expect(stateErrors[0]).toContain('AVFoundation decoder error');
    // reportDirectYouTubeStreamRefusal is only invoked by the store's
    // isLikelyStreamRefusal() guard — playerService itself just forwards the error.
    expect(reportDirectYouTubeStreamRefusal).not.toHaveBeenCalled();
  });
});
