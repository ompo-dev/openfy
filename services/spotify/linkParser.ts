/**
 * Media Link Parser (Spotify & YouTube / YouTube Music)
 * Supports:
 * - https://open.spotify.com/track/ID
 * - https://open.spotify.com/intl-pt/track/ID
 * - https://open.spotify.com/playlist/ID
 * - https://open.spotify.com/album/ID
 * - spotify:track:ID
 * - https://music.youtube.com/watch?v=ID
 * - https://www.youtube.com/watch?v=ID
 * - https://youtu.be/ID
 * - https://music.youtube.com/playlist?list=ID
 * - https://www.youtube.com/playlist?list=ID
 */

export type MediaType = 'track' | 'playlist' | 'album';
export type MediaPlatform = 'spotify' | 'youtube';

export type ParsedMediaLink = {
  platform: MediaPlatform;
  type: MediaType;
  id: string;
};

// Aliases for backwards compatibility
export type SpotifyResourceType = MediaType;
export type ParsedSpotifyLink = ParsedMediaLink;

const SPOTIFY_URL_REGEX =
  /^(?:https?:\/\/)?(?:www\.)?open\.spotify\.com\/(?:intl-[A-Za-z]{2,3}(?:-[A-Za-z]{2})?\/)?(track|playlist|album)\/([A-Za-z0-9]+)(?:[/?#]|$)/i;

const SPOTIFY_URI_REGEX = /spotify:(track|playlist|album):([A-Za-z0-9]+)/;

export const parseSpotifyLink = (
  input: string
): ParsedMediaLink | null => {
  if (!input) return null;

  const trimmed = input.trim();

  // 1. Spotify URL
  const spotUrlMatch = trimmed.match(SPOTIFY_URL_REGEX);
  if (spotUrlMatch) {
    return {
      platform: 'spotify',
      type: spotUrlMatch[1] as MediaType,
      id: spotUrlMatch[2],
    };
  }

  // 2. Spotify URI
  const spotUriMatch = trimmed.match(SPOTIFY_URI_REGEX);
  if (spotUriMatch) {
    return {
      platform: 'spotify',
      type: spotUriMatch[1] as MediaType,
      id: spotUriMatch[2],
    };
  }

  // 3. YouTube / YouTube Music. Read query parameters in either order, since
  // share links often put tracking parameters before the video ID.
  const youtubeHost = /^(?:https?:\/\/)?(?:www\.)?(?:music\.)?youtube\.com\//i;
  if (youtubeHost.test(trimmed)) {
    const videoId = trimmed.match(/[?&]v=([A-Za-z0-9_-]{11})(?:[&#]|$)/)?.[1];
    if (videoId) {
      return { platform: 'youtube', type: 'track', id: videoId };
    }

    const playlistId = trimmed.match(/[?&]list=([A-Za-z0-9_-]+)(?:[&#]|$)/)?.[1];
    if (playlistId) {
      return { platform: 'youtube', type: 'playlist', id: playlistId };
    }
  }

  const youtuBeMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})(?:[?&#/]|$)/i
  );
  if (youtuBeMatch) {
    return { platform: 'youtube', type: 'track', id: youtuBeMatch[1] };
  }

  return null;
};

export const isValidSpotifyLink = (input: string): boolean => {
  return parseSpotifyLink(input) !== null;
};
