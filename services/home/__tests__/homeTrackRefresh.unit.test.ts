jest.mock('@config', () => ({
  MUSIC_SERVER_URL: 'http://music.test',
}));

jest.mock('../../audio/audioResolver', () => ({
  getPlayableAudioUrl: (url: string) => `proxy:${url}`,
}));

import { refreshHomeTracks } from '../homeTrackRefresh';

describe('refreshHomeTracks', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('uses canonical metadata and a playable stream for every matching Home card', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        source: { streamUrl: 'https://media.test/track.m4a' },
        track: {
          title: 'Título canônico',
          artistName: 'Artista canônico',
          albumName: 'Álbum canônico',
          imageURL: 'https://images.test/cover.jpg',
          duration_ms: 181000,
        },
      }),
    });

    const refreshed = await refreshHomeTracks([
      {
        key: 'home-card',
        spotifyId: 'source-id',
        title: 'Título original',
        artistName: 'Artista original',
        albumName: 'Single',
        imageURL: '',
        duration_ms: 180000,
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://music.test/api/music/resolve',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"includeLyrics":false'),
      })
    );
    expect(refreshed).toEqual({
      'home-card': {
        spotifyId: 'source-id',
        title: 'Título canônico',
        artistName: 'Artista canônico',
        albumName: 'Álbum canônico',
        imageURL: 'https://images.test/cover.jpg',
        duration_ms: 181000,
        streamUrl: 'proxy:https://media.test/track.m4a',
      },
    });
  });

  it('does not replace the visible card when its audio source cannot be verified', async () => {
    fetchMock.mockResolvedValue({ ok: false });

    await expect(
      refreshHomeTracks([
        {
          key: 'unverified',
          spotifyId: 'source-id',
          title: 'Título',
          artistName: 'Artista',
          albumName: 'Single',
          imageURL: '',
          duration_ms: 180000,
        },
      ])
    ).resolves.toEqual({});
  });
});
