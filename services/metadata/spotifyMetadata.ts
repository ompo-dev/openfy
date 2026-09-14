export type SpotifyArtist = { id: string; name: string };

export type SpotifyTrackMetadata = {
  spotifyId: string;
  title: string;
  artistName: string;
  artists: SpotifyArtist[];
  albumName: string;
  albumId: string;
  albumArtists: SpotifyArtist[];
  imageURL: string;
  duration_ms: number;
  trackNumber?: number;
  discNumber?: number;
};

type ImageSource = { url?: string; width?: number; maxWidth?: number };
type ArtistSource = { id?: string; uri?: string; name?: string; profile?: { name?: string } };
type ArtistList = ArtistSource[] | { items?: ArtistSource[] };
type Entity = {
  id?: string;
  uri?: string;
  name?: string;
  title?: string;
  subtitle?: string;
  artists?: ArtistList;
  firstArtist?: ArtistList;
  otherArtists?: ArtistList;
  album?: Entity;
  albumOfTrack?: Entity;
  duration?: number | { totalMilliseconds?: number };
  duration_ms?: number;
  trackNumber?: number;
  discNumber?: number;
  coverArt?: { sources?: ImageSource[] };
  visualIdentity?: { image?: ImageSource[] };
  trackList?: Entity[];
  tracks?: { items?: { track?: Entity }[] };
  tracksV2?: { items?: { track?: Entity }[] };
};
type Page = { entity: Entity | null; meta: { name: string; content: string }[] };
type EntityType = 'track' | 'album' | 'playlist' | 'artist';

const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 5 * 60_000;
const pageCache = new Map<string, { expiresAt: number; promise: Promise<Page | null> }>();

const spotifyIdFrom = (value: string | undefined, type: EntityType): string => {
  if (!value) return '';
  if (/^[a-zA-Z0-9]{22}$/.test(value)) return value;
  const uri = value.match(new RegExp(`^spotify:${type}:([a-zA-Z0-9]{22})$`));
  if (uri) return uri[1];
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com') return '';
    return url.pathname.match(new RegExp(`^/(?:intl-[^/]+/)?(?:embed/)?${type}/([a-zA-Z0-9]{22})/?$`))?.[1] ?? '';
  } catch {
    return '';
  }
};

const decodeHtml = (text: string): string =>
  text.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp|middot);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', middot: '\u00b7' } as Record<string, string>)[entity.toLowerCase()] ?? match;
  });

// The repo uses HTML tag extraction; attributes can be reordered or single-quoted.
const attributes = (tag: string): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    values[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3]);
  }
  return values;
};

const parsePage = (html: string, type: EntityType, id: string): Page | null => {
  const meta: Page['meta'] = [];
  const identities: string[] = [];
  let entity: Entity | null = null;
  for (const match of html.matchAll(/<(meta|link)\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const name = attrs.property || attrs.name;
    if (name && attrs.content) meta.push({ name, content: attrs.content });
    if (name === 'og:url' && attrs.content) identities.push(attrs.content);
    if (attrs.rel === 'canonical' && attrs.href) identities.push(attrs.href);
  }
  if (identities.some((value) => spotifyIdFrom(value, type) !== id)) return null;

  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const scriptId = attributes(match[1]).id;
    try {
      let candidate: Entity | undefined;
      if (scriptId === '__NEXT_DATA__') {
        candidate = JSON.parse(match[2]).props?.pageProps?.state?.data?.entity;
      } else if (scriptId === 'initialState') {
        // Spotify's public state is base64-encoded UTF-8, including artist/title accents.
        const json = decodeURIComponent(Array.from(atob(match[2].trim()), (char) =>
          `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`
        ).join(''));
        candidate = JSON.parse(json).entities?.items?.[`spotify:${type}:${id}`];
      }
      if (candidate && spotifyIdFrom(candidate.uri || candidate.id, type) === id) entity = candidate;
    } catch {
      // A broken state payload must not discard valid public meta tags.
    }
  }
  return entity || identities.length ? { entity, meta } : null;
};

