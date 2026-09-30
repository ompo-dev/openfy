import type { ArtistModel, TrackModel } from '@models';
import {
  getYouTubeMusicClient,
  getYouTubeMusicThumbnails,
  withYouTubeMusicTimeout,
  type YouTubeMusicItem,
} from '../../services/youtubeMusicClient';

export type CatalogSearchResults = {
  artists: ArtistModel[];
  tracks: TrackModel[];
};

export type YouTubeMusicArtistProfile = {
  artist: ArtistModel;
  tracks: TrackModel[];
};

const YOUTUBE_ARTIST_PREFIX = 'ytartist_';
const validVideoId = (id?: string) => Boolean(id && /^[A-Za-z0-9_-]{11}$/.test(id));

const largestImage = (item: YouTubeMusicItem) =>
  [...getYouTubeMusicThumbnails(item)]
    .sort((first, second) => (second.width || 0) - (first.width || 0))
    .find((image) => image.url)?.url || '';

const toTrackModel = (item: YouTubeMusicItem): TrackModel | null => {
  const videoId = item.id || '';
  const title = item.title?.trim() || '';
  if (!validVideoId(videoId) || !title) return null;
  const artists = (item.artists || item.authors || [])
    .map((artist) => ({
      id: artist.channel_id
        ? `${YOUTUBE_ARTIST_PREFIX}${encodeURIComponent(artist.channel_id)}`
        : `${YOUTUBE_ARTIST_PREFIX}name_${encodeURIComponent(artist.name?.trim() || '')}`,
      name: artist.name?.trim() || '',
    }))
    .filter((artist) => artist.name);

  return {
    id: `yt_${videoId}`,
    title,
    subtitle: artists.map((artist) => artist.name).join(', '),
    imageURL: largestImage(item),
    albumName: item.album?.name || 'YouTube Music',
    albumId: item.album?.id,
    youtubeVideoId: videoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    durationMs: Math.max(0, item.duration?.seconds || 0) * 1000,
    artists,
  };
};

const toArtistModel = (item: YouTubeMusicItem): ArtistModel | null => {
  const name = item.name?.trim() || item.title?.trim() || '';
  const browseId = item.id || item.author?.channel_id ||
    `name_${encodeURIComponent(name)}`;
  if (!name) return null;
  return {
    type: 'artist',
    id: `${YOUTUBE_ARTIST_PREFIX}${encodeURIComponent(browseId)}`,
    name,
    imageURL: largestImage(item),
  };
};

/** Search YouTube Music's public catalog directly; no Spotify account/token is needed. */
export const searchCatalog = async (
  query: string,
  limit = 12
): Promise<CatalogSearchResults> => {
  const cleanQuery = query.trim();
  if (!cleanQuery) return { artists: [], tracks: [] };

  const client = await withYouTubeMusicTimeout(getYouTubeMusicClient());
  if (!client) throw new Error('A busca está demorando. Tente novamente.');

  const results = await withYouTubeMusicTimeout(
    client.music.search(cleanQuery, { type: 'all' })
  );
  if (!results) throw new Error('A busca está demorando. Tente novamente.');
  const tracks = (results.songs?.contents || [])
    .map(toTrackModel)
    .filter((track): track is TrackModel => Boolean(track))
    .slice(0, limit);
  const artists = (results.artists?.contents || [])
    .map(toArtistModel)
    .filter((artist): artist is ArtistModel => Boolean(artist))
    .slice(0, Math.min(limit, 8));

  return { artists, tracks };
};

const loadYouTubeMusicArtistProfile = async (
  artistRouteId: string
): Promise<YouTubeMusicArtistProfile> => {
  if (!artistRouteId.startsWith(YOUTUBE_ARTIST_PREFIX)) {
    throw new Error('Identificador de artista inválido.');
  }
  let browseId = decodeURIComponent(artistRouteId.slice(YOUTUBE_ARTIST_PREFIX.length));
  const client = await withYouTubeMusicTimeout(getYouTubeMusicClient());
  if (!client) throw new Error('O perfil do artista está demorando para carregar.');
  if (browseId.startsWith('name_')) {
    const name = decodeURIComponent(browseId.slice('name_'.length));
    const search = await withYouTubeMusicTimeout(
      client.music.search(name, { type: 'artist' })
    );
    const match = search?.artists?.contents?.find(
      (item) => (item.name || item.title || '').trim().toLocaleLowerCase() === name.toLocaleLowerCase()
    ) || search?.artists?.contents?.[0];
    browseId = match?.id || match?.author?.channel_id || '';
    if (!browseId) throw new Error('Não foi possível localizar este artista.');
  }
  const page = await withYouTubeMusicTimeout(client.music.getArtist(browseId));
  if (!page) throw new Error('Não foi possível carregar este artista agora.');

  const headerItem: YouTubeMusicItem = {
    title: page.header?.title?.toString(),
    thumbnail: page.header?.thumbnail,
  };
  const songItems = (page.sections || [])
    .flatMap((section) => section.contents || [])
    .filter((item) => item.item_type === 'song' || validVideoId(item.id));
  const tracks = songItems
    .map(toTrackModel)
    .filter((track): track is TrackModel => Boolean(track));
  const name = headerItem.title?.trim() || 'Artista';

  return {
    artist: {
      type: 'artist',
      id: artistRouteId,
      name,
      imageURL: largestImage(headerItem),
    },
    tracks,
  };
};

const ARTIST_PROFILE_CACHE_MS = 6 * 60 * 60 * 1000;
const artistProfileCache = new Map<
  string,
  { expiresAt: number; promise: Promise<YouTubeMusicArtistProfile> }
>();

export const getYouTubeMusicArtistProfile = (
  artistRouteId: string
): Promise<YouTubeMusicArtistProfile> => {
  const cached = artistProfileCache.get(artistRouteId);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const entry = {
    expiresAt: Number.POSITIVE_INFINITY,
    promise: loadYouTubeMusicArtistProfile(artistRouteId),
  };
  artistProfileCache.set(artistRouteId, entry);
  void entry.promise.then(
    () => {
      if (artistProfileCache.get(artistRouteId) === entry) {
        entry.expiresAt = Date.now() + ARTIST_PROFILE_CACHE_MS;
      }
    },
    () => {
      if (artistProfileCache.get(artistRouteId) === entry) {
        artistProfileCache.delete(artistRouteId);
      }
    }
  );
  while (artistProfileCache.size > 100) {
    const oldest = artistProfileCache.keys().next().value;
    if (!oldest || oldest === artistRouteId) break;
    artistProfileCache.delete(oldest);
  }
  return entry.promise;
};
