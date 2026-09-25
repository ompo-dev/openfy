import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDownloadedTracks } from '../../download/downloadManager';
import {
  getCatalogTracks,
  getLibraryTracks,
  removeCatalogTrack,
  upsertCatalogTracks,
} from '../catalogLibrary';
import {
  getLocalPlaylists,
  upsertLocalPlaylist,
} from '../localPlaylistManager';

jest.mock('../../download/downloadManager', () => ({
  getDownloadedTracks: jest.fn(),
}));

const getDownloadedTracksMock = getDownloadedTracks as jest.Mock;

describe('catalogLibrary', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    getDownloadedTracksMock.mockReset().mockResolvedValue([]);
  });

  it('persists playable metadata without requiring an audio URL', async () => {
    const [saved] = await upsertCatalogTracks([
      {
        spotifyId: 'spotify-track',
        title: 'Faixa',
        artistName: 'Artista',
        albumName: 'Álbum',
        imageURL: 'https://images.test/cover.jpg',
        duration_ms: 180000,
      },
    ]);

    expect(saved).toMatchObject({
      spotifyId: 'spotify-track',
      sourcePlatform: 'spotify',
      addedAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(saved).not.toHaveProperty('audioUrl');
    await expect(getCatalogTracks()).resolves.toEqual([saved]);
  });

  it('preserves added order and enriches an existing catalog item', async () => {
    const [first] = await upsertCatalogTracks([
      {
        spotifyId: 'track-1',
        title: 'Faixa',
        artistName: 'Artista',
        albumName: 'Single',
        imageURL: '',
        duration_ms: 0,
      },
    ]);
    const [updated] = await upsertCatalogTracks([
      {
        spotifyId: 'track-1',
        title: 'Faixa',
        artistName: 'Artista',
        albumName: 'Disco',
        imageURL: 'https://images.test/hq.jpg',
        duration_ms: 192000,
      },
    ]);

    expect(updated.addedAt).toBe(first.addedAt);
    expect(updated).toMatchObject({
      albumName: 'Disco',
      imageURL: 'https://images.test/hq.jpg',
      duration_ms: 192000,
    });
  });

  it('overlays a downloaded file without hiding catalog-only tracks', async () => {
    await upsertCatalogTracks([
      {
        spotifyId: 'stream-only',
        title: 'Streaming',
        artistName: 'Artista A',
        albumName: 'Disco',
        imageURL: 'https://images.test/stream.jpg',
        duration_ms: 120000,
      },
      {
        spotifyId: 'downloaded',
        title: 'Catálogo',
        artistName: 'Artista B',
        albumName: 'Disco',
        imageURL: 'https://images.test/catalog.jpg',
        duration_ms: 180000,
      },
    ]);
    getDownloadedTracksMock.mockResolvedValue([
      {
        id: 'track_downloaded',
        spotifyId: 'downloaded',
        title: 'Catálogo',
        artistName: 'Artista B',
        albumName: 'Disco',
        imageURL: 'https://images.test/download.jpg',
        localAudioPath: 'file:///audio.m4a',
        localImagePath: 'file:///cover.jpg',
        downloadedAt: '2026-09-24T12:00:00.000Z',
        duration_ms: 180000,
      },
    ]);

    const tracks = await getLibraryTracks();

    expect(tracks).toHaveLength(2);
    expect(tracks.find((track) => track.spotifyId === 'stream-only')).toMatchObject({
      isDownloaded: false,
    });
    expect(tracks.find((track) => track.spotifyId === 'downloaded')).toMatchObject({
      isDownloaded: true,
      localAudioPath: 'file:///audio.m4a',
      localImagePath: 'file:///cover.jpg',
    });
  });

  it('keeps legacy downloads visible when no catalog record exists', async () => {
    getDownloadedTracksMock.mockResolvedValue([
      {
        id: 'legacy-id',
        spotifyId: 'yt_abcdefghijk',
        title: 'Legado',
        artistName: 'Canal',
        albumName: 'YouTube',
        imageURL: '',
        localAudioPath: 'file:///legacy.m4a',
        localImagePath: '',
        downloadedAt: '2026-09-24T12:00:00.000Z',
        duration_ms: 200000,
      },
    ]);

    await expect(getLibraryTracks()).resolves.toEqual([
      expect.objectContaining({
        spotifyId: 'yt_abcdefghijk',
        sourcePlatform: 'youtube',
        isDownloaded: true,
      }),
    ]);
  });

  it('removes a streaming-only track from the catalog and local playlists', async () => {
    await upsertCatalogTracks([
      {
        spotifyId: 'stream-only',
        title: 'Streaming',
        artistName: 'Artista',
        albumName: 'Single',
        imageURL: '',
        duration_ms: 180000,
      },
      {
        spotifyId: 'keep-me',
        title: 'Fica',
        artistName: 'Artista',
        albumName: 'Single',
        imageURL: '',
        duration_ms: 180000,
      },
    ]);
    await upsertLocalPlaylist({
      sourcePlatform: 'spotify',
      sourceId: 'playlist-source',
      title: 'Playlist',
      trackIds: ['stream-only', 'keep-me'],
    });

    await expect(removeCatalogTrack('stream-only')).resolves.toBe(1);
    await expect(getCatalogTracks()).resolves.toEqual([
      expect.objectContaining({ spotifyId: 'keep-me' }),
    ]);
    await expect(getLocalPlaylists()).resolves.toEqual([
      expect.objectContaining({ trackIds: ['keep-me'] }),
    ]);
  });
});