const requestPage = async (type: EntityType, id: string, embed = false): Promise<Page | null> => {
  const url = `https://open.spotify.com/${embed ? 'embed/' : ''}${type}/${id}`;
  const cached = pageCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const controller = typeof AbortController === 'undefined' ? undefined : new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      resolve(null);
      controller?.abort();
    }, REQUEST_TIMEOUT_MS);
  });
  const request = (async () => {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' },
        signal: controller?.signal,
      });
      if (!response.ok || (response.url && spotifyIdFrom(response.url, type) !== id)) return null;
      return parsePage(await response.text(), type, id);
    } catch {
      return null;
    }
  })();
  // Bound the response body too, even on runtimes where abort does not settle fetch.
  const promise = Promise.race([request, timeout]).finally(() => clearTimeout(timer));
  for (const [key, entry] of pageCache) {
    if (entry.expiresAt <= Date.now()) pageCache.delete(key);
  }
  if (pageCache.size >= 64) pageCache.delete(pageCache.keys().next().value!);
  const entry = { expiresAt: Date.now() + CACHE_TTL_MS, promise };
  pageCache.set(url, entry);
  void promise.then((page) => {
    if (!page && pageCache.get(url) === entry) pageCache.delete(url);
  });
  return promise;
};

const metaValue = (page: Page | null, name: string): string =>
  page?.meta.find((meta) => meta.name === name)?.content ?? '';

const artistItems = (source?: ArtistList): ArtistSource[] =>
  Array.isArray(source) ? source : source?.items ?? [];

const artistsFrom = (source?: ArtistList): SpotifyArtist[] => {
  const result = new Map<string, SpotifyArtist>();
  for (const artist of artistItems(source)) {
    const id = spotifyIdFrom(artist.uri || artist.id, 'artist');
    const name = artist.name || artist.profile?.name;
    if (id && name) result.set(id, { id, name });
  }
  return Array.from(result.values());
};

const imageSources = (entity?: Entity | null): ImageSource[] => [
  ...(entity?.visualIdentity?.image ?? []),
  ...(entity?.coverArt?.sources ?? []),
];

const largestImage = (sources: ImageSource[]): string =>
  sources.filter((source) => source.url).reduce<ImageSource | undefined>((best, source) =>
    !best || (source.width ?? source.maxWidth ?? 0) > (best.width ?? best.maxWidth ?? 0) ? source : best,
  undefined)?.url ?? '';

const positiveNumber = (value: unknown): number | undefined => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value ? Number(value) : 0;
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

const durationFrom = (entity?: Entity | null): number =>
  positiveNumber(entity?.duration_ms) || positiveNumber(
    typeof entity?.duration === 'number' ? entity.duration : entity?.duration?.totalMilliseconds
  ) || 0;

const albumTracks = (entity?: Entity | null): Entity[] =>
  (entity?.tracksV2?.items ?? entity?.tracks?.items ?? []).flatMap((item) => item.track ? [item.track] : []);

const trackPosition = (page: Page | null, id: string): { trackNumber?: number; discNumber?: number } => {
  const track = albumTracks(page?.entity).find((item) => spotifyIdFrom(item.uri || item.id, 'track') === id);
  const position = { trackNumber: positiveNumber(track?.trackNumber), discNumber: positiveNumber(track?.discNumber) };
  let isTrack = false;
  for (const meta of page?.meta ?? []) {
    if (meta.name === 'music:song') isTrack = spotifyIdFrom(meta.content, 'track') === id;
    if (isTrack && meta.name === 'music:song:track') position.trackNumber ??= positiveNumber(meta.content);
    if (isTrack && meta.name === 'music:song:disc') position.discNumber ??= positiveNumber(meta.content);
  }
  return position;
};

