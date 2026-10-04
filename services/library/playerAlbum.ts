import type { TrackModel } from '../../models';
import type { PlayerTrack } from '../../stores/usePlayerStore';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
import { prefetchImages } from '../images/imagePrefetch';

export type PlayerAlbum = { id: string; name: string; imageURL: string; tracks: PlayerTrack[] };
const albums = createAsyncResourceCache<PlayerAlbum>({ name: 'player album', maxEntries: 8 });

export const getTrackAlbumRouteId = (track?: { albumId?: string } | null): string => {
  const id = track?.albumId?.trim() || '';
  if (!id) return '';
  if (id.startsWith('ytalbum_') || id.startsWith('local_album_')) return id;
  if (/^(MPRE|OLAK5uy)/.test(id)) return `ytalbum_${encodeURIComponent(id)}`;
  return id.replace(/^spotify:/, '');
};

const loadAlbum = async (id: string) => {
  // Resolve only the selected catalog when album warming starts, not at app launch.
  /* eslint-disable @typescript-eslint/no-require-imports */
  if (id.startsWith('local_album_')) {
    const { resolveLocalAlbum } = require('./resolveLocalAlbum') as typeof import('./resolveLocalAlbum');
    return resolveLocalAlbum(decodeURIComponent(id.slice('local_album_'.length)));
  }
  if (id.startsWith('ytalbum_')) {
    const { getYouTubeMusicAlbum } = require('../../api/albums/youtubeMusicAlbum') as typeof import('../../api/albums/youtubeMusicAlbum');
    try { return await getYouTubeMusicAlbum(id); }
    catch (error) {
      const { getRememberedAlbum } = require('./albumMetadata') as typeof import('./albumMetadata');
      const remembered = await getRememberedAlbum(id);
      if (!remembered) throw error;
      return remembered;
    }
  }
  const { getAlbum } = require('../../api/albums/album') as typeof import('../../api/albums/album');
  return getAlbum(id);
  /* eslint-enable @typescript-eslint/no-require-imports */
};

export const getPlayerAlbum = (id: string): Promise<PlayerAlbum> => albums.getOrLoad(id, async () => {
  const album = await loadAlbum(id);
  const tracks: TrackModel[] = Array.isArray(album.tracks) ? album.tracks : album.tracks.items;
  const result: PlayerAlbum = {
    id, name: album.name, imageURL: album.imageURL,
    tracks: tracks.map((track, index) => ({
      ...track, spotifyId: track.id, title: track.title, artistName: track.subtitle,
      albumId: track.albumId || id, albumName: album.name,
      imageURL: album.imageURL || track.imageURL || '', duration_ms: track.durationMs || 0,
      trackNumber: track.trackNumber || index + 1,
    })),
  };
  void prefetchImages([result.imageURL, ...result.tracks.map((track) => track.imageURL)]);
  return result;
}, 30 * 60_000);

export const prefetchTrackAlbumData = (track: { albumId?: string }): void => {
  const id = getTrackAlbumRouteId(track);
  if (id) void getPlayerAlbum(id).catch(() => {});
};

export const _clearPlayerAlbumCacheForTests = () => albums.clear();
