/**
 * Media Link Parser (Spotify & YouTube / YouTube Music)
 * Supports:
 * - https://open.spotify.com/track/ID
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
  /open\.spotify\.com\/(track|playlist|album)\/([A-Za-z0-9]+)/;

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

  // 3. YouTube / YouTube Music Playlists
  const ytPlaylistMatch = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (
    ytPlaylistMatch &&
    (trimmed.includes('youtube.com') || trimmed.includes('music.youtube.com'))
  ) {
    return {
      platform: 'youtube',
      type: 'playlist',
      id: ytPlaylistMatch[1],
    };
  }

  // 4. YouTube / YouTube Music Watch
  const ytWatchMatch = trimmed.match(
    /(?:music\.youtube\.com|youtube\.com)\/watch\?v=([a-zA-Z0-9_-]{11})/
  );
  if (ytWatchMatch) {
    return {
      platform: 'youtube',
      type: 'track',
      id: ytWatchMatch[1],
    };
  }

  // 5. youtu.be short link
  const youtuBeMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (youtuBeMatch) {
    return {
      platform: 'youtube',
      type: 'track',
      id: youtuBeMatch[1],
    };
  }

  return null;
};

export const isValidSpotifyLink = (input: string): boolean => {
  return parseSpotifyLink(input) !== null;
};
