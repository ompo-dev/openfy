jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('@services', () => ({}));
jest.mock('../../services/lyrics/lyricsService', () => ({}));

import { getExistingLocalAudioPath } from '../usePlayerStore';

describe('getExistingLocalAudioPath', () => {
  it('drops expired web proxy URLs so the track resolves again', async () => {
    await expect(
      getExistingLocalAudioPath('http://localhost:3001/api/audio/proxy?url=https%3A%2F%2Fr1.googlevideo.com%2Fstale.m4a')
    ).resolves.toBeNull();
  });

  it('keeps the renewable YouTube endpoint for an existing web download', async () => {
    const stableUrl = 'http://localhost:3001/api/audio/youtube?videoId=iciIG5tw-hk';
    await expect(getExistingLocalAudioPath(stableUrl)).resolves.toBe(stableUrl);
  });
});
