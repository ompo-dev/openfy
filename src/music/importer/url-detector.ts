/**
 * Universal Music URL Detector
 * Identifies and classifies incoming shared links from Spotify, YouTube, YouTube Music, Apple Music, SoundCloud, and Deezer.
 */

export type SupportedPlatform =
  | 'spotify'
  | 'youtube'
  | 'youtube_music'
  | 'apple_music'
  | 'soundcloud'
  | 'deezer'
  | 'unknown';

export type ResourceType = 'track' | 'album' | 'playlist' | 'artist' | 'unknown';

export interface ParsedMusicUrl {
  platform: SupportedPlatform;
  resourceType: ResourceType;
  id: string;
  rawUrl: string;
  cleanUrl: string;
}

export class MusicUrlDetector {
  /**
   * Extract the first valid URL from arbitrary text (e.g. from share intent or clipboard)
   */
  public static extractUrl(text: string): string | null {
    if (!text) return null;
    const match = text.match(/https?:\/\/[^\s]+/i);
    return match ? match[0] : null;
  }

  /**
   * Detect platform and resource type from a URL string
   */
  public static parse(input: string): ParsedMusicUrl | null {
    const raw = (this.extractUrl(input) || input).trim();
    if (!raw) return null;

    try {
      const parsed = new URL(raw.startsWith('spotify:') ? `https://open.spotify.com/${raw.replace('spotify:', '').replace(':', '/')}` : raw);
      const host = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname;

      // 1. Spotify
      if (host.includes('spotify.com')) {
        const parts = pathname.split('/').filter(Boolean);
        const type = parts[0] as ResourceType;
        const id = parts[1]?.split('?')[0] || '';
        return {
          platform: 'spotify',
          resourceType: ['track', 'album', 'playlist', 'artist'].includes(type) ? type : 'track',
          id,
          rawUrl: raw,
          cleanUrl: `https://open.spotify.com/${type}/${id}`,
        };
      }

      // 2. YouTube Music
      if (host.includes('music.youtube.com')) {
        const v = parsed.searchParams.get('v');
        const list = parsed.searchParams.get('list');
        if (list) {
          return { platform: 'youtube_music', resourceType: 'playlist', id: list, rawUrl: raw, cleanUrl: raw };
        }
        if (v) {
          return { platform: 'youtube_music', resourceType: 'track', id: v, rawUrl: raw, cleanUrl: `https://music.youtube.com/watch?v=${v}` };
        }
      }

      // 3. YouTube Standard / Shorts
      if (host.includes('youtube.com') || host.includes('youtu.be')) {
        let videoId = parsed.searchParams.get('v');
        const list = parsed.searchParams.get('list');

        if (host.includes('youtu.be')) {
          videoId = pathname.slice(1).split('?')[0];
        } else if (pathname.includes('/shorts/')) {
          videoId = pathname.split('/shorts/')[1]?.split('?')[0];
        }

        if (list && !videoId) {
          return { platform: 'youtube', resourceType: 'playlist', id: list, rawUrl: raw, cleanUrl: raw };
        }
        if (videoId) {
          return { platform: 'youtube', resourceType: 'track', id: videoId, rawUrl: raw, cleanUrl: `https://www.youtube.com/watch?v=${videoId}` };
        }
      }

      // 4. Deezer
      if (host.includes('deezer.com')) {
        const parts = pathname.split('/').filter(Boolean);
        const type = parts[0] as ResourceType;
        const id = parts[1] || '';
        return {
          platform: 'deezer',
          resourceType: ['track', 'album', 'playlist'].includes(type) ? type : 'track',
          id,
          rawUrl: raw,
          cleanUrl: `https://www.deezer.com/${type}/${id}`,
        };
      }

      // 5. Apple Music
      if (host.includes('music.apple.com')) {
        const iParam = parsed.searchParams.get('i');
        const parts = pathname.split('/').filter(Boolean);
        const id = iParam || parts.pop() || '';
        const isAlbum = pathname.includes('/album/');
        const isPlaylist = pathname.includes('/playlist/');
        return {
          platform: 'apple_music',
          resourceType: iParam ? 'track' : isAlbum ? 'album' : isPlaylist ? 'playlist' : 'track',
          id,
          rawUrl: raw,
          cleanUrl: raw,
        };
      }

      // 6. SoundCloud
      if (host.includes('soundcloud.com')) {
        return {
          platform: 'soundcloud',
          resourceType: pathname.includes('/sets/') ? 'playlist' : 'track',
          id: pathname.replace(/^\//, ''),
          rawUrl: raw,
          cleanUrl: raw,
        };
      }
    } catch {}

    return null;
  }
}
