import {
  getAlbum,
  getArtist,
  getPlaylist,
  getPlaylistItems,
  getYouTubeMusicAlbum,
  getYouTubeMusicArtistProfile,
  isYouTubeMusicAlbumId,
} from '../../api';
import { getDetailPreview } from './detailPreview';
import { prefetchImage } from '../images/imagePrefetch';

type DetailType = 'album' | 'artist' | 'playlist' | 'episode' | 'show';

const pending = new Map<string, Promise<unknown>>();
const isSpotifyId = (value: string) => /^[A-Za-z0-9]{22}$/.test(value);

const loadDetail = (type: DetailType, id: string): Promise<unknown> | null => {
  if (!id || id.startsWith('local_') || id.startsWith('home_mix_')) return null;
  if (type === 'album') {
    return isYouTubeMusicAlbumId(id) ? getYouTubeMusicAlbum(id) : getAlbum(id);
  }
  if (type === 'playlist') return getPlaylist(id).then((playlist) => {
    if (playlist.tracks.total) void getPlaylistItems({ playlistId: id, limit: 12, offset: 0 }).catch(() => {});
    return playlist;
  });
  if (type === 'artist') {
    if (isSpotifyId(id)) return getArtist(id);
    if (id.startsWith('ytartist_')) return getYouTubeMusicArtistProfile(id);
  }
  return null;
};

/** Starts detail I/O without making navigation wait for it. API caches coalesce repeats. */
export const prefetchDetail = (type: DetailType, id: string): void => {
  if (type === 'artist' || type === 'album' || type === 'playlist') {
    const image = getDetailPreview(type, id)?.imageURL;
    if (image) void prefetchImage(image).catch(() => {});
  }
  const key = `${type}:${id}`;
  if (pending.has(key)) return;
  let request: Promise<unknown> | null = null;
  try {
    request = loadDetail(type, id);
  } catch {
    // Prefetch is best effort and must never block navigation or test doubles.
    return;
  }
  if (!request) return;
  pending.set(key, request.catch(() => undefined).finally(() => pending.delete(key)));
};

export const _clearDetailPrefetchForTests = () => pending.clear();
