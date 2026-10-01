import type { ArtistModel, TrackModel } from '@models';
import {
  getYouTubeMusicClient,
  getYouTubeMusicThumbnails,
  toYouTubeMusicArtistRouteId,
  YOUTUBE_MUSIC_ARTIST_PREFIX,
  getYouTubeMusicArtistRouteName,
  withYouTubeMusicTimeout,
  type YouTubeMusicItem,
} from '../../services/youtubeMusicClient';
import { log } from '../../utils/appLogger';

export type CatalogSearchResults = {
  artists: ArtistModel[];
  tracks: TrackModel[];
};

export type YouTubeMusicArtistProfile = {
  artist: ArtistModel;
  tracks: TrackModel[];
};

const validVideoId = (id?: string) => Boolean(id && /^[A-Za-z0-9_-]{11}$/.test(id));

const decodeRoutePart = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeArtistName = (value: string) =>
  value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

const parseArtistRoute = (artistRouteId: string) => {
  const routeValue = artistRouteId.slice(YOUTUBE_MUSIC_ARTIST_PREFIX.length);
  const legacyName = routeValue.startsWith('name_');
  const separator = legacyName ? -1 : routeValue.indexOf('~');
  const encodedBrowseId = legacyName
    ? routeValue
    : separator >= 0
      ? routeValue.slice(0, separator)
      : routeValue;
  const encodedName = legacyName
    ? ''
    : separator >= 0
      ? routeValue.slice(separator + 1)
      : '';
  let browseId = legacyName ? '' : decodeRoutePart(encodedBrowseId);
  let routeName = decodeRoutePart(encodedName) || getYouTubeMusicArtistRouteName(artistRouteId);

  if (browseId.startsWith('name_')) {
    if (!routeName) routeName = decodeRoutePart(browseId.slice('name_'.length));
    browseId = '';
  }

  return { browseId, routeName };
};

const largestImage = (item: YouTubeMusicItem, preferredSize?: number) =>
  [...getYouTubeMusicThumbnails(item)]
    .sort((first, second) => (second.width || 0) - (first.width || 0))
    .find((image) => image.url)?.url
    ?.replace(/=w\d+-h\d+(.*)$/, (size, suffix: string) => {
      if (!preferredSize) return size;
      return `=w${preferredSize}-h${preferredSize}${suffix}`;
    }) || '';

