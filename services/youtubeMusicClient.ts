export type YouTubeMusicArtistRef = {
  id?: string;
  channel_id?: string;
  name?: string;
};

export const YOUTUBE_MUSIC_ARTIST_PREFIX = 'ytartist_';

const decodeRoutePart = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const parseYouTubeMusicArtistRoute = (routeId: string) => {
  let browseId = routeId.trim();
  let routeName = '';
  // Repair previously persisted, doubly wrapped artist routes as well.
  for (let depth = 0; depth < 8 && browseId.startsWith(YOUTUBE_MUSIC_ARTIST_PREFIX); depth += 1) {
    const value = browseId.slice(YOUTUBE_MUSIC_ARTIST_PREFIX.length);
    if (value.startsWith('name_')) {
      return { browseId: '', routeName: decodeRoutePart(value.slice('name_'.length)) };
    }
    const separator = value.indexOf('~');
    if (separator >= 0) {
      const name = value.slice(separator + 1);
      routeName = decodeRoutePart(value.startsWith(YOUTUBE_MUSIC_ARTIST_PREFIX)
        ? name.split('~').at(-1) || name
        : name) || routeName;
    }
    browseId = decodeRoutePart(separator >= 0 ? value.slice(0, separator) : value);
  }
  if (browseId.startsWith('name_')) {
    return { browseId: '', routeName: routeName || decodeRoutePart(browseId.slice('name_'.length)) };
  }
  return { browseId, routeName };
};

export const toYouTubeMusicArtistRouteId = (browseId: string | undefined, name: string) => {
  const parsed = parseYouTubeMusicArtistRoute(browseId || '');
  return `${YOUTUBE_MUSIC_ARTIST_PREFIX}${encodeURIComponent(parsed.browseId)}~${encodeURIComponent(name.trim() || parsed.routeName)}`;
};

export const getYouTubeMusicArtistRouteName = (routeId: string) =>
  routeId.startsWith(YOUTUBE_MUSIC_ARTIST_PREFIX) ? parseYouTubeMusicArtistRoute(routeId).routeName : '';

export type YouTubeMusicItem = {
  id?: string;
  video_id?: string;
  title?: string;
  name?: string;
  subtitle?: unknown;
  item_type?: string;
  year?: string;
  item_count?: string;
  selected?: boolean;
  primary?: YouTubeMusicItem | null;
  duration?: { seconds?: number };
  album?: { id?: string; name?: string };
  artists?: YouTubeMusicArtistRef[];
  authors?: YouTubeMusicArtistRef[];
  author?: YouTubeMusicArtistRef;
  thumbnail?: { url?: string; width?: number }[] | { contents?: { url?: string; width?: number }[] };
  thumbnails?: { url?: string; width?: number }[];
  endpoint?: { payload?: { browseId?: string; videoId?: string } };
  subscribers?: string;
};

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' ? value as UnknownRecord : null;

const asText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const record = asRecord(value);
  if (!record) return '';
  if (typeof record.text === 'string') return record.text.trim();
  if (typeof record.simpleText === 'string') return record.simpleText.trim();
  if (Array.isArray(record.runs)) {
    return record.runs
      .map((run) => asText(asRecord(run)?.text))
      .filter(Boolean)
      .join('')
      .trim();
  }
  try {
    const rendered = String(value);
    return rendered !== '[object Object]' ? rendered.trim() : '';
  } catch {
    return '';
  }
};

export const getYouTubeMusicText = asText;

export const getYouTubeMusicThumbnails = (
  item: Pick<YouTubeMusicItem, 'thumbnail' | 'thumbnails'> | unknown
) => {
  const record = asRecord(item);
  if (!record) return [];
  const thumbnail = record.thumbnail;
  const nested = asRecord(thumbnail);
  const values = Array.isArray(thumbnail)
    ? thumbnail
    : Array.isArray(nested?.contents)
      ? nested.contents
      : Array.isArray(record.thumbnails)
        ? record.thumbnails
        : [];
  return values.flatMap((value) => {
    const image = asRecord(value);
    const url = asText(image?.url);
    if (!url) return [];
    const encodedWidth = url.match(/=w(\d+)-h\d+/)?.[1];
    const width = Number(image?.width ?? encodedWidth);
    return [{ url, width: Number.isFinite(width) ? width : 0 }];
  });
};

export const getBestYouTubeMusicThumbnail = (
  item: Pick<YouTubeMusicItem, 'thumbnail' | 'thumbnails'> | unknown,
  preferredSize = 720
) => {
  const source = [...getYouTubeMusicThumbnails(item)]
    .sort((first, second) => second.width - first.width)
    .find((thumbnail) => thumbnail.url)?.url;
  if (!source) return '';
  return source.replace(/=w\d+-h\d+([^/?]*)$/, `=w${preferredSize}-h${preferredSize}$1`);
};

export type YouTubeMusicArtistPage = {
  header?: {
    title?: { toString(): string };
    thumbnail?: YouTubeMusicItem['thumbnail'];
    description?: { toString(): string };
  };
  sections?: {
    title?: { toString(): string };
    header?: { title?: { toString(): string } };
    contents?: YouTubeMusicItem[];
  }[];
  getAllSongs?: () => Promise<{
    playlist_id?: string;
    contents?: YouTubeMusicItem[];
  }>;
};

export type YouTubeMusicAlbumPage = {
  header?: {
    title?: unknown;
    year?: unknown;
    subtitle?: unknown;
    second_subtitle?: unknown;
    thumbnails?: { url?: string; width?: number }[];
    thumbnail?: YouTubeMusicItem['thumbnail'];
    author?: YouTubeMusicArtistRef;
  };
  contents?: YouTubeMusicItem[];
};

export type YouTubeMusicPlaylistPage = {
  items?: YouTubeMusicItem[];
  has_continuation?: boolean;
  getContinuation?: () => Promise<YouTubeMusicPlaylistPage>;
};

export type YouTubeMusicClient = {
  music: {
    search: (
      query: string,
      filters: { type: 'all' | 'song' | 'artist' }
    ) => Promise<{
      songs?: { contents?: YouTubeMusicItem[] };
      artists?: { contents?: YouTubeMusicItem[] };
    }>;
    getArtist: (artistId: string) => Promise<YouTubeMusicArtistPage>;
    getPlaylist: (playlistId: string) => Promise<YouTubeMusicPlaylistPage>;
    getAlbum: (albumId: string) => Promise<YouTubeMusicAlbumPage>;
    getUpNext: (
      videoId: string,
      automix?: boolean
    ) => Promise<{ contents?: YouTubeMusicItem[] }>;
  };
  getChannel?: (channelId: string) => Promise<{
    getAbout: () => Promise<unknown>;
  }>;
};

let clientPromise: Promise<YouTubeMusicClient> | null = null;

export const getYouTubeMusicClient = (): Promise<YouTubeMusicClient> => {
  if (!clientPromise) {
    // Keep discovery's heavier client out of eager module and player initialization.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Innertube } = require('youtubei.js') as {
      Innertube: { create: (options: object) => Promise<YouTubeMusicClient> };
    };
    clientPromise = Innertube.create({
      generate_session_locally: false,
      retrieve_innertube_config: true,
      retrieve_player: false,
    }).catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
};

export const withYouTubeMusicTimeout = async <Value,>(
  promise: Promise<Value>,
  timeoutMs = 8_000
): Promise<Value | null> => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};
