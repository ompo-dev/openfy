import type { TrackModel } from '@models';
import {
  getBestYouTubeMusicThumbnail,
  getYouTubeMusicClient,
  getYouTubeMusicText,
  toYouTubeMusicArtistRouteId,
  type YouTubeMusicItem,
} from '../../services/youtubeMusicClient';
import { toYouTubeMusicTrackModel } from '../search/catalog';

export type YouTubeMusicAlbum = {
  id: string;
  name: string;
  imageURL: string;
  releaseDate: string;
  releaseType: 'album' | 'single' | 'compilation';
  tracks: TrackModel[];
  artists: { id: string; name: string; imageURL?: string }[];
};

const YOUTUBE_MUSIC_ALBUM_PREFIX = 'ytalbum_';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

const decodeAlbumId = (routeId: string) => {
  const value = routeId.slice(YOUTUBE_MUSIC_ALBUM_PREFIX.length);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const releaseTypeFrom = (value: string): YouTubeMusicAlbum['releaseType'] => {
  const normalized = value.toLocaleLowerCase();
  if (normalized.includes('single')) return 'single';
  if (normalized.includes('ep')) return 'compilation';
  return 'album';
};

export const isYouTubeMusicAlbumId = (value: string) =>
  value.startsWith(YOUTUBE_MUSIC_ALBUM_PREFIX);

export const getYouTubeMusicAlbum = async (
  routeId: string
): Promise<YouTubeMusicAlbum> => {
  if (!isYouTubeMusicAlbumId(routeId)) throw new Error('Álbum do YouTube Music inválido.');

  const albumId = decodeAlbumId(routeId);
  const client = await getYouTubeMusicClient();
  const page = await client.music.getAlbum(albumId);
  const header = asRecord(page.header);
  const name = getYouTubeMusicText(header.title) || 'Lançamento';
  const subtitle = getYouTubeMusicText(header.subtitle);
  const secondSubtitle = getYouTubeMusicText(header.second_subtitle);
  const releaseDate = getYouTubeMusicText(header.year) ||
    subtitle.match(/\b(?:19|20)\d{2}\b/)?.[0] || '';
  const imageURL = getBestYouTubeMusicThumbnail({
    thumbnail: header.thumbnail,
    thumbnails: header.thumbnails,
  });
  const tracks = (page.contents || [])
    .map((item) => toYouTubeMusicTrackModel(item as YouTubeMusicItem))
    .filter((track): track is TrackModel => Boolean(track))
    .map((track) => ({
      ...track,
      albumId,
      albumName: track.albumName || name,
      imageURL: track.imageURL || imageURL,
    }));

  const artists = new Map<string, { id: string; name: string; imageURL?: string }>();
  const author = asRecord(header.author);
  const addArtist = (artist: { id?: unknown; channel_id?: unknown; name?: unknown }) => {
    const artistName = getYouTubeMusicText(artist.name);
    if (!artistName) return;
    const channelId = getYouTubeMusicText(artist.channel_id) || getYouTubeMusicText(artist.id);
    const id = toYouTubeMusicArtistRouteId(channelId, artistName);
    if (!artists.has(id)) artists.set(id, { id, name: artistName });
  };
  if (author.name) addArtist(author as { name?: unknown; id?: unknown; channel_id?: unknown });
  tracks.forEach((track) => track.artists?.forEach((artist) => addArtist(artist)));

  return {
    id: routeId,
    name,
    imageURL,
    releaseDate,
    releaseType: releaseTypeFrom(`${subtitle} ${secondSubtitle}`),
    tracks,
    artists: [...artists.values()],
  };
};
