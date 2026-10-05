jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('@services', () => ({ setRemotePlaybackHandlers: jest.fn() }));
jest.mock('../../services/lyrics/lyricsService', () => ({
  fetchLyrics: jest.fn(),
  saveLyricsOffline: jest.fn().mockResolvedValue('lyrics_test'),
}));

import { setRemotePlaybackHandlers } from '@services';
import { getExistingLocalAudioPath, usePlayerStore } from '../usePlayerStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchLyrics, saveLyricsOffline } from '../../services/lyrics/lyricsService';

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

describe('edited lyric persistence', () => {
  let trackNumber = 0;
  const segments = [{ index: 0, startTimeMs: 1000, endTimeMs: 3000, text: 'Criada pelo usuario' }];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
    jest.mocked(saveLyricsOffline).mockResolvedValue('lyrics_test');
    usePlayerStore.setState({
      currentTrack: { spotifyId: `created_lyrics_${++trackNumber}`, title: 'Nova letra', artistName: 'Artista',
        albumName: '', imageURL: '', duration_ms: 30000 },
      activeRequestId: trackNumber,
      lyricsData: null,
      isLoadingLyrics: true,
    });
  });

  it('saves a lyric even when none was provided and persists track identity and plain text', async () => {
    await expect(usePlayerStore.getState().updateLyricsSegments(segments)).resolves.toBe(true);
    const lyrics = usePlayerStore.getState().lyricsData;
    expect(lyrics).toMatchObject({ trackName: 'Nova letra', artistName: 'Artista',
      isSynced: true, source: 'user', plainLyrics: segments[0].text, segments });
    expect(usePlayerStore.getState().isLoadingLyrics).toBe(false);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(expect.stringContaining('openfy_lyrics_cache_'), JSON.stringify(lyrics));
    expect(saveLyricsOffline).toHaveBeenCalledWith(usePlayerStore.getState().currentTrack?.spotifyId, lyrics);
  });

  it('keeps a newly saved lyric when a pending provider request returns', async () => {
    let resolveLyrics!: (value: any) => void;
    jest.mocked(fetchLyrics).mockReturnValue(new Promise((resolve) => { resolveLyrics = resolve; }));
    const refresh = usePlayerStore.getState().refreshLyrics();
    await usePlayerStore.getState().updateLyricsSegments(segments);
    const saved = usePlayerStore.getState().lyricsData;
    resolveLyrics({ trackName: 'Provider', artistName: 'Artista', segments: [], isSynced: false });
    await refresh;
    expect(usePlayerStore.getState().lyricsData).toBe(saved);
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it('converts untimed lyrics to user segments without mutating the original', async () => {
    const original = { trackName: 'Nova letra', artistName: 'Artista', segments: [], isSynced: false, plainLyrics: 'Sem tempos' };
    usePlayerStore.setState({ lyricsData: original });
    await expect(usePlayerStore.getState().updateLyricsSegments(segments)).resolves.toBe(true);
    expect(original.segments).toEqual([]);
    expect(usePlayerStore.getState().lyricsData?.plainLyrics).toBe(segments[0].text);
  });

  it('restores the unavailable state after a storage failure and allows another save', async () => {
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Disk full'));
    await expect(usePlayerStore.getState().updateLyricsSegments(segments)).resolves.toBe(false);
    expect(usePlayerStore.getState().lyricsData).toBeNull();
    await expect(usePlayerStore.getState().updateLyricsSegments(segments)).resolves.toBe(true);
  });

  it('does not roll back a newer save when an older write fails', async () => {
    let rejectWrite!: (error: Error) => void;
    jest.mocked(AsyncStorage.setItem).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectWrite = reject; }));
    const oldSave = usePlayerStore.getState().updateLyricsSegments(segments);
    await usePlayerStore.getState().updateLyricsSegments([{ ...segments[0], text: 'Mais nova' }]);
    rejectWrite(new Error('Old write failed'));
    await expect(oldSave).resolves.toBe(false);
    expect(usePlayerStore.getState().lyricsData?.plainLyrics).toBe('Mais nova');
  });

  it.each([
    { draft: [] },
    { draft: [{ ...segments[0], text: '' }] },
    { draft: [{ ...segments[0], startTimeMs: NaN }] },
    { draft: [{ ...segments[0], startTimeMs: 4000 }] },
  ])('rejects incomplete or invalid drafts: $draft', async ({ draft }) => {
    await expect(usePlayerStore.getState().updateLyricsSegments(draft)).resolves.toBe(false);
    expect(usePlayerStore.getState().lyricsData).toBeNull();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
