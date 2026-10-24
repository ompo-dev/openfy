jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('@services', () => ({ setRemotePlaybackHandlers: jest.fn() }));
jest.mock('../../services/lyrics/lyricsService', () => ({
  fetchLyrics: jest.fn(),
}));
jest.mock('../../services/lyrics/lyricsRepository', () => ({
  getTrackLyricsProvider: jest.fn().mockResolvedValue('auto'),
  getCachedTrackLyricsProvider: jest.fn().mockReturnValue('auto'),
  setTrackLyricsProvider: jest.fn().mockResolvedValue(undefined),
  lyricsPolicyKey: jest.fn().mockReturnValue('policy'),
}));

import { setRemotePlaybackHandlers } from '@services';
import { getExistingLocalAudioPath, usePlayerStore } from '../usePlayerStore';
import { fetchLyrics } from '../../services/lyrics/lyricsService';
import { getTrackLyricsProvider, setTrackLyricsProvider } from '../../services/lyrics/lyricsRepository';

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

describe('player lyric request ownership', () => {
  const track = { spotifyId: 'first', title: 'First', artistName: 'Artist', albumName: 'Album',
    imageURL: '', duration_ms: 3000, youtubeVideoId: 'abcdefghijk' };
  const lyrics = { trackName: 'First', artistName: 'Artist', isSynced: false, segments: [], plainLyrics: 'First text' };
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

  beforeEach(() => {
    usePlayerStore.setState(usePlayerStore.getInitialState(), true);
    usePlayerStore.setState({ currentTrack: track, activeRequestId: 10 });
    jest.mocked(getTrackLyricsProvider).mockReset().mockResolvedValue('auto');
    jest.mocked(setTrackLyricsProvider).mockReset().mockResolvedValue(undefined);
    jest.mocked(fetchLyrics).mockReset();
  });

  it('does not fetch song lyrics for a composed local mix', async () => {
    usePlayerStore.setState({ currentTrack: { ...track, localOnly: true }, isLoadingLyrics: true });
    await usePlayerStore.getState().refreshLyrics();
    expect(fetchLyrics).not.toHaveBeenCalled();
    expect(usePlayerStore.getState()).toMatchObject({ lyricsData: null, isLoadingLyrics: false });
  });

  it('keeps the new track when an old lyric response completes last', async () => {
    let finishOld!: (value: typeof lyrics) => void;
    jest.mocked(fetchLyrics).mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValueOnce({ ...lyrics, trackName: 'Second', plainLyrics: 'Second text' });
    const first = usePlayerStore.getState().refreshLyrics();
    await flush();
    const oldOptions = jest.mocked(fetchLyrics).mock.calls[0][5]!;
    usePlayerStore.setState({ currentTrack: { ...track, spotifyId: 'second', title: 'Second' }, activeRequestId: 11 });
    await usePlayerStore.getState().refreshLyrics();
    expect(oldOptions.signal?.aborted).toBe(true);
    oldOptions.onAttempt?.('better', 'found');
    finishOld(lyrics);
    await first;
    expect(usePlayerStore.getState().lyricsData?.plainLyrics).toBe('Second text');
    expect(usePlayerStore.getState().lyricsProviderAttempts).toEqual({});
  });

  it('does not let a delayed choice write refresh a more recent provider selection', async () => {
    let finishOld!: () => void;
    jest.mocked(setTrackLyricsProvider).mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    jest.mocked(getTrackLyricsProvider).mockResolvedValue('lrclib');
    jest.mocked(fetchLyrics).mockResolvedValue(lyrics);
    const old = usePlayerStore.getState().selectLyricsProvider('better');
    await usePlayerStore.getState().selectLyricsProvider('lrclib');
    finishOld();
    await old;
    expect(fetchLyrics).toHaveBeenCalledTimes(1);
    expect(jest.mocked(fetchLyrics).mock.calls[0][5]).toMatchObject({ provider: 'lrclib', trackId: 'first', videoId: 'abcdefghijk' });
    expect(usePlayerStore.getState().lyricsProvider).toBe('lrclib');
    expect(usePlayerStore.getState().isLoadingLyrics).toBe(false);
  });

  it('restores the persisted choice and exits loading on a failed selection write', async () => {
    jest.mocked(setTrackLyricsProvider).mockRejectedValueOnce(new Error('storage full'));
    await expect(usePlayerStore.getState().selectLyricsProvider('better')).rejects.toThrow('storage full');
    expect(usePlayerStore.getState()).toMatchObject({ lyricsProvider: 'auto', isLoadingLyrics: false });
    expect(fetchLyrics).not.toHaveBeenCalled();
  });
});
