import { spotifyGet } from '../../config';
import {
  _clearArtistTopTracksCacheForTests,
  getArtistTopTracks,
} from '../artistTopTracks';

jest.mock('../../config', () => ({
  BASE_URL: 'https://spotify.test/v1',
  spotifyGet: jest.fn(),
}));

describe('getArtistTopTracks cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _clearArtistTopTracksCacheForTests();
  });

  it('coalesces concurrent profile warmups and reuses the requested market result', async () => {
    const spotifyGetMock = jest.mocked(spotifyGet);
    spotifyGetMock.mockResolvedValueOnce({
      data: {
        tracks: [{
          id: 'top-track',
          name: 'Top track',
          duration_ms: 120000,
          explicit: false,
          artists: [{ id: 'artist-id', name: 'Artist' }],
          album: { name: 'Album', images: [{ url: 'https://images.test/album.jpg' }] },
        }],
      },
    } as never);

    const [first, concurrent] = await Promise.all([
      getArtistTopTracks('artist-id'),
      getArtistTopTracks('artist-id'),
    ]);
    const cached = await getArtistTopTracks('artist-id');

    expect(first).toEqual(concurrent);
    expect(cached).toEqual(first);
    expect(spotifyGetMock).toHaveBeenCalledTimes(1);
  });
});
