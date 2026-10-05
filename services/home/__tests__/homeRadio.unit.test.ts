import { getYouTubeMusicClient } from '../../youtubeMusicClient';
import { loadHomeRadio } from '../homeRadio';
import type { PersonalizedHomeTrack } from '../personalizedHome';

jest.mock('../../youtubeMusicClient', () => ({
  ...jest.requireActual('../../youtubeMusicClient'), getYouTubeMusicClient: jest.fn(),
}));

const anchor = (artistName: string, youtubeVideoId: string): PersonalizedHomeTrack => ({
  id: youtubeVideoId, spotifyId: `yt_${youtubeVideoId}`, title: 'Song', artistName, youtubeVideoId,
  artists: [{ id: 'artist', name: artistName }], albumName: 'Album', duration_ms: 150_000, imageURL: '',
});
const search = jest.fn();
const getUpNext = jest.fn();

describe('home artist radio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: { search, getUpNext } } as never);
    getUpNext.mockResolvedValue({ contents: [{ video_id: 'lmnopqrstuv', title: 'Related', artists: [{ name: 'New artist' }], duration: { seconds: 180 } }] });
  });

  it('uses a song of the named artist and shares requests with lock-screen suggestions', async () => {
    const seed = { name: 'Sotam', score: 1 };
    const first = anchor('Ebony', 'zyxwvutsrqp');
    const matching = anchor('Sotam', 'abcdefghijk');
    const [home, lockScreen] = await Promise.all([loadHomeRadio(seed, [first, matching]), loadHomeRadio(seed, [matching])]);
    expect(home).toEqual(lockScreen);
    expect(home[0].title).toBe('Related');
    expect(getUpNext).toHaveBeenCalledTimes(1);
    expect(getUpNext).toHaveBeenCalledWith('abcdefghijk', true);
    expect(search).not.toHaveBeenCalled();
  });

  it('resolves an artist seed when Spotify history has no YouTube video id', async () => {
    search.mockResolvedValue({ songs: { contents: [{ id: 'abcdefghijk', title: 'Song', artists: [{ name: 'Yago Oproprio' }] }] } });
    const result = await loadHomeRadio({ name: 'Yago Oproprio', score: 1 }, []);
    expect(search).toHaveBeenCalledWith('Yago Oproprio', { type: 'song' });
    expect(getUpNext).toHaveBeenCalledWith('abcdefghijk', true);
    expect(result[0].title).toBe('Related');
  });

  it('does not cache a failed lookup for hours', async () => {
    search.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ songs: { contents: [{ id: 'abcdefghijk', title: 'Song', artists: [{ name: 'Retry artist' }] }] } });
    const seed = { name: 'Retry artist', score: 1 };
    expect(await loadHomeRadio(seed, [])).toEqual([]);
    expect((await loadHomeRadio(seed, [])).length).toBeGreaterThan(0);
    expect(search).toHaveBeenCalledTimes(2);
  });
});
