import { spotifyGet } from '../../config';
import { getArtistDiscography, subscribeArtistDiscography } from '../artistDiscography';

jest.mock('../../config', () => ({
  BASE_URL: 'https://spotify.test/v1',
  spotifyGet: jest.fn(),
}));

describe('getArtistDiscography', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes releases and the first album without waiting for a slow deluxe album', async () => {
    const id = 'progressive-discography';
    const albums = ['original', 'deluxe'].map((id) => ({ id, name: id, album_type: 'album',
      release_date: '2026-01-01', images: [], artists: [{ id: 'artist', name: 'Artist' }] }));
    const track = { id: 'original-track', name: 'Same recording', duration_ms: 1000, explicit: false,
      artists: [{ id: 'artist', name: 'Artist' }] };
    let finishDeluxe!: (value: unknown) => void;
    jest.mocked(spotifyGet).mockResolvedValueOnce({ data: { items: albums, total: 2 } } as never)
      .mockResolvedValueOnce({ data: { items: [track], total: 1 } } as never)
      .mockImplementationOnce(() => new Promise((resolve) => { finishDeluxe = resolve as never; }));
    let notify!: () => void;
    const initial = new Promise<void>((resolve) => { notify = resolve; });
    const listener = jest.fn((value) => { if (value.tracks.length) notify(); });
    const unsubscribe = subscribeArtistDiscography(id, listener);
    let finished = false;
    const full = getArtistDiscography(id).then((value) => { finished = true; return value; });
    await initial;
    expect(finished).toBe(false);
    expect(listener.mock.calls[0][0]).toMatchObject({ albums: expect.any(Array), tracks: [] });
    expect(listener.mock.lastCall?.[0].tracks).toHaveLength(1);
    finishDeluxe({ data: { items: [{ ...track, id: 'deluxe-track' }], total: 1 } });
    const result = await full;
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].albumAssociations).toHaveLength(2);
    unsubscribe();
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
