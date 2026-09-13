jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('@services', () => ({}));
jest.mock('../../services/lyrics/lyricsService', () => ({}));

import { getExistingLocalAudioPath } from '../usePlayerStore';

describe('getExistingLocalAudioPath', () => {
  it('drops expired web proxy URLs so the track resolves again', async () => {
    await expect(
      getExistingLocalAudioPath('https://r1.googlevideo.com/stale.m4a')
    ).resolves.toBeNull();
  });
});
