jest.mock('../../config', () => ({
  BASE_URL: 'https://api.spotify.test/v1',
  spotifyGet: jest.fn(),
}));

import { spotifyGet } from '../../config';
import { getPlaylist, getPlaylistItems } from '../playlist';

const mockedSpotifyGet = spotifyGet as jest.MockedFunction<typeof spotifyGet>;

describe('playlist Spotify API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carrega playlist e faixas pela sessão Spotify local', async () => {
    mockedSpotifyGet
      .mockResolvedValueOnce({
        data: {
          type: 'playlist',
          id: 'playlist-1',
          name: 'Playlist local',
          owner: { id: 'owner-1', display_name: 'Maico' },
          description: '',
          followers: { total: 10 },
          images: [{ url: 'https://image.test/cover.jpg' }],
          tracks: { total: 1 },
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              track: {
                id: 'track-1',
                name: 'Música local',
                artists: [{ id: 'artist-1', name: 'Artista local' }],
                album: {
                  name: 'Álbum local',
                  images: [{ url: 'https://image.test/track.jpg' }],
                },
                duration_ms: 120_000,
              },
            },
          ],
        },
      } as any);

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
    expect(mockedSpotifyGet).toHaveBeenCalledTimes(2);
  });
});
