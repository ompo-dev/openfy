import type { TrackModel } from '../../../models';
import { loadHomeDiscoveries, loadYouTubeMusicRadio } from '../../home/personalizedHome';
import { loadCollectionSimilarTracks } from '../collectionSimilar';

jest.mock('../../home/personalizedHome', () => ({
  loadYouTubeMusicRadio: jest.fn(), loadHomeDiscoveries: jest.fn(),
}));

const song = (id: string, title: string, artist = 'Artista') => ({
  id, title, subtitle: artist, artists: [{ id: '', name: artist }],
  albumName: 'Album', imageURL: '', durationMs: 120_000,
}) as TrackModel;

describe('collection contextual similarity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadYouTubeMusicRadio).mockResolvedValue([]);
    jest.mocked(loadHomeDiscoveries).mockResolvedValue([]);
  });

  it('uses an exact playable track as radio anchor and excludes collection members', async () => {
    const anchor = song('yt_abcdefghijk', 'Minha música');
    jest.mocked(loadYouTubeMusicRadio).mockResolvedValueOnce([
      { id: 'one', spotifyId: anchor.id, title: anchor.title, artistName: anchor.subtitle,
        albumName: 'Album', imageURL: '', duration_ms: 120_000 },
      { id: 'two', spotifyId: 'yt_lmnopqrstuv', title: 'Relacionada', artistName: 'Outro Artista',
        albumName: 'Outro Álbum', imageURL: '', duration_ms: 180_000, youtubeVideoId: 'lmnopqrstuv' },
    ]);
    const found = await loadCollectionSimilarTracks('album:context-one', [anchor]);
    expect(loadYouTubeMusicRadio).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Artista' }),
      [expect.objectContaining({ youtubeVideoId: 'abcdefghijk' })]
    );
    expect(found).toEqual([expect.objectContaining({ id: 'yt_lmnopqrstuv', title: 'Relacionada' })]);
  });

  it('falls back to artist discovery when source tracks have no verified video IDs', async () => {
    jest.mocked(loadHomeDiscoveries).mockResolvedValueOnce([
      { id: 'discovery', spotifyId: 'yt_zyxwvutsrqp', title: 'Nova faixa', artistName: 'Artista',
        albumName: 'Album', imageURL: '', duration_ms: 190_000 },
    ]);
    const found = await loadCollectionSimilarTracks('playlist:context-two', [song('spotify-song', 'Sem vídeo')]);
    expect(loadYouTubeMusicRadio).not.toHaveBeenCalled();
    expect(loadHomeDiscoveries).toHaveBeenCalledTimes(1);
    expect(found[0].title).toBe('Nova faixa');
  });
});
