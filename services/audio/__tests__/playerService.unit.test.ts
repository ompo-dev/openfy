jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  preload: jest.fn(),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

import { createAudioPlayer, preload } from 'expo-audio';
import {
  fadeOutCurrent,
  loadAndPlay,
  preloadAudio,
  unload,
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
    await preloadAudio('http://localhost:3001/api/audio/youtube?videoId=iciIG5tw-hk');

    expect(preload).not.toHaveBeenCalled();
  });
});
