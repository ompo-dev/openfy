import { spotifyGet } from '../../config';
import { findArtistIdByName } from '../artist';

jest.mock('../../config', () => ({
  BASE_URL: 'https://spotify.test/v1',
  spotifyGet: jest.fn(),
}));

describe('findArtistIdByName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
