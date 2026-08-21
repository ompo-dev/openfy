/**
 * EntityPageResolver
 * Discovers structured musical entity pages (Letras.mus.br, MusicBrainz, Deezer)
 * and extracts pre-bound official YouTube IDs and synchronized lyrics directly,
 * eliminating the need for blind, noisy multi-platform fuzzy searching.
 */

import { fetchWithTimeout } from '@utils';

export interface DiscoveredEntity {
  source: 'letras' | 'musicbrainz' | 'deezer';
  pageUrl: string;
  youtubeId?: string;
  title: string;
  artist: string;
  lyricsText?: string;
  hasSyncedLyrics?: boolean;
}

export class EntityPageResolver {
  private slugify(text: string): string {
    return (text || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[()[\]{}]/g, ' ')
      .replace(/['"`]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  /**
   * Resolve structured song entity from Letras.mus.br
   */
  public async resolveLetrasEntity(artist: string, track: string): Promise<DiscoveredEntity | null> {
    const slugA = this.slugify(artist);
    const cleanTrack = track
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/feat\..*$/i, '')
      .trim();
    const slugT = this.slugify(cleanTrack);

    const candidateUrls = [
      `https://www.letras.mus.br/${slugA}/${slugT}/`,
      `https://www.letras.mus.br/${slugA}/${this.slugify(track)}/`,
    ];

    for (const pageUrl of candidateUrls) {
      try {
        const res = await fetchWithTimeout(pageUrl, {}, 3500);
        if (res.ok) {
          const html = await res.text();
          const ytMatch =
            html.match(/"YoutubeID":"([a-zA-Z0-9_-]{11})"/i) ||
            html.match(/"video":"([a-zA-Z0-9_-]{11})"/i);

          const nameMatch = html.match(/"Name":"([^"]+)"/i);
          const artistMatch = html.match(/"Artist":"([^"]+)"/i);

          if (ytMatch?.[1]) {
            return {
              source: 'letras',
              pageUrl,
              youtubeId: ytMatch[1],
              title: nameMatch?.[1] || track,
              artist: artistMatch?.[1] || artist,
            };
          }
        }
      } catch {}
    }

    return null;
  }
}
