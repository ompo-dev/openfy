jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  preload: jest.fn(),
  clearPreloadedSource: jest.fn(),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('../../directYouTubeResolver', () => {
  const original = jest.requireActual('../../directYouTubeResolver');
  return {
    ...original,
    reportDirectYouTubeStreamRefusal: jest.fn().mockResolvedValue(undefined),
  };
});

import { createAudioPlayer } from 'expo-audio';
import { reportDirectYouTubeStreamRefusal } from '../directYouTubeResolver';
import { loadAndPlay, toAudioSource } from '../playerService';

describe('Stream Recovery & Refusal Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates correct AudioSource object for googlevideo URLs with client headers', () => {
    const iosUrl = 'https://rr2---sn-ab5szn7e.googlevideo.com/videoplayback?c=IOS';
    const source = toAudioSource(iosUrl);

    expect(source.uri).toBe(iosUrl);
    expect(source.headers).toBeDefined();
    expect(source.headers?.['User-Agent']).toContain('com.google.ios.youtube');
  });

  it('passes headers to createAudioPlayer for Googlevideo streams', async () => {
    const androidMusicUrl = 'https://rr3---sn-ab5szn7e.googlevideo.com/videoplayback?c=ANDROID_MUSIC';
    const mockPlayer = {
      volume: 1,
      play: jest.fn(),
      addListener: jest.fn(),
      remove: jest.fn(),
      clearLockScreenControls: jest.fn(),
    };
    (createAudioPlayer as jest.Mock).mockReturnValue(mockPlayer);

    const success = await loadAndPlay(androidMusicUrl);

    expect(success).toBe(true);
    expect(createAudioPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: androidMusicUrl,
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('com.google.android.apps.youtube.music'),
        }),
      }),
      { updateInterval: 100 }
    );
  });
});
