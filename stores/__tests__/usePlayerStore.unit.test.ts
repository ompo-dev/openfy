jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('@services', () => ({ setRemotePlaybackHandlers: jest.fn() }));
jest.mock('../../services/lyrics/lyricsService', () => ({}));

import { setRemotePlaybackHandlers } from '@services';
import { getExistingLocalAudioPath, usePlayerStore } from '../usePlayerStore';

describe('getExistingLocalAudioPath', () => {
  it('drops expired web proxy URLs so the track resolves again', async () => {
    await expect(
      getExistingLocalAudioPath('https://r1.googlevideo.com/stale.m4a')
    ).resolves.toBeNull();
  });

  it('routes system next and previous commands to the current store actions', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    const previous = jest.fn().mockResolvedValue(undefined);
    usePlayerStore.setState({ playNext: next, playPrevious: previous });
    const handlers = jest.mocked(setRemotePlaybackHandlers).mock.calls[0][0];

    await handlers.next?.();
    await handlers.previous?.();

    expect(next).toHaveBeenCalledTimes(1);
    expect(previous).toHaveBeenCalledTimes(1);
  });
});
