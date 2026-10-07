import { mergeAlbumAssociations, type ArtistModel, type LibraryItemModel, type TrackAlbumRef, type TrackModel } from '@models';
import {
  getBestYouTubeMusicThumbnail,
  getYouTubeMusicClient,
  toYouTubeMusicArtistRouteId,
  YOUTUBE_MUSIC_ARTIST_PREFIX,
  parseYouTubeMusicArtistRoute,
  getYouTubeMusicText,
  withYouTubeMusicTimeout,
  type YouTubeMusicClient,
  type YouTubeMusicItem,
  type YouTubeMusicPlaylistPage,
} from '../../services/youtubeMusicClient';
import { log } from '../../utils/appLogger';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
import { getSpotifyArtistImage } from '../../services/metadata/spotifyMetadata';

export type CatalogSearchResults = {
  artists: ArtistModel[];
  tracks: TrackModel[];
  partial?: boolean;
  failedSources?: Array<'songs' | 'artists'>;
};

export type YouTubeMusicArtistProfile = {
  artist: ArtistModel;
  tracks: TrackModel[];
  participationTracks: TrackModel[];
  albums: LibraryItemModel[];
  singlesAndEps: LibraryItemModel[];
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

const artistReferencesFromValue = (value: unknown) => asArray(value).map((entry) => {
  const artist = asRecord(entry);
  return {
    name: asString(artist.name),
    id: asString(artist.channel_id) || asString(artist.id),
  };
}).filter((artist) => artist.name);
const validVideoId = (id?: string) => Boolean(id && /^[A-Za-z0-9_-]{11}$/.test(id));

const normalizeArtistName = (value: string) =>
  value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

const parseArtistRoute = parseYouTubeMusicArtistRoute;

const largestImage = (item: YouTubeMusicItem | unknown, preferredSize?: number) =>
  getBestYouTubeMusicThumbnail(item, preferredSize || 720);

const artistBiographyCache = createAsyncResourceCache<string>({
  name: 'youtube artist biography',
  category: 'artist',
  maxEntries: 100,
  ttlFor: (description) => description ? 6 * 60 * 60_000 : 60_000,
});

const loadChannelBiography = async (client: Awaited<ReturnType<typeof getYouTubeMusicClient>>, channelId: string) => {
  if (!client.getChannel) return '';
  const channel = await withYouTubeMusicTimeout(client.getChannel(channelId), 5_000);
  if (!channel) return '';
  const about = await withYouTubeMusicTimeout(channel.getAbout(), 5_000);
  if (!about) return '';
  const aboutData = asRecord(about);
  const metadata = asRecord(aboutData.metadata);
  return (asString(aboutData.description) || asString(metadata.description))
    .replace(/\s+/g, ' ')
    .slice(0, 1_200);
};

export const getYouTubeMusicArtistBiography = (artistRouteId: string) =>
  artistBiographyCache.getOrLoad(artistRouteId, async () => {
    if (!artistRouteId.startsWith(YOUTUBE_MUSIC_ARTIST_PREFIX)) return '';
    const client = await withYouTubeMusicTimeout(getYouTubeMusicClient());
    if (!client) return '';
    let { browseId, routeName } = parseArtistRoute(artistRouteId);
    const existingBio = browseId
      ? await loadChannelBiography(client, browseId).catch(() => '')
      : '';
    if (existingBio) return existingBio;
    if (!browseId && routeName) {
      const result = await withYouTubeMusicTimeout(client.music.search(routeName, { type: 'artist' }));
      const candidates = asArray(asRecord(result?.artists).contents) as YouTubeMusicItem[];
      const match = candidates.find((item) =>
        normalizeArtistName(asString(asRecord(item).name) || asString(asRecord(item).title)) === normalizeArtistName(routeName)
      );
      const data = asRecord(match);
      const author = asRecord(data.author);
      browseId = asString(data.id) || asString(author.channel_id) || asString(author.id);
    } else if (routeName) {
      const result = await withYouTubeMusicTimeout(client.music.search(routeName, { type: 'artist' }));
      const candidates = asArray(asRecord(result?.artists).contents) as YouTubeMusicItem[];
      const match = candidates.find((item) =>
        normalizeArtistName(asString(asRecord(item).name) || asString(asRecord(item).title)) === normalizeArtistName(routeName)
      );
      const data = asRecord(match);
      const author = asRecord(data.author);
      const resolvedId = asString(data.id) || asString(author.channel_id) || asString(author.id);
      if (resolvedId && resolvedId !== browseId) browseId = resolvedId;
    }
    return browseId ? loadChannelBiography(client, browseId) : '';
  }, 6 * 60 * 60_000);

const loadArtistTopSongs = async (
  client: Awaited<ReturnType<typeof getYouTubeMusicClient>>,
  artistPage: Awaited<ReturnType<NonNullable<YouTubeMusicClient['music']['getArtist']>>>
) => {
  if (!artistPage.getAllSongs) return [] as YouTubeMusicItem[];
  try {
    const shelf = await withYouTubeMusicTimeout(artistPage.getAllSongs(), 6_000);
    if (!shelf) return [];
    const items = [...asArray(asRecord(shelf).contents) as YouTubeMusicItem[]];
    const playlistId = asString(asRecord(shelf).playlist_id);
    if (!playlistId) return items;

    const firstPage = await withYouTubeMusicTimeout(client.music.getPlaylist(playlistId), 6_000);
    if (!firstPage) return items;
    let page: YouTubeMusicPlaylistPage = firstPage;
    const seenPageItems = new Set<string>();
    for (let pageIndex = 0; pageIndex < 3 && items.length < 240; pageIndex += 1) {
      const pageItems = asArray(asRecord(page).items) as YouTubeMusicItem[];
      const pageKey = pageItems.map((item) => asString(asRecord(item).id)).join(',');
      if (!pageItems.length || seenPageItems.has(pageKey)) break;
      seenPageItems.add(pageKey);
      items.push(...pageItems);
      if (!asRecord(page).has_continuation || !page.getContinuation) break;
      const next: YouTubeMusicPlaylistPage | null = await withYouTubeMusicTimeout(page.getContinuation(), 4_000);
      if (!next) break;
      page = next;
    }
    return items;
  } catch (error) {
    log.artist('complete artist song shelf unavailable', { error });
    return [];
  }
};

export const toYouTubeMusicTrackModel = (item: YouTubeMusicItem): TrackModel | null => {
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
  const release = asRecord(data.release);
  const albumId = asString(album.id) ||
    asString(data.album_id) ||
    asString(data.albumId) ||
    asString(release.id) ||
    asString(release.browse_id);
  const albumName = asString(album.name) ||
    asString(data.album_name) ||
    asString(data.albumName) ||
    asString(release.name);
  const albumArtists = artistReferencesFromValue(
    asArray(data.album_artists).length
      ? data.album_artists
      : asArray(album.artists).length
        ? album.artists
        : release.artists
  ).map((artist) => ({
    id: toYouTubeMusicArtistRouteId(artist.id, artist.name),
    name: artist.name,
  }));
  const albumImage = largestImage(album, 720) || largestImage(release, 720);
  const duration = asRecord(data.duration);
  const durationSeconds = Number(duration.seconds ?? data.duration_seconds ?? 0);
  const explicitReleaseType = [
    data.release_type,
    data.releaseType,
    data.album_type,
    data.albumType,
  ].map(asString).find(Boolean);
  const releaseType = explicitReleaseType
    ? getYouTubeMusicReleaseType(explicitReleaseType)
    : undefined;

  return {
    id: `yt_${videoId}`,
    title,
    subtitle: artists.map((artist) => artist.name).join(', '),
    imageURL: albumId ? albumImage || largestImage(item, 720) : largestImage(item, 720) || albumImage,
    albumName: albumName || 'YouTube Music',
    albumId: albumId || undefined,
    albumAssociations: albumId && albumName
      ? [{
          id: albumId,
          name: albumName,
          imageURL: albumImage,
          albumArtists: albumArtists.length ? albumArtists : undefined,
          releaseType,
        }]
      : undefined,
    albumArtists: albumArtists.length ? albumArtists : undefined,
    releaseType,
    youtubeVideoId: videoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    durationMs: Number.isFinite(durationSeconds)
      ? Math.max(0, durationSeconds) * 1000
      : 0,
    artists,
  };
};

const getReleaseSectionTitle = (section: unknown) => {
  const data = asRecord(section);
  return asString(data.header && asRecord(data.header)?.title) || asString(data.title);
};

const getYouTubeMusicReleaseType = (sectionTitle: string) => {
  const normalized = normalizeArtistName(sectionTitle);
  if (normalized.includes('single')) return 'single' as const;
  if (/\beps?\b/.test(normalized) || normalized.includes('extended play')) return 'ep' as const;
  if (normalized.includes('album')) return 'album' as const;
  return 'release';
};

const getExplicitYouTubeMusicReleaseType = (item: Record<string, unknown>) => {
  const value = [
    item.release_type,
    item.releaseType,
    item.album_type,
    item.albumType,
    item.type,
  ].map(asString).find(Boolean);
  if (!value) return null;
  const type = getYouTubeMusicReleaseType(value);
  return type === 'release' ? null : type;
};

type YouTubeMusicReleaseModel = {
  item: LibraryItemModel;
  kind: 'album' | 'single' | 'ep' | 'release';
};

const releaseBrowseId = (routeId: string) => {
  const encoded = routeId.startsWith('ytalbum_')
    ? routeId.slice('ytalbum_'.length)
    : routeId;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
};

const loadProfileReleaseAssociations = async (
  client: Awaited<ReturnType<typeof getYouTubeMusicClient>>,
  releases: YouTubeMusicReleaseModel[],
): Promise<Map<string, TrackAlbumRef[]>> => {
  const associations = new Map<string, TrackAlbumRef[]>();
  const candidates = releases.slice(0, 36);
  let cursor = 0;
  const loadNext = async () => {
    while (cursor < candidates.length) {
      const release = candidates[cursor++];
      const browseId = releaseBrowseId(release.item.id);
      if (!browseId) continue;
      if (!client.music.getAlbum) continue;
      const page = await withYouTubeMusicTimeout(client.music.getAlbum(browseId), 6_000).catch(() => null);
      if (!page) continue;
      const header = asRecord(page.header);
      const imageURL = release.item.imageURL || getBestYouTubeMusicThumbnail({
        thumbnail: header.thumbnail,
        thumbnails: header.thumbnails,
      });
      const albumRef: TrackAlbumRef = {
        id: browseId,
        name: release.item.title,
        imageURL,
        releaseType: release.item.releaseType,
        releaseDate: release.item.releaseDate,
      };
      for (const item of page.contents || []) {
        const track = toYouTubeMusicTrackModel(item);
        if (!track) continue;
        const current = associations.get(track.id) || [];
        associations.set(track.id, mergeAlbumAssociations(current, [albumRef]) || []);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, loadNext));
  return associations;
};

const toYouTubeMusicReleaseModel = (
  item: YouTubeMusicItem,
  sectionTitle: string
): YouTubeMusicReleaseModel | null => {
  const data = asRecord(item);
  const itemType = asString(data.item_type);
  if (itemType && /song|video|artist|playlist/i.test(itemType)) return null;

  const endpoint = asRecord(data.endpoint);
  const payload = asRecord(endpoint?.payload);
  const browseId = asString(data.id) || asString(payload?.browseId);
  const title = asString(data.title) || asString(data.name);
  if (!browseId || !title) return null;

  const releaseType = getExplicitYouTubeMusicReleaseType(data) ||
    getYouTubeMusicReleaseType(sectionTitle);
  const year = asString(data.year) || asString(data.subtitle).match(/\b(?:19|20)\d{2}\b/)?.[0] || '';
  const displayReleaseType = releaseType === 'ep' ? 'EP' : releaseType;
  return {
    kind: releaseType,
    item: {
      id: `ytalbum_${encodeURIComponent(browseId)}`,
      type: 'album',
      title,
      subtitle: [year, displayReleaseType].filter(Boolean).join(' · '),
      imageURL: largestImage(item, 720),
      releaseType,
      releaseDate: year || undefined,
    },
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

const dedupeArtistResults = (artists: ArtistModel[]) => {
  const deduped = new Map<string, ArtistModel>();
  artists.forEach((artist) => {
    const key = normalizeArtistName(artist.name);
    const current = deduped.get(key);
    if (!current) {
      deduped.set(key, artist);
      return;
    }
    const currentHasBrowseId = current.id.startsWith(`${YOUTUBE_MUSIC_ARTIST_PREFIX}UC`);
    const nextHasBrowseId = artist.id.startsWith(`${YOUTUBE_MUSIC_ARTIST_PREFIX}UC`);
    if ((!current.imageURL && artist.imageURL) || (!currentHasBrowseId && nextHasBrowseId)) {
      deduped.set(key, artist);
    }
  });
  return [...deduped.values()];
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
    .map(toYouTubeMusicTrackModel)
    .filter((track): track is TrackModel => Boolean(track))
    .slice(0, limit);
  const artists = dedupeArtistResults(artistItems
    .map(toArtistModel)
    .filter((artist): artist is ArtistModel => Boolean(artist))
  ).slice(0, Math.min(limit, 8));

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

const catalogSearchCache = createAsyncResourceCache<CatalogSearchResults>({
  name: 'catalog search',
  category: 'search',
  maxEntries: 50,
  ttlFor: (results) => results.partial
    ? 0
    : results.artists.length || results.tracks.length
      ? 30_000
      : 4_000,
});

const normalizeQuery = (query: string) =>
  query.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').toLocaleLowerCase();

/** Search YouTube Music's public catalog directly; no Spotify account/token is needed. */
export const searchCatalog = (query: string, limit = 12): Promise<CatalogSearchResults> => {
  const cleanQuery = query.trim();
  if (!cleanQuery) return Promise.resolve({ artists: [], tracks: [] });
  const key = `${normalizeQuery(cleanQuery)}:${limit}`;
  return catalogSearchCache.getOrLoad(
    key,
    () => searchCatalogUncached(cleanQuery, limit),
    30_000
  );
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
  const searchArtistSongs = (artistName: string) =>
    withYouTubeMusicTimeout(
      client.music.search(artistName, { type: 'song' }),
      6_000
    ).then((result) => asArray(asRecord(result?.songs).contents) as YouTubeMusicItem[])
      .catch((error) => {
        log.artist('profile song catalog search failed', { artist: artistName, error });
        return [] as YouTubeMusicItem[];
      });
  const finishSongCatalog = log.time('artist', 'profile song catalog supplementation', {
    artist: routeName,
    browseId,
  });
  const initialSongSearch = routeName ? searchArtistSongs(routeName) : null;
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
    finishSongCatalog({ ok: false, stage: 'profile-unavailable' });
    log.error('catalog artist profile exhausted retries', { artistRouteId, browseId });
    throw new Error('Não foi possível carregar este artista agora.');
  }

  const header = asRecord(page.header);
  const headerItem: YouTubeMusicItem = {
    title: asString(header.title),
    thumbnail: header.thumbnail as YouTubeMusicItem['thumbnail'],
  };
  const profileSongItems = asArray(page.sections)
    .flatMap((section) => asArray(asRecord(section).contents))
    .filter((value) => {
      const item = asRecord(value);
      return asString(item.item_type) === 'song' ||
        validVideoId(asString(item.id) || asString(item.video_id));
    }) as YouTubeMusicItem[];
  const name = asString(headerItem.title) || routeName || 'Artista';
  const releases = asArray(page.sections)
    .flatMap((section) => {
      const sectionTitle = getReleaseSectionTitle(section);
      return asArray(asRecord(section).contents)
        .map((item) => toYouTubeMusicReleaseModel(item as YouTubeMusicItem, sectionTitle))
        .filter((item): item is YouTubeMusicReleaseModel => Boolean(item));
    });
  const uniqueReleases = releases
    .filter((release, index, values) => values.findIndex((candidate) =>
      candidate.item.id === release.item.id
    ) === index);
  const albums = uniqueReleases
    .filter((release) => release.kind === 'album')
    .map((release) => release.item);
  const singlesAndEps = uniqueReleases
    .filter((release) => release.kind !== 'album')
    .map((release) => release.item);
  const [searchedSongs, completeSongShelf] = await Promise.all([
    initialSongSearch || searchArtistSongs(name),
    loadArtistTopSongs(client, page),
  ]);
  const matchingArtistCredit = (item: YouTubeMusicItem) =>
    artistReferences(item).some((artist) =>
      artist.id === browseId || normalizeArtistName(artist.name) === normalizeArtistName(name)
    );
  const matchingSearchedSongs = searchedSongs.filter(matchingArtistCredit);
  const pageAndCatalogSongs = new Map<string, YouTubeMusicItem>();
  for (const item of [...profileSongItems, ...completeSongShelf, ...matchingSearchedSongs]) {
    const data = asRecord(item);
    const id = asString(data.id) || asString(data.video_id);
    if (validVideoId(id) && !pageAndCatalogSongs.has(id)) {
      pageAndCatalogSongs.set(id, item);
    }
  }
  // A profile song shelf exposes one copy of a recording, while the same
  // recording can be present in an album, a single, and a deluxe release.
  // Read the release tracklists once so the profile keeps every membership.
  const releaseAssociations = await loadProfileReleaseAssociations(client, uniqueReleases);
  const tracks: TrackModel[] = [];
  const participationTracks: TrackModel[] = [];
  const releaseByTitle = new Map(
    uniqueReleases.map((release) => [normalizeArtistName(release.item.title), release])
  );
  const releaseByImage = new Map<string, YouTubeMusicReleaseModel | null>();
  uniqueReleases.forEach((release) => {
    const imageKey = release.item.imageURL
      .replace(/=w\d+[^/]*$/i, '')
      .replace(/=s\d+[^/]*$/i, '');
    if (!imageKey) return;
    releaseByImage.set(imageKey, releaseByImage.has(imageKey) ? null : release);
  });
  for (const item of pageAndCatalogSongs.values()) {
    const parsedTrack = toYouTubeMusicTrackModel(item);
    if (!parsedTrack) continue;
    const imageKey = (parsedTrack.imageURL || '')
      .replace(/=w\d+[^/]*$/i, '')
      .replace(/=s\d+[^/]*$/i, '');
    const matchingRelease = (parsedTrack.albumName && parsedTrack.albumName !== 'YouTube Music'
      ? releaseByTitle.get(normalizeArtistName(parsedTrack.albumName))
      : undefined) || (imageKey ? releaseByImage.get(imageKey) || undefined : undefined);
    const matchingAlbumId = matchingRelease
      ? releaseBrowseId(matchingRelease.item.id)
      : '';
    const track = matchingRelease
      ? {
          ...parsedTrack,
          albumId: matchingAlbumId,
          albumName: matchingRelease.item.title,
          imageURL: matchingRelease.item.imageURL || parsedTrack.imageURL,
          releaseType: matchingRelease.item.releaseType,
          albumAssociations: mergeAlbumAssociations(
            parsedTrack.albumAssociations,
            releaseAssociations.get(parsedTrack.id),
            [{
              id: matchingAlbumId,
              name: matchingRelease.item.title,
              imageURL: matchingRelease.item.imageURL,
              releaseType: matchingRelease.item.releaseType,
              releaseDate: matchingRelease.item.releaseDate,
            }],
          ),
        }
      : {
          ...parsedTrack,
          albumAssociations: mergeAlbumAssociations(
            parsedTrack.albumAssociations,
            releaseAssociations.get(parsedTrack.id),
          ),
        };
    const credits = artistReferences(item);
    const artistCreditIndex = credits.findIndex((artist) =>
      artist.id === browseId || normalizeArtistName(artist.name) === normalizeArtistName(name)
    );
    if (artistCreditIndex > 0) participationTracks.push(track);
    else tracks.push(track);
  }
  finishSongCatalog({
    ok: true,
    profileTracks: profileSongItems.length + completeSongShelf.length,
    catalogTracks: matchingSearchedSongs.length,
    uniqueTracks: tracks.length + participationTracks.length,
    participations: participationTracks.length,
    releases: uniqueReleases.length,
  });

  const profileImageRoute = toYouTubeMusicArtistRouteId(browseId, name);
  const headerPortrait = largestImage(headerItem, 1_000);
  const [description, profilePortrait] = await Promise.all([
    asString(header.description) || loadChannelBiography(client, browseId).catch(() => ''),
    headerPortrait
      ? Promise.resolve(headerPortrait)
      : loadYouTubeMusicArtistImage(profileImageRoute).catch(() => ''),
  ]);

  return {
    artist: {
      type: 'artist',
      id: artistRouteId,
      name,
      imageURL: profilePortrait || (
        !routeName || normalizeArtistName(name) === normalizeArtistName(routeName)
          ? largestImage(headerItem, 1_000)
          : ''
      ),
      ...(description ? { description } : {}),
    },
    tracks,
    participationTracks,
    albums,
    singlesAndEps,
  };
};

const ARTIST_PROFILE_CACHE_MS = 6 * 60 * 60 * 1000;
const artistProfileCache = createAsyncResourceCache<YouTubeMusicArtistProfile>({
  name: 'artist profile',
  category: 'artist',
  maxEntries: 100,
});

export const getYouTubeMusicArtistProfile = (
  artistRouteId: string
): Promise<YouTubeMusicArtistProfile> => artistProfileCache.getOrLoad(
  artistRouteId,
  () => loadYouTubeMusicArtistProfile(artistRouteId),
  ARTIST_PROFILE_CACHE_MS
);

export const discardPrefetchedYouTubeMusicArtistProfile = (artistRouteId: string) =>
  artistProfileCache.delete(artistRouteId);

const ARTIST_IMAGE_CACHE_MS = 6 * 60 * 60 * 1000;
const EMPTY_ARTIST_IMAGE_CACHE_MS = 30 * 1000;
const artistImageRequests = createAsyncResourceCache<string>({
  name: 'artist search image',
  category: 'artist',
  maxEntries: 100,
  ttlFor: (imageURL) => imageURL ? ARTIST_IMAGE_CACHE_MS : EMPTY_ARTIST_IMAGE_CACHE_MS,
});

const loadYouTubeMusicArtistImage = async (artistRouteId: string) => {
  if (!artistRouteId.startsWith(YOUTUBE_MUSIC_ARTIST_PREFIX)) return '';
  const { browseId, routeName } = parseArtistRoute(artistRouteId);
  if (!routeName) return '';

  const client = await withYouTubeMusicTimeout(getYouTubeMusicClient());
  if (!client) return '';
  if (browseId && client.music.getArtist) {
    try {
      const page = await withYouTubeMusicTimeout(client.music.getArtist(browseId), 6_000);
      const header = asRecord(asRecord(page).header);
      const image = largestImage({ thumbnail: header.thumbnail });
      if (image) return image;
    } catch (error) {
      log.artist('catalog image profile lookup failed', { browseId, error });
    }
  }
  const result = await withYouTubeMusicTimeout(
    client.music.search(routeName, { type: 'artist' }),
    6_000
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
  const byName = artists.find(
    (item) => normalizeArtistName(nameOf(item)) === normalizeArtistName(routeName)
  );
  return largestImage(byId || byName || {});
};

/** Fetch only the artist search result image; home/feed do not need a full profile and track list. */
export const getYouTubeMusicArtistImage = (
  artistRouteId: string
): Promise<string> => artistImageRequests.getOrLoad(
  artistRouteId,
  () => loadYouTubeMusicArtistImage(artistRouteId),
  ARTIST_IMAGE_CACHE_MS
);

/** Use YouTube Music artwork consistently, falling back to Spotify's public page. */
export const getArtistCatalogImage = async (
  artistId: string,
  artistName: string
): Promise<string> => {
  const name = artistName.trim();
  if (!name) {
    return /^[A-Za-z0-9]{22}$/.test(artistId)
      ? (await getSpotifyArtistImage(artistId).catch(() => null)) || ''
      : '';
  }

  const isYouTubeRoute = artistId.startsWith(YOUTUBE_MUSIC_ARTIST_PREFIX);
  const youtubeChannelId = !isYouTubeRoute && artistId.startsWith('UC')
    ? artistId
    : undefined;
  const routeId = isYouTubeRoute
    ? artistId
    : toYouTubeMusicArtistRouteId(youtubeChannelId, name);
  if (/^[A-Za-z0-9]{22}$/.test(artistId)) {
    const spotifyImage = await getSpotifyArtistImage(artistId).catch(() => null);
    if (spotifyImage) return spotifyImage;
  }
  const youtubeImage = await getYouTubeMusicArtistImage(routeId).catch(() => '');
  if (youtubeImage) return youtubeImage;

  return /^[A-Za-z0-9]{22}$/.test(artistId)
    ? (await getSpotifyArtistImage(artistId).catch(() => null)) || ''
    : '';
};
