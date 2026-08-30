jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  preload: jest.fn(),
  clearPreloadedSource: jest.fn(),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

import { clearPreloadedSource, createAudioPlayer, preload } from 'expo-audio';
import { Platform } from 'react-native';
import {
  fadeOutCurrent,
  loadAndPlay,
  preloadAudio,
  releasePreloadedAudio,
  unload,
  toAudioSource,
} from '../playerService';

const createPlayer = () => ({
  volume: 1,
  play: jest.fn(),
  pause: jest.fn(),
  addListener: jest.fn(),
  remove: jest.fn(),
  clearLockScreenControls: jest.fn(),
});

describe('playerService fades', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (createAudioPlayer as jest.Mock).mockReturnValue(createPlayer());
  });

  afterEach(async () => {
    await unload();
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

    await loadAndPlay('https://media.test/replacement.m4a', undefined, undefined, 2000);
    expect(replacement.volume).toBe(0);
    jest.advanceTimersByTime(2000);
    expect(replacement.volume).toBe(1);
  });

  it('does not fetch remote audio into a blob on web', async () => {
    await preloadAudio(
      'http://localhost:3001/api/audio/proxy?url=https%3A%2F%2Fr1.googlevideo.com%2Faudio.m4a'
    );

    expect(preload).not.toHaveBeenCalled();
  });

  it('releases a preloaded neighbor that leaves the playback window', async () => {
    (Platform as { OS: string }).OS = 'ios';
    const uri = 'https://media.test/previous.m4a';

    await preloadAudio(uri);
    releasePreloadedAudio(uri);

    expect(clearPreloadedSource).toHaveBeenCalledWith(uri);
  });

  it('enriches googlevideo URLs with User-Agent media headers', () => {
    const googlevideoUrl = 'https://rr1---sn-ax87en7z.googlevideo.com/videoplayback?c=ANDROID_MUSIC';
    const source = toAudioSource(googlevideoUrl);

    expect(source.uri).toBe(googlevideoUrl);
    expect(source.headers).toBeDefined();
    expect(source.headers?.['User-Agent']).toBeDefined();
  });

  it('passes AudioSource object with headers to createAudioPlayer', async () => {
    const googlevideoUrl = 'https://rr1---sn-ax87en7z.googlevideo.com/videoplayback?c=IOS';
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
});
