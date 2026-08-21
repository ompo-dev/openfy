import { parseFromPlaylistItemsToTracks } from '../parseFromPlaylistItemsToTracks';

describe('parseFromPlaylistItemsToTracks', () => {
  it('ignora itens sem faixa e preserva dados da faixa válida', () => {
    const tracks = parseFromPlaylistItemsToTracks([
      { track: null },
      {
        track: {
          id: 'track-1',
          name: 'Faixa válida',
          duration_ms: 180_000,
          explicit: false,
          artists: [{ id: 'artist-1', name: 'Artista' }],
          album: { name: 'Álbum', images: [{ url: 'https://cover.test/a.jpg' }] },
        },
      },
    ]);

    expect(tracks).toEqual([
      expect.objectContaining({
        id: 'track-1',
        artists: [{ id: 'artist-1', name: 'Artista' }],
        durationMs: 180_000,
      }),
    ]);
  });
});
