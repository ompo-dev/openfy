import { spotifyGet } from '../../config';
import { getArtistDiscography } from '../artistDiscography';

jest.mock('../../config', () => ({
  BASE_URL: 'https://spotify.test/v1',
  spotifyGet: jest.fn(),
}));

describe('getArtistDiscography', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads every page of album tracks and returns Spotify credits and artwork', async () => {
    const spotifyGetMock = jest.mocked(spotifyGet);
    spotifyGetMock
      .mockResolvedValueOnce({
        data: {
          items: [{
            id: 'album-discography-pagination-test',
            name: 'Album de teste',
            album_type: 'album',
            release_date: '2025-01-01',
            images: [{ url: 'https://images.test/album.jpg' }],
            artists: [{ id: 'artist-discography-pagination-test', name: 'Artista Teste' }],
          }],
          total: 1,
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          items: Array.from({ length: 50 }, (_, index) => ({
            id: `track-discography-pagination-test-${index}`,
            name: `Faixa ${index}`,
            duration_ms: 180_000,
            explicit: false,
            artists: [{ id: 'artist-discography-pagination-test', name: 'Artista Teste' }],
          })),
          total: 51,
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          items: [{
            id: 'track-discography-pagination-test-50',
            name: 'Faixa 50',
            duration_ms: 180_000,
            explicit: false,
            artists: [
              { id: 'artist-discography-pagination-test', name: 'Artista Teste' },
              { id: 'artist-feature-pagination-test', name: 'Participante Teste' },
            ],
          }],
          total: 51,
        },
      } as never);

    const result = await getArtistDiscography('artist-discography-pagination-test');

    expect(result.albums).toEqual([expect.objectContaining({
      id: 'album-discography-pagination-test',
      title: 'Album de teste',
      imageURL: 'https://images.test/album.jpg',
    })]);
    expect(result.tracks).toHaveLength(51);
    expect(result.tracks[50]).toEqual(expect.objectContaining({
      id: 'track-discography-pagination-test-50',
      imageURL: 'https://images.test/album.jpg',
      albumName: 'Album de teste',
      artists: [
        { id: 'artist-discography-pagination-test', name: 'Artista Teste' },
        { id: 'artist-feature-pagination-test', name: 'Participante Teste' },
      ],
    }));
    expect(spotifyGetMock).toHaveBeenCalledTimes(3);
  });
});
