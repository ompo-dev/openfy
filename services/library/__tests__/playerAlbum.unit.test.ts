jest.mock('../../../api/albums/album', () => ({ getAlbum: jest.fn() }));
jest.mock('../../../api/albums/youtubeMusicAlbum', () => ({ getYouTubeMusicAlbum: jest.fn() }));
jest.mock('../resolveLocalAlbum', () => ({ resolveLocalAlbum: jest.fn() }));
jest.mock('../albumMetadata', () => ({ getRememberedAlbum: jest.fn() }));
jest.mock('../../images/imagePrefetch', () => ({ prefetchImages: jest.fn() }));

import { getAlbum } from '../../../api/albums/album';
import { getYouTubeMusicAlbum } from '../../../api/albums/youtubeMusicAlbum';
import { getRememberedAlbum } from '../albumMetadata';
import { prefetchImages } from '../../images/imagePrefetch';
import { _clearPlayerAlbumCacheForTests, getPlayerAlbum, getTrackAlbumRouteId, prefetchTrackAlbumData } from '../playerAlbum';

const album = {
  id: 'ytalbum_MPREtest', name: 'KM2', imageURL: 'https://img.test/km2.jpg',
  tracks: Array.from({ length: 11 }, (_, index) => ({
    id: `yt_track_${index}`, title: `Song ${index}`, subtitle: 'Ebony', durationMs: 150000,
    artists: [{ id: 'ytartist_Ebony', name: 'Ebony' }], youtubeVideoId: `video${index}`,
    albumId: 'MPREtest', imageURL: 'https://img.test/km2.jpg',
  })),
};

describe('player album prefetch', () => {
  beforeEach(() => {
    _clearPlayerAlbumCacheForTests();
    jest.clearAllMocks();
    jest.mocked(getYouTubeMusicAlbum).mockResolvedValue(album as any);
  });

  it('normalizes catalog album ids to navigable routes', () => {
    expect(getTrackAlbumRouteId(null)).toBe('');
    expect(getTrackAlbumRouteId({ albumId: 'MPREtest' })).toBe('ytalbum_MPREtest');
    expect(getTrackAlbumRouteId({ albumId: 'OLAK5uy_test' })).toBe('ytalbum_OLAK5uy_test');
    expect(getTrackAlbumRouteId({ albumId: 'ytalbum_MPREtest' })).toBe('ytalbum_MPREtest');
    expect(getTrackAlbumRouteId({ albumId: 'spotify:123' })).toBe('123');
    expect(getTrackAlbumRouteId({ albumId: 'local_album_123' })).toBe('local_album_123');
  });

  it('loads every album track and shares its artwork with playback', async () => {
    prefetchTrackAlbumData({ albumId: 'MPREtest' });
    const result = await getPlayerAlbum('ytalbum_MPREtest');
    expect(result.tracks).toHaveLength(11);
    expect(result.tracks[10]).toMatchObject({
      spotifyId: 'yt_track_10', artistName: 'Ebony', duration_ms: 150000,
      albumId: 'MPREtest', albumName: 'KM2', trackNumber: 11,
      youtubeVideoId: 'video10', imageURL: album.imageURL, artists: album.tracks[10].artists,
    });
    expect(getYouTubeMusicAlbum).toHaveBeenCalledTimes(1);
    expect(prefetchImages).toHaveBeenCalledWith(Array(12).fill(album.imageURL));
  });

  it('preserves Spotify durations and credits, not only the title and cover', async () => {
    jest.mocked(getAlbum).mockResolvedValue({ ...album, tracks: { items: album.tracks } } as any);
    const result = await getPlayerAlbum('spotify-album');
    expect(result.tracks[0].duration_ms).toBe(150000);
    expect(result.tracks[0].artists).toEqual(album.tracks[0].artists);
    expect(getAlbum).toHaveBeenCalledWith('spotify-album');
  });

  it('uses the remembered complete album if its remote catalog is unavailable', async () => {
    jest.mocked(getYouTubeMusicAlbum).mockRejectedValueOnce(new Error('offline'));
    jest.mocked(getRememberedAlbum).mockResolvedValueOnce(album as any);
    expect((await getPlayerAlbum('ytalbum_MPREtest')).tracks).toHaveLength(11);
  });
});