/** Public Spotify pages only. Missing fields stay empty; unavailable tracks return null. */
export const fetchSpotifyTrackMetadata = async (spotifyId: string): Promise<SpotifyTrackMetadata | null> => {
  const id = spotifyIdFrom(spotifyId, 'track');
  if (!id) return null;
  const [embed, page] = await Promise.all([requestPage('track', id, true), requestPage('track', id)]);
  const track = embed?.entity;
  const state = page?.entity;
  const title = track?.name || track?.title || state?.name || metaValue(page, 'og:title');
  if (!title) return null;
  const embeddedAlbum = state?.albumOfTrack || state?.album || track?.album;
  const albumId = spotifyIdFrom(embeddedAlbum?.uri || embeddedAlbum?.id, 'album') || spotifyIdFrom(metaValue(page, 'music:album'), 'album');
  const albumPage = albumId ? await requestPage('album', albumId) : null;
  const albumEmbed = albumId && !albumPage?.entity?.name && !embeddedAlbum?.name
    ? await requestPage('album', albumId, true) : null;
  const album = albumPage?.entity || albumEmbed?.entity || embeddedAlbum;
  const albumTrack = albumTracks(embeddedAlbum).find((item) => spotifyIdFrom(item.uri || item.id, 'track') === id);
  const artistCandidates = [
    artistsFrom(track?.artists),
    artistsFrom(state?.artists),
    artistsFrom(albumTrack?.artists),
    artistsFrom([...artistItems(state?.firstArtist), ...artistItems(state?.otherArtists)]),
  ];
  const artists = artistCandidates.find((items) => items.length > 0) ?? [];
  const description = metaValue(page, 'og:description').split(/\s+\u00b7\s+/);
  const position = trackPosition(albumPage, id);
  const trackNumber = positiveNumber(state?.trackNumber) || positiveNumber(track?.trackNumber) || positiveNumber(metaValue(page, 'music:album:track')) || position.trackNumber;
  const discNumber = positiveNumber(state?.discNumber) || positiveNumber(track?.discNumber) || positiveNumber(metaValue(page, 'music:album:disc')) || position.discNumber;
  return {
    spotifyId: id,
    title,
    artistName: artists.map((artist) => artist.name).join(', ') || metaValue(page, 'music:musician_description') || description[0] || '',
    artists,
    albumName: album?.name || embeddedAlbum?.name || (description.length >= 4 ? description.slice(1, -2).join(' \u00b7 ') : ''),
    albumId,
    albumArtists: artistsFrom(album?.artists),
    imageURL: largestImage([...imageSources(track), ...imageSources(embeddedAlbum), ...imageSources(album)]) || metaValue(page, 'og:image'),
    duration_ms: durationFrom(track) || durationFrom(state) || (positiveNumber(metaValue(page, 'music:duration')) || 0) * 1000,
    ...(trackNumber ? { trackNumber } : {}),
    ...(discNumber ? { discNumber } : {}),
  };
};

/** Artist identity must match the requested Spotify ID before accepting its profile image. */
export const getSpotifyArtistImage = async (artistId: string): Promise<string | null> => {
  const id = spotifyIdFrom(artistId, 'artist');
  if (!id) return null;
  const page = await requestPage('artist', id);
  const url = metaValue(page, 'og:image');
  return /^https:\/\//i.test(url) ? url : null;
};

/** Collection titles/artwork belong to tracks only when importing an album. */
export const fetchSpotifyCollectionMetadata = async (spotifyId: string, type: 'album' | 'playlist'): Promise<{
  title: string;
  coverUrl: string;
  tracks: SpotifyTrackMetadata[];
} | null> => {
  const id = spotifyIdFrom(spotifyId, type);
  if (!id) return null;
  const page = await requestPage(type, id, true);
  const collection = page?.entity;
  if (!collection?.name || !collection.trackList?.length) return null;
  const tracks: SpotifyTrackMetadata[] = [];
  for (let index = 0; index < collection.trackList.length; index += 4) {
    const batch = await Promise.all(collection.trackList.slice(index, index + 4).map(async (entry) => {
      const trackId = spotifyIdFrom(entry.uri || entry.id, 'track');
      if (!trackId) return null;
      const metadata = await fetchSpotifyTrackMetadata(trackId);
      const title = metadata?.title || entry.title || entry.name;
      if (!title) return null;
      const artists = metadata?.artists.length ? metadata.artists : artistsFrom(entry.artists);
      return {
        ...metadata,
        spotifyId: trackId,
        title,
        artists,
        artistName: metadata?.artistName || artists.map((artist) => artist.name).join(', ') || entry.subtitle || '',
        albumName: metadata?.albumName || (type === 'album' ? collection.name : ''),
        albumId: metadata?.albumId || (type === 'album' ? id : ''),
        albumArtists: metadata?.albumArtists.length ? metadata.albumArtists : type === 'album' ? artistsFrom(collection.artists) : [],
        imageURL: metadata?.imageURL || largestImage(imageSources(entry)) || (type === 'album' ? largestImage(imageSources(collection)) : ''),
        duration_ms: metadata?.duration_ms || durationFrom(entry),
      };
    }));
    tracks.push(...batch.filter((track): track is SpotifyTrackMetadata => track !== null));
  }
  return { title: collection.name, coverUrl: largestImage(imageSources(collection)), tracks };
};
