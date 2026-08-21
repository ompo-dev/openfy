jest.mock('../../config', () => ({
  BASE_URL: 'https://api.spotify.test/v1',
  spotifyGet: jest.fn(),
}));

import { spotifyGet } from '../../config';
import { getPlaylist, getPlaylistItems } from '../playlist';

const mockedSpotifyGet = spotifyGet as jest.MockedFunction<typeof spotifyGet>;
const mockFetch = jest.fn();

describe('playlist fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
    mockedSpotifyGet.mockRejectedValue(new Error('Spotify rejected token'));
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'playlist-1',
        title: 'Playlist local',
        coverUrl: 'https://image.test/cover.jpg',
        tracks: [
          {
            spotifyId: 'track-1',
            title: 'Música local',
            artistName: 'Artista local',
            albumName: 'Álbum local',
            imageURL: 'https://image.test/track.jpg',
            duration_ms: 120_000,
          },
        ],
      }),
    });
  });

  it('usa playlist canônica do backend quando Spotify retorna erro', async () => {
    await expect(getPlaylist('playlist-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'playlist-1',
        imageURL: 'https://image.test/cover.jpg',
        tracks: { total: 1 },
      })
    );
    await expect(
      getPlaylistItems({ playlistId: 'playlist-1', limit: 50, offset: 0 })
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'track-1',
        title: 'Música local',
        durationMs: 120_000,
      }),
    ]);
  });
});