const toTrackModel = (item: YouTubeMusicItem): TrackModel | null => {
  const videoId = item.id || '';
  const title = item.title?.trim() || '';
  if (!validVideoId(videoId) || !title) return null;
  const artists = (item.artists || item.authors || [])
    .map((artist) => ({
      id: toYouTubeMusicArtistRouteId(
        artist.channel_id,
        artist.name?.trim() || ''
      ),
      name: artist.name?.trim() || '',
    }))
    .filter((artist) => artist.name);

  return {
    id: `yt_${videoId}`,
    title,
    subtitle: artists.map((artist) => artist.name).join(', '),
    imageURL: largestImage(item, 720),
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
  const browseId = item.id || item.author?.channel_id;
  if (!name) return null;
  return {
    type: 'artist',
    id: toYouTubeMusicArtistRouteId(browseId, name),
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
    client.music.search(cleanQuery, { type: 'all' }).catch(() => null)
  );
  let songItems = results?.songs?.contents || [];
  let artistItems = results?.artists?.contents || [];
  if (!songItems.length && !artistItems.length) {
    const fallbackResults = await withYouTubeMusicTimeout(
      Promise.allSettled([
        client.music.search(cleanQuery, { type: 'song' }),
        client.music.search(cleanQuery, { type: 'artist' }),
      ]),
      12_000
    );
    if (!fallbackResults) throw new Error('A busca está demorando. Tente novamente.');
    const [songs, artists] = fallbackResults;
    songItems = songs.status === 'fulfilled' ? songs.value.songs?.contents || [] : [];
    artistItems = artists.status === 'fulfilled' ? artists.value.artists?.contents || [] : [];
  }
  const tracks = songItems
    .map(toTrackModel)
    .filter((track): track is TrackModel => Boolean(track))
    .slice(0, limit);
  const artists = artistItems
    .map(toArtistModel)
    .filter((artist): artist is ArtistModel => Boolean(artist))
    .slice(0, Math.min(limit, 8));

  return { artists, tracks };
};

const loadYouTubeMusicArtistProfile = async (
  artistRouteId: string
): Promise<YouTubeMusicArtistProfile> => {
  if (!artistRouteId.startsWith(YOUTUBE_MUSIC_ARTIST_PREFIX)) {
    throw new Error('Identificador de artista inválido.');
  }
  let { browseId, routeName } = parseArtistRoute(artistRouteId);

  const client = await withYouTubeMusicTimeout(getYouTubeMusicClient());
  if (!client) throw new Error('O perfil do artista está demorando para carregar.');

  const findArtistBrowseId = async (name: string) => {
    let search: Awaited<ReturnType<typeof client.music.search>> | null = null;
    try {
      search = await withYouTubeMusicTimeout(
        client.music.search(name, { type: 'artist' })
      );
    } catch (error) {
      log.artist('catalog identity lookup failed', { artist: name, error });
    }
    const items = search?.artists?.contents || [];
    const normalizedName = name.trim().toLocaleLowerCase();
    const match = items.find(
      (item) => normalizeArtistName(item.name || item.title || '') === normalizeArtistName(normalizedName)
    );
    return match?.id || match?.author?.channel_id || '';
  };

  if (!browseId && routeName) browseId = await findArtistBrowseId(routeName);
  if (!browseId) throw new Error('Não foi possível localizar este artista.');

  const getArtistPage = async (id: string) => {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const page = await withYouTubeMusicTimeout(client.music.getArtist(id));
        if (page) return page;
        log.artist('catalog profile response timed out', { browseId: id, attempt });
      } catch (error) {
        log.artist('catalog profile request failed', { browseId: id, attempt, error });
      }
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    return null;
  };
  let page = await getArtistPage(browseId);
  if (!page && routeName) {
    const matchedBrowseId = await findArtistBrowseId(routeName);
    if (matchedBrowseId && matchedBrowseId !== browseId) {
      log.artist('catalog identity recovered by name', {
        previousBrowseId: browseId,
        matchedBrowseId,
      });
      browseId = matchedBrowseId;
      page = await getArtistPage(browseId);
    }
  }
  if (!page) {
    log.error('catalog artist profile exhausted retries', { artistRouteId, browseId });
    throw new Error('Não foi possível carregar este artista agora.');
  }

  const headerItem: YouTubeMusicItem = {
    title: page.header?.title?.toString(),
    thumbnail: page.header?.thumbnail,
  };
  const songItems = (page.sections || [])
    .flatMap((section) => section.contents || [])
    .filter((item) => item.item_type === 'song' || validVideoId(item.id));
  let tracks = songItems
    .map(toTrackModel)
    .filter((track): track is TrackModel => Boolean(track));
  const name = headerItem.title?.trim() || routeName || 'Artista';
  if (!tracks.length && routeName) {
    const search = await withYouTubeMusicTimeout(
      client.music.search(routeName, { type: 'song' }),
      12_000
    ).catch(() => null);
    const normalize = (value: string) => value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();
    const normalizedName = normalize(name);
    tracks = (search?.songs?.contents || [])
      .filter((item) => (item.artists || item.authors || []).some((artist) =>
        normalize(artist.name || '') === normalizedName
      ))
      .map(toTrackModel)
      .filter((track): track is TrackModel => Boolean(track));
  }

  return {
    artist: {
      type: 'artist',
      id: artistRouteId,
      name,
      imageURL:
        !routeName || normalizeArtistName(name) === normalizeArtistName(routeName)
          ? largestImage(headerItem)
          : '',
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

const ARTIST_IMAGE_CACHE_MS = 6 * 60 * 60 * 1000;
const EMPTY_ARTIST_IMAGE_CACHE_MS = 30 * 1000;
const artistImageRequests = new Map<
  string,
  { expiresAt: number; promise: Promise<string> }
>();

const loadYouTubeMusicArtistImage = async (artistRouteId: string) => {
  if (!artistRouteId.startsWith(YOUTUBE_MUSIC_ARTIST_PREFIX)) return '';
  const { browseId, routeName } = parseArtistRoute(artistRouteId);
  if (!routeName) return '';

  const client = await withYouTubeMusicTimeout(getYouTubeMusicClient());
  if (!client) return '';
  const result = await withYouTubeMusicTimeout(
    client.music.search(routeName, { type: 'artist' })
  );
  const artists = result?.artists?.contents || [];
  const byId = browseId
    ? artists.find((item) =>
      item.id === browseId || item.author?.channel_id === browseId
    )
    : undefined;
  const byName = browseId
    ? undefined
    : artists.find(
      (item) => normalizeArtistName(item.name || item.title || '') === normalizeArtistName(routeName)
    );
  return largestImage(byId || byName || {});
};

/** Fetch only the artist search result image; home/feed do not need a full profile and track list. */
export const getYouTubeMusicArtistImage = (
  artistRouteId: string
): Promise<string> => {
  const cached = artistImageRequests.get(artistRouteId);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const entry = {
    expiresAt: Number.POSITIVE_INFINITY,
    promise: loadYouTubeMusicArtistImage(artistRouteId),
  };
  artistImageRequests.set(artistRouteId, entry);
  while (artistImageRequests.size > 100) {
    const oldest = artistImageRequests.keys().next().value;
    if (!oldest || oldest === artistRouteId) break;
    artistImageRequests.delete(oldest);
  }
  void entry.promise.then(
    (imageURL) => {
      if (artistImageRequests.get(artistRouteId) === entry) {
        entry.expiresAt = Date.now() + (
          imageURL ? ARTIST_IMAGE_CACHE_MS : EMPTY_ARTIST_IMAGE_CACHE_MS
        );
      }
    },
    () => {
      if (artistImageRequests.get(artistRouteId) === entry) {
        artistImageRequests.delete(artistRouteId);
      }
    }
  );
  return entry.promise;
};
