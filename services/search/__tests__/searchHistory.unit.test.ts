import type { ArtistModel, TrackModel } from '@models';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

const artist: ArtistModel = { type: 'artist', id: 'ytartist_sotam', name: 'Sotam', imageURL: 'artist.jpg' };
const track: TrackModel = { id: 'yt_song', title: 'Sinceramente', subtitle: 'Sotam, Rob, Vertigo',
  imageURL: 'cover.jpg', youtubeVideoId: 'abcdefghijk', durationMs: 150000, albumId: 'album',
  albumAssociations: [{ id: 'album', name: 'Album' }] };
const loadHistory = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../searchHistory') as typeof import('../searchHistory');
};
const storage = () => jest.requireMock('@react-native-async-storage/async-storage') as typeof import('@react-native-async-storage/async-storage').default;

describe('selected search history', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.mocked(storage().getItem).mockReset().mockResolvedValue(null);
    jest.mocked(storage().setItem).mockReset().mockResolvedValue(undefined);
  });

  it('persists the selected artist and recording metadata, not the misspelled query', async () => {
    const history = loadHistory();
    await history.rememberSearchSelection({ kind: 'artist', artist });
    await history.rememberSearchSelection({ kind: 'track', track });
    const saved = jest.mocked(storage().setItem).mock.calls.at(-1)![1];
    expect(JSON.parse(saved)).toEqual([
      { kind: 'track', track, selectedAt: expect.any(Number) },
      { kind: 'artist', artist, selectedAt: expect.any(Number) },
    ]);
    jest.resetModules();
    jest.mocked(storage().getItem).mockResolvedValue(saved);
    await expect(loadHistory().getSearchHistory()).resolves.toMatchObject([{ track }, { artist }]);
  });

  it('serializes concurrent selections, moves repeats to the top and supports remove and clear', async () => {
    const history = loadHistory();
    const updates: unknown[] = [];
    const unsubscribe = history.subscribeSearchHistory((entries) => updates.push(entries));
    await Promise.all([
      history.rememberSearchSelection({ kind: 'artist', artist }),
      history.rememberSearchSelection({ kind: 'track', track }),
      history.rememberSearchSelection({ kind: 'artist', artist }),
    ]);
    expect((await history.getSearchHistory()).map(history.searchHistoryKey)).toEqual(['artist:ytartist_sotam', 'track:yt_song']);
    await history.removeSearchHistoryEntry('artist:ytartist_sotam');
    expect(await history.getSearchHistory()).toMatchObject([{ track }]);
    await history.clearSearchHistory();
    expect(await history.getSearchHistory()).toEqual([]);
    expect(updates.length).toBeGreaterThan(3);
    unsubscribe();
  });

  it('ignores malformed entries, caps storage and keeps artist and song identities separate', () => {
    const history = loadHistory();
    const input = [null, {}, { kind: 'artist', artist: {}, selectedAt: 1 },
      ...Array.from({ length: 60 }, (_, index) => ({ kind: 'track', track: { ...track, id: `song-${index}` }, selectedAt: index }))];
    const normalized = history.normalizeSearchHistory(input);
    expect(normalized).toHaveLength(40);
    expect(normalized[0]).toMatchObject({ track: { id: 'song-59' } });
    expect(history.searchHistoryKey({ kind: 'artist', artist: { ...artist, id: 'same' } }))
      .not.toBe(history.searchHistoryKey({ kind: 'track', track: { ...track, id: 'same' } }));
  });
});
