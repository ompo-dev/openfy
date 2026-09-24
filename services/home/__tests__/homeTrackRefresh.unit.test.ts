import { refreshHomeTracks } from '../homeTrackRefresh';
import { fetchSpotifyTrackMetadata } from '../../metadata/spotifyMetadata';

jest.mock('../../metadata/spotifyMetadata', () => ({
  fetchSpotifyTrackMetadata: jest.fn(),
}));

const fetchSpotifyTrackMetadataMock = fetchSpotifyTrackMetadata as jest.Mock;

describe('refreshHomeTracks', () => {
  beforeEach(() => {
    fetchSpotifyTrackMetadataMock.mockReset();
  });

  it('refreshes public metadata without resolving an audio stream', async () => {
    fetchSpotifyTrackMetadataMock.mockResolvedValue({
      spotifyId: 'source-id',
      title: 'Título canônico',
      artistName: 'Artista canônico',
      albumName: 'Álbum canônico',
      imageURL: 'https://images.test/cover.jpg',
      duration_ms: 181000,
      artists: [],
      albumId: '',
      albumArtists: [],
    });

    const onTrackResolved = jest.fn();
    const refreshed = await refreshHomeTracks(
      [
        {
          key: 'home-card',
          spotifyId: 'source-id',
          title: 'Título original',
          artistName: 'Artista original',
          albumName: 'Single',
          imageURL: '',
          duration_ms: 180000,
        },
      ],
      onTrackResolved
    );

    expect(fetchSpotifyTrackMetadataMock).toHaveBeenCalledWith('source-id');
    expect(refreshed).toEqual({
      'home-card': expect.objectContaining({
        spotifyId: 'source-id',
        title: 'Título canônico',
        artistName: 'Artista canônico',
        albumName: 'Álbum canônico',
        imageURL: 'https://images.test/cover.jpg',
        duration_ms: 181000,
      }),
    });
    expect(onTrackResolved).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'home-card' }),
      expect.not.objectContaining({ streamUrl: expect.anything() })
    );
  });

  it('does not replace the visible card when metadata cannot be verified', async () => {
    fetchSpotifyTrackMetadataMock.mockResolvedValue(null);

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

  it('deduplicates equal catalog entries without creating stream work', async () => {
    fetchSpotifyTrackMetadataMock.mockResolvedValue({
      spotifyId: 'dedupe-source',
      title: 'Título',
      artistName: 'Artista',
      albumName: 'Single',
      imageURL: '',
      duration_ms: 180000,
      artists: [],
      albumId: '',
      albumArtists: [],
    });

    await expect(
      refreshHomeTracks(['first', 'second'].map((key) => ({
          key,
          spotifyId: 'dedupe-source',
          title: 'Título',
          artistName: 'Artista',
          albumName: 'Single',
          imageURL: '',
          duration_ms: 180000,
      })))
    ).resolves.toEqual({
      first: expect.objectContaining({ spotifyId: 'dedupe-source' }),
      second: expect.objectContaining({ spotifyId: 'dedupe-source' }),
    });

    expect(fetchSpotifyTrackMetadataMock).toHaveBeenCalledTimes(1);
  });
});
