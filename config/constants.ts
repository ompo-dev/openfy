import Constants from 'expo-constants';
import { Platform } from 'react-native';

export enum PLATFORMS {
  IOS = 'ios',
  ANDROID = 'android',
  WINDOWS = 'windows',
  MACOS = 'macos',
  WEB = 'web',
}

export enum Pages {
  HOME = 'home',
  SEARCH = 'search',
  LIBRARY = 'library',
}

export enum Sizes {
  BIG = 152,
  MEDIUM = 140,
  SMALL = 120,
  VERY_SMALL = 100,
}

export enum Shapes {
  SQUARE = 0,
  SQUARE_BORDER = 4,
  SQUARE_BORDER_SMALL = 2,
  EDGED_BORDER = 8,
  OVAL = 20,
  CIRCLE = 9999,
}

export enum Categories {
  SAVED_PLAYLISTS = 'playlist',
  SAVED_PODCASTS = 'show',
  SAVED_ALBUMS = 'album',
  FOLLOWED_ARTISTS = 'artist',
  DOWNLOADED = 'downloaded',
  ALL = 'all',
}

export enum AuthResponse {
  CANCEL = 'cancel',
  DISMISS = 'dismiss',
  OPENED = 'opened',
  LOCKED = 'locked',
  ERROR = 'error',
  SUCCESS = 'success',
}

export enum AlbumTypes {
  ALBUM = 'album',
  SINGLE = 'single',
  COMPILATION = 'compilation',
}

export const SEPARATOR = '\u2022';
export const explicit_SIGN = 'E';

export const SOUND_COPYRIGHT_SIGN = '\u2117';
export const COPYRIGHT_SIGN = '\u00A9';

export const COMMON_HEADER_HEIGHT = 100;
export const HEADER_HEIGHT = 135;
export const HEADER_CATEGORIES_HEIGHT = 58;
export const BOTTOM_NAVIGATION_HEIGHT = 90;

export const COVER_SIZE = 300;
export const TRACK_COVER_SIZE = 50;
export const RECENTLY_PLAYED_COVER_SIZE = 55;
export const BROWSE_CATEGORY_IMAGE_SIZE = 75;
export const BROWSE_CATEGORY_HEIGHT = 55;

type MusicServerUrlOptions = {
  configuredUrl?: string;
  developmentHost?: string;
  platform: string;
};

const isLoopbackHost = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

const normalizeServerUrl = (value?: string) => {
  if (!value) return '';
  try {
    const url = new URL(value.trim());
    return /^https?:$/.test(url.protocol)
      ? `${url.origin}${url.pathname.replace(/\/$/, '')}`
      : '';
  } catch {
    return '';
  }
};

const serverUrlFromDevelopmentHost = (value?: string) => {
  if (!value) return '';
  try {
    const url = new URL(value.includes('://') ? value : `http://${value}`);
    if (!url.hostname || isLoopbackHost(url.hostname)) return '';
    const host = url.hostname.includes(':')
      ? `[${url.hostname}]`
      : url.hostname;
    return `http://${host}${url.port ? `:${url.port}` : ''}`;
  } catch {
    return '';
  }
};

/** Uses Expo Router API Routes on the same Metro origin during development. */
export const resolveMusicServerUrl = ({
  configuredUrl,
  developmentHost,
  platform,
}: MusicServerUrlOptions) => {
  const configured = normalizeServerUrl(configuredUrl);
  const configuredHost = configured ? new URL(configured).hostname : '';

  if (configured && (platform === 'web' || !isLoopbackHost(configuredHost))) {
    return configured;
  }

  if (platform === 'web') {
    if (configured) return configured;
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
  }

  return serverUrlFromDevelopmentHost(developmentHost);
};

const configuredMusicServerUrl = Constants.expoConfig?.extra?.musicServerUrl as
  string | undefined;
const runtimeManifest = Constants.manifest2 as
  | { hostUri?: string; extra?: { expoGo?: { debuggerHost?: string } } }
  | null;
const legacyManifest = Constants.manifest as
  | { hostUri?: string; debuggerHost?: string }
  | null;
const developmentHost = [
  Constants.expoConfig?.hostUri,
  (Constants.expoGoConfig as { debuggerHost?: string } | null)?.debuggerHost,
  runtimeManifest?.hostUri,
  runtimeManifest?.extra?.expoGo?.debuggerHost,
  legacyManifest?.hostUri,
  legacyManifest?.debuggerHost,
  Constants.linkingUri,
  Constants.experienceUrl,
].find((host): host is string => typeof host === 'string' && host.length > 0);

// Expo Go provides Metro's host, where Expo Router serves the app API Routes.
export const MUSIC_SERVER_URL = resolveMusicServerUrl({
  configuredUrl: configuredMusicServerUrl,
  developmentHost,
  platform: Platform.OS,
});
