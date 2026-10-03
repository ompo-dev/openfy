import { spotifyGet } from '../../config';
import {
  _clearArtistProfileCacheForTests,
  findArtistIdByName,
  getArtist,
} from '../artist';

jest.mock('../../config', () => ({
  BASE_URL: 'https://spotify.test/v1',
  spotifyGet: jest.fn(),
}));

describe('findArtistIdByName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _clearArtistProfileCacheForTests();
  });

  it('matches names without accents and reuses the normalized identity cache', async () => {
    const spotifyGetMock = jest.mocked(spotifyGet);
    spotifyGetMock.mockResolvedValueOnce({
      data: {
        artists: {
          items: [
            { id: 'artist-eodan-test', name: 'ÉoDan' },
            { id: 'artist-other-test', name: 'Eodan Produções' },
          ],
        },
      },
    } as never);

    await expect(findArtistIdByName('eodan')).resolves.toBe('artist-eodan-test');
    await expect(findArtistIdByName('ÉoDan')).resolves.toBe('artist-eodan-test');

    expect(spotifyGetMock).toHaveBeenCalledTimes(1);
  });

  it('reuses a warmed artist profile for the profile screen', async () => {
    const spotifyGetMock = jest.mocked(spotifyGet);
    spotifyGetMock.mockResolvedValueOnce({
      data: {
        id: 'artist-cache-test',
        type: 'artist',
        name: 'Cached artist',
        images: [{ url: 'https://images.test/artist.jpg', width: 640, height: 640 }],
        genres: [],
        followers: { total: 10 },
      },
    } as never);

    await expect(getArtist('artist-cache-test')).resolves.toMatchObject({
      name: 'Cached artist',
      imageURL: 'https://images.test/artist.jpg',
    });
    await expect(getArtist('artist-cache-test')).resolves.toMatchObject({
      name: 'Cached artist',
    });

    expect(spotifyGetMock).toHaveBeenCalledTimes(1);
  });
});
