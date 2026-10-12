import AsyncStorage from '@react-native-async-storage/async-storage';
import { getYouTubeMusicArtistProfile } from '../../../api/search/catalog';
import { loadHomeRadio } from '../homeRadio';
import { loadHomeCatalog, sortHomeReleases } from '../homeCatalog';
import type { HomeRelease } from '../personalizedHome';

jest.mock('../../../api/search/catalog', () => ({ getYouTubeMusicArtistProfile: jest.fn() }));
jest.mock('../../../api/artists/artistDiscography', () => ({ getArtistDiscography: jest.fn() }));
jest.mock('../homeRadio', () => ({ loadHomeRadio: jest.fn().mockResolvedValue([]) }));

const release = (id: string, title: string, releaseDate: string): HomeRelease => ({
  id, title, releaseDate, artistName: 'Ebony', artistId: 'artist', artistImageURL: '', imageURL: '', releaseType: 'album',
});
const seed = (name: string) => ({ id: 'ytartist_UC' + name + '~' + name, name, score: 1 });
const profile = (id: string) => ({ artist: { id: 'artist', imageURL: 'portrait' }, albums: [{
  id, title: id, imageURL: 'cover', subtitle: '2026 · album', releaseDate: '2026-09-12', releaseType: 'album',
}], singlesAndEps: [] });

describe('home release catalog', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    jest.mocked(loadHomeRadio).mockResolvedValue([]);
  });

  it('orders dated releases and removes duplicated provider titles', () => {
    expect(sortHomeReleases([release('old', 'Velho', '2024'), release('new', 'KM2', '2026-09-12'),
      release('duplicate', 'km2', '2026-09-12')]).map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('coalesces requests, caps seeds at five, and reuses memory cache', async () => {
    jest.mocked(getYouTubeMusicArtistProfile).mockResolvedValue(profile('album') as never);
    const seeds = ['bounded-one', 'bounded-two', 'third', 'fourth', 'fifth', 'not-requested'].map(seed);
    const [first, second] = await Promise.all([loadHomeCatalog(seeds, []), loadHomeCatalog(seeds, [])]);
    expect(first).toEqual(second);
    expect(getYouTubeMusicArtistProfile).toHaveBeenCalledTimes(5);
    await loadHomeCatalog(seeds, []);
    expect(getYouTubeMusicArtistProfile).toHaveBeenCalledTimes(5);
  });

  it('publishes early releases and a radio for each seed with two profile workers', async () => {
    let active = 0;
    let peak = 0;
    jest.mocked(getYouTubeMusicArtistProfile).mockImplementation(async (id) => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return profile(id) as never;
    });
    jest.mocked(loadHomeRadio).mockImplementation(async (artist) => [{ spotifyId: artist.name }] as never);
    const updates = jest.fn();
    const catalog = await loadHomeCatalog(['early-one', 'early-two', 'early-three'].map(seed), [], true, updates);
    expect(peak).toBe(2);
    expect(updates.mock.calls.some(([partial]) => partial.releases.length === 1)).toBe(true);
    expect(catalog.radios?.map((radio) => radio.seed.name)).toEqual(['early-one', 'early-two', 'early-three']);
    expect(catalog.releases).toHaveLength(3);
  });

  it('does not keep a forced refresh cached or erase releases when offline', async () => {
    jest.mocked(getYouTubeMusicArtistProfile).mockResolvedValueOnce(profile('one') as never).mockResolvedValueOnce(profile('two') as never);
    const seeds = [seed('refresh')];
    expect((await loadHomeCatalog(seeds, [], true)).releases[0].id).toBe('one');
    expect((await loadHomeCatalog(seeds, [], true)).releases[0].id).toBe('two');
    jest.mocked(getYouTubeMusicArtistProfile).mockRejectedValueOnce(new Error('offline'));
    const updates = jest.fn();
    expect((await loadHomeCatalog(seeds, [], true, updates)).releases[0].id).toBe('two');
    expect(updates.mock.calls.every(([partial]) => partial.releases[0].id === 'two')).toBe(true);
    expect(getYouTubeMusicArtistProfile).toHaveBeenCalledTimes(3);
    expect(jest.mocked(getYouTubeMusicArtistProfile).mock.calls.every(([, force]) => force === true)).toBe(true);
  });
});
