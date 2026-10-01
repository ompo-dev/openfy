import type { ArtistModel, TrackModel } from '@models';
import {
  getYouTubeMusicClient,
  getYouTubeMusicThumbnails,
  toYouTubeMusicArtistRouteId,
  YOUTUBE_MUSIC_ARTIST_PREFIX,
  getYouTubeMusicArtistRouteName,
  getYouTubeMusicText,
  withYouTubeMusicTimeout,
  type YouTubeMusicItem,
} from '../../services/youtubeMusicClient';
import { log } from '../../utils/appLogger';

export type CatalogSearchResults = {
  artists: ArtistModel[];
  tracks: TrackModel[];
  partial?: boolean;
  failedSources?: Array<'songs' | 'artists'>;
};

export type YouTubeMusicArtistProfile = {
  artist: ArtistModel;
  tracks: TrackModel[];
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

const asString = (value: unknown) => getYouTubeMusicText(value);
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const artistReferences = (item: unknown) => {
  const data = asRecord(item);
  const artists = asArray(data.artists).length
    ? asArray(data.artists)
    : asArray(data.authors);
  return artists.map((value) => {
    const artist = asRecord(value);
    return {
      name: asString(artist.name),
      id: asString(artist.channel_id) || asString(artist.id),
    };
  }).filter((artist) => artist.name);
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

const largestImage = (item: YouTubeMusicItem | unknown, preferredSize?: number) =>
  [...getYouTubeMusicThumbnails(item)]
    .sort((first, second) => (second.width || 0) - (first.width || 0))
    .find((image) => image.url)?.url
    ?.replace(/=w\d+-h\d+(.*)$/, (size, suffix: string) => {
      if (!preferredSize) return size;
      return `=w${preferredSize}-h${preferredSize}${suffix}`;
    }) || '';

const toTrackModel = (item: YouTubeMusicItem): TrackModel | null => {
  const data = asRecord(item);
  const videoId = asString(data.id) || asString(data.video_id);
  const title = asString(data.title) || asString(data.name);
  if (!validVideoId(videoId) || !title) return null;
  const artists = artistReferences(item)
    .map((artist) => ({
      id: toYouTubeMusicArtistRouteId(
        artist.id,
        artist.name
      ),
      name: artist.name,
    }));
  const album = asRecord(data.album);
  const duration = asRecord(data.duration);
  const durationSeconds = Number(duration.seconds ?? data.duration_seconds ?? 0);

  return {
    id: `yt_${videoId}`,
    title,
    subtitle: artists.map((artist) => artist.name).join(', '),
    imageURL: largestImage(item, 720),
    albumName: asString(album.name) || 'YouTube Music',
    albumId: asString(album.id) || undefined,
    youtubeVideoId: videoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    durationMs: Number.isFinite(durationSeconds)
      ? Math.max(0, durationSeconds) * 1000
      : 0,
    artists,
  };
};

const toArtistModel = (item: YouTubeMusicItem): ArtistModel | null => {
  const data = asRecord(item);
  const author = asRecord(data.author);
  const name = asString(data.name) || asString(data.title);
  const browseId = asString(data.id) || asString(author.channel_id) || asString(author.id);
  if (!name) return null;
  return {
    type: 'artist',
    id: toYouTubeMusicArtistRouteId(browseId, name),
    name,
    imageURL: largestImage(item),
  };
};

const artistSearchSeeds = new Map<string, {
  expiresAt: number;
  artist: ArtistModel;
  tracks: TrackModel[];
}>();

const rememberSearchSeeds = (results: CatalogSearchResults) => {
  const expiresAt = Date.now() + 2 * 60_000;
  for (const artist of results.artists) {
    const name = normalizeArtistName(artist.name);
    const foundTracks = results.tracks.filter((track) =>
      track.artists?.some((candidate) =>
        candidate.id === artist.id || normalizeArtistName(candidate.name) === name
      )
    );
    const existing = artistSearchSeeds.get(artist.id);
    const existingTracks = existing && existing.expiresAt > Date.now()
      ? existing.tracks
      : [];
    const uniqueTracks = new Map(
      [...foundTracks, ...existingTracks].map((track) => [track.id, track])
    );
    const tracks = [...uniqueTracks.values()];
    const imageURL = artist.imageURL || (
      existing && existing.expiresAt > Date.now() ? existing.artist.imageURL : ''
    );
    if (!tracks.length && !imageURL) continue;
    artistSearchSeeds.set(artist.id, {
      expiresAt,
      artist: imageURL === artist.imageURL ? artist : { ...artist, imageURL },
      tracks,
    });
  }
  while (artistSearchSeeds.size > 100) {
    const oldest = artistSearchSeeds.keys().next().value;
    if (!oldest) break;
    artistSearchSeeds.delete(oldest);
  }
};

export const getCachedArtistSearchSeed = (artistRouteId: string) => {
  const seed = artistSearchSeeds.get(artistRouteId);
  if (!seed) return null;
  if (seed.expiresAt <= Date.now()) {
    artistSearchSeeds.delete(artistRouteId);
    return null;
  }
  return { artist: seed.artist, tracks: [...seed.tracks] };
};

const searchCatalogUncached = async (
  query: string,
  limit = 12
): Promise<CatalogSearchResults> => {
  const cleanQuery = query.trim();
  if (!cleanQuery) return { artists: [], tracks: [] };

  const finishSearch = log.time('search', 'youtube music catalog request', {
    queryLength: cleanQuery.length,
  });
  const client = await withYouTubeMusicTimeout(getYouTubeMusicClient());
  if (!client) {
    finishSearch({ ok: false, stage: 'client-init-timeout' });
    throw new Error('A busca está demorando. Tente novamente.');
  }

  let combined: Awaited<ReturnType<typeof client.music.search>> | null = null;
  let combinedError: unknown;
  try {
    combined = await withYouTubeMusicTimeout(
      client.music.search(cleanQuery, { type: 'all' })
    );
  } catch (error) {
    combinedError = error;
    log.search('youtube music combined search failed; using split queries', { error });
  }
  let songItems = asArray(asRecord(combined?.songs).contents) as YouTubeMusicItem[];
  let artistItems = asArray(asRecord(combined?.artists).contents) as YouTubeMusicItem[];
  type SearchResponse = Awaited<ReturnType<typeof client.music.search>>;
  let songSearchResult: PromiseSettledResult<SearchResponse> = combined
    ? { status: 'fulfilled', value: combined }
    : { status: 'rejected', reason: combinedError || new Error('Combined search timed out.') };
  let artistSearchResult: PromiseSettledResult<SearchResponse> = combined
    ? { status: 'fulfilled', value: combined }
    : { status: 'rejected', reason: combinedError || new Error('Combined search timed out.') };
  const missingSources: Array<'songs' | 'artists'> = [];
  let failedSources: Array<'songs' | 'artists'> = [];
  if (!songItems.length) missingSources.push('songs');
  if (!artistItems.length) missingSources.push('artists');
  if (missingSources.length) {
    const fallbackTimer = log.time('search', 'youtube music split search', {
      queryLength: cleanQuery.length,
      sources: missingSources,
    });
    const fallbackResults = await withYouTubeMusicTimeout(
      Promise.allSettled(missingSources.map((source) =>
        client.music.search(cleanQuery, {
          type: source === 'songs' ? 'song' : 'artist',
        })
      )),
      12_000
    );
    if (!fallbackResults) {
      fallbackTimer({ ok: false, timeout: true });
      finishSearch({ ok: false, stage: 'split-search-timeout' });
      throw new Error('A busca está demorando. Tente novamente.');
    }
    fallbackResults.forEach((result, index) => {
      if (missingSources[index] === 'songs') songSearchResult = result;
      else artistSearchResult = result;
    });
    const retrySources: Array<'songs' | 'artists'> = [];
    if (songSearchResult.status === 'rejected') retrySources.push('songs');
    if (artistSearchResult.status === 'rejected') retrySources.push('artists');
    if (retrySources.length) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const retry = await withYouTubeMusicTimeout(
        Promise.allSettled(retrySources.map((source) =>
          client.music.search(cleanQuery, {
            type: source === 'songs' ? 'song' : 'artist',
          })
        )),
        5_000
      );
      if (retry) {
        retry.forEach((result, index) => {
          if (result.status !== 'fulfilled') return;
          if (retrySources[index] === 'songs') songSearchResult = result;
          else artistSearchResult = result;
        });
      }
      log.search('youtube music failed source retry completed', {
        retried: retrySources,
        recovered: retry?.filter((result) => result.status === 'fulfilled').length || 0,
      });
    }
    const successfulSources = Number(songSearchResult.status === 'fulfilled') +
      Number(artistSearchResult.status === 'fulfilled');
    if (!successfulSources) {
      fallbackTimer({ ok: false, failedSources: 2 });
      finishSearch({ ok: false, stage: 'all-search-sources-failed' });
      throw songSearchResult.status === 'rejected'
        ? songSearchResult.reason
        : artistSearchResult.status === 'rejected'
          ? artistSearchResult.reason
          : combinedError || new Error('Não foi possível pesquisar agora.');
    }
    failedSources = [
      ...(songSearchResult.status === 'rejected' ? ['songs' as const] : []),
      ...(artistSearchResult.status === 'rejected' ? ['artists' as const] : []),
    ];
    if (missingSources.includes('songs')) {
      songItems = songSearchResult.status === 'fulfilled'
        ? asArray(asRecord(songSearchResult.value.songs).contents) as YouTubeMusicItem[]
        : [];
    }
    if (missingSources.includes('artists')) {
      artistItems = artistSearchResult.status === 'fulfilled'
        ? asArray(asRecord(artistSearchResult.value.artists).contents) as YouTubeMusicItem[]
        : [];
    }
    fallbackTimer({
      ok: !failedSources.length,
      songSource: songSearchResult.status,
      artistSource: artistSearchResult.status,
      failedSources,
      tracks: songItems.length,
      artists: artistItems.length,
    });
  }
  const tracks = songItems
    .map(toTrackModel)
    .filter((track): track is TrackModel => Boolean(track))
    .slice(0, limit);
  const artists = artistItems
    .map(toArtistModel)
    .filter((artist): artist is ArtistModel => Boolean(artist))
    .slice(0, Math.min(limit, 8));

  const catalogResults: CatalogSearchResults = {
    artists,
    tracks,
    ...(failedSources.length ? { partial: true, failedSources } : {}),
  };
  rememberSearchSeeds(catalogResults);
  finishSearch({
    ok: true,
    partial: Boolean(failedSources.length),
    artists: artists.length,
    tracks: tracks.length,
  });
  return catalogResults;
};

const catalogSearchCache = new Map<string, {
  expiresAt: number;
  promise: Promise<CatalogSearchResults>;
}>();

const normalizeQuery = (query: string) =>
  query.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').toLocaleLowerCase();

/** Search YouTube Music's public catalog directly; no Spotify account/token is needed. */
export const searchCatalog = (query: string, limit = 12): Promise<CatalogSearchResults> => {
  const cleanQuery = query.trim();
  if (!cleanQuery) return Promise.resolve({ artists: [], tracks: [] });
  const key = `${normalizeQuery(cleanQuery)}:${limit}`;
  const cached = catalogSearchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const entry = {
    expiresAt: Number.POSITIVE_INFINITY,
    promise: searchCatalogUncached(cleanQuery, limit),
  };
  catalogSearchCache.set(key, entry);
  void entry.promise.then(
    (results) => {
      if (catalogSearchCache.get(key) !== entry) return;
      if (results.partial) {
        catalogSearchCache.delete(key);
        return;
      }
      entry.expiresAt = Date.now() + (results.artists.length || results.tracks.length ? 30_000 : 4_000);
    },
    () => {
      if (catalogSearchCache.get(key) === entry) catalogSearchCache.delete(key);
    }
  );
  while (catalogSearchCache.size > 50) {
    const oldest = catalogSearchCache.keys().next().value;
    if (!oldest || oldest === key) break;
    catalogSearchCache.delete(oldest);
  }
  return entry.promise;
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
    const items = asArray(asRecord(search?.artists).contents) as YouTubeMusicItem[];
    const match = items.find(
      (item) => normalizeArtistName(
        asString(asRecord(item).name) || asString(asRecord(item).title)
      ) === normalizeArtistName(name)
    );
    const matchData = asRecord(match);
    const author = asRecord(matchData.author);
    return asString(matchData.id) || asString(author.channel_id) || asString(author.id);
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

  const header = asRecord(page.header);
  const headerItem: YouTubeMusicItem = {
    title: asString(header.title),
    thumbnail: header.thumbnail as YouTubeMusicItem['thumbnail'],
  };
  const songItems = asArray(page.sections)
    .flatMap((section) => asArray(asRecord(section).contents))
    .filter((value) => {
      const item = asRecord(value);
      return asString(item.item_type) === 'song' ||
        validVideoId(asString(item.id) || asString(item.video_id));
    }) as YouTubeMusicItem[];
  let tracks = songItems
    .map(toTrackModel)
    .filter((track): track is TrackModel => Boolean(track));
  const name = asString(headerItem.title) || routeName || 'Artista';
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
      .filter((item) => artistReferences(item).some((artist) =>
        normalize(artist.name) === normalizedName
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
  const artists = asArray(asRecord(result?.artists).contents) as YouTubeMusicItem[];
  const idOf = (item: unknown) => {
    const data = asRecord(item);
    const author = asRecord(data.author);
    return asString(data.id) || asString(author.channel_id) || asString(author.id);
  };
  const nameOf = (item: unknown) => {
    const data = asRecord(item);
    return asString(data.name) || asString(data.title);
  };
  const byId = browseId
    ? artists.find((item) => idOf(item) === browseId)
    : undefined;
  const byName = browseId
    ? undefined
    : artists.find(
      (item) => normalizeArtistName(nameOf(item)) === normalizeArtistName(routeName)
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
