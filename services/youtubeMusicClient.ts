export type YouTubeMusicArtistRef = {
  id?: string;
  channel_id?: string;
  name?: string;
};

export const YOUTUBE_MUSIC_ARTIST_PREFIX = 'ytartist_';

export const toYouTubeMusicArtistRouteId = (
  browseId: string | undefined,
  name: string
) =>
  `${YOUTUBE_MUSIC_ARTIST_PREFIX}${encodeURIComponent(browseId?.trim() || '')}~${encodeURIComponent(name.trim())}`;

export const getYouTubeMusicArtistRouteName = (artistRouteId: string) => {
  if (!artistRouteId.startsWith(YOUTUBE_MUSIC_ARTIST_PREFIX)) return '';
  const routeValue = artistRouteId.slice(YOUTUBE_MUSIC_ARTIST_PREFIX.length);
  if (routeValue.startsWith('name_')) {
    const legacyName = routeValue.slice('name_'.length);
    try {
      return decodeURIComponent(legacyName);
    } catch {
      return legacyName;
    }
  }
  const separator = routeValue.indexOf('~');
  const encodedName = separator >= 0
    ? routeValue.slice(separator + 1)
    : '';
  try {
    return decodeURIComponent(encodedName);
  } catch {
    return encodedName;
  }
};

export type YouTubeMusicItem = {
  id?: string;
  video_id?: string;
  title?: string;
  name?: string;
  item_type?: string;
  selected?: boolean;
  primary?: YouTubeMusicItem | null;
  duration?: { seconds?: number };
  album?: { id?: string; name?: string };
  artists?: YouTubeMusicArtistRef[];
  authors?: YouTubeMusicArtistRef[];
  author?: YouTubeMusicArtistRef;
  thumbnails?: { url?: string; width?: number }[];
  thumbnail?: { url?: string; width?: number }[] | { contents?: { url?: string; width?: number }[] };
  subscribers?: string;
};

export const getYouTubeMusicThumbnails = (
  item: Pick<YouTubeMusicItem, 'thumbnail' | 'thumbnails'>
) => {
  const thumbnail = item.thumbnail;
  if (Array.isArray(thumbnail)) return thumbnail;
  if (thumbnail && 'contents' in thumbnail) return thumbnail.contents || [];
  return item.thumbnails || [];
};

export type YouTubeMusicArtistPage = {
  header?: {
    title?: { toString(): string };
    thumbnail?: YouTubeMusicItem['thumbnail'];
  };
  sections?: { title?: { toString(): string }; contents?: YouTubeMusicItem[] }[];
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
    getUpNext: (
      videoId: string,
      automix?: boolean
    ) => Promise<{ contents?: YouTubeMusicItem[] }>;
  };
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
