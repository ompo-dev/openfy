/**
 * ExactIdentifierGet - Direct Parametric Identifier Client
 *
 * Calls get(track_name, artist_name, duration) directly.
 * Cross-validates the response strictly against the Spotify target identity
 * before accepting. Never trusts HTTP 200 blindly.
 */

import { normalizeText } from '../identity/normalizer';
import type { TrackIdentity, TrackLyricsData } from '../identity/canonical-track-model';
import { fetchWithTimeout } from '@utils';

export interface ExactGetResult {
  valid: boolean;
  lyrics?: TrackLyricsData;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  durationSec?: number;
  rejectionReason?: string;
}

export class ExactIdentifierGet {
  /**
   * Execute parametric GET query with strict cross-validation against target identity
   */
  public async query(
    target: TrackIdentity,
    options: { albumName?: string } = {}
  ): Promise<ExactGetResult> {
    const primaryArtist = target.artists[0] || '';
    const durationSec = Math.round(target.durationMs / 1000);

    const queryParams = new URLSearchParams({
      track_name: target.title,
      artist_name: primaryArtist,
      ...(durationSec > 0 ? { duration: String(durationSec) } : {}),
      ...(options.albumName ? { album_name: options.albumName } : {}),
    });

    const endpoint = `https://lrclib.net/api/get?${queryParams.toString()}`;

    try {
      const res = await fetchWithTimeout(
        endpoint,
        {
          headers: { 'User-Agent': 'OpenfyMusic/1.0.0 ( contact@openfy.app )' },
        },
        4000
      );

      if (!res.ok) {
        return { valid: false, rejectionReason: `HTTP ${res.status} not found` };
      }

      const data = await res.json();

      // --- STRICT CROSS-VALIDATION AGAINST SPOTIFY ANCHOR ---
      const normTargetTitle = normalizeText(target.title);
      const normResolvedTitle = normalizeText(data.trackName || '');
      const titleMatch =
        normResolvedTitle.includes(normTargetTitle) ||
        normTargetTitle.includes(normResolvedTitle);

      if (!titleMatch) {
        return {
          valid: false,
          rejectionReason: `Title mismatch: target '${normTargetTitle}' vs resolved '${normResolvedTitle}'`,
        };
      }

      const normResolvedArtist = normalizeText(data.artistName || '');
      const artistMatch = target.artists.some((art) => {
        const normArt = normalizeText(art);
        return normResolvedArtist.includes(normArt) || normArt.includes(normResolvedArtist);
      });

      if (!artistMatch && target.artists.length > 0) {
        return {
          valid: false,
          rejectionReason: `Artist mismatch: target [${target.artists.join(', ')}] vs resolved '${data.artistName}'`,
        };
      }

      let durationMatch = true;
      if (target.durationMs > 0 && data.duration) {
        const diffMs = Math.abs(target.durationMs - data.duration * 1000);
        if (diffMs > 3500) {
          durationMatch = false;
          return {
            valid: false,
            rejectionReason: `Duration mismatch: ${diffMs}ms diff (> 3500ms)`,
          };
        }
      }

      // Parse synchronized lyrics lines
      let lyrics: TrackLyricsData | undefined;
      if (data.syncedLyrics) {
        const lines = data.syncedLyrics
          .split('\n')
          .filter(Boolean)
          .map((line: string) => {
            const m = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
            if (!m) return null;
            const startMs = (parseInt(m[1]) * 60 + parseFloat(m[2])) * 1000;
            return { text: m[3].trim(), startMs: Math.round(startMs) };
          })
          .filter(Boolean);

        lyrics = {
          synced: true,
          lines,
          source: 'lrclib_exact_get',
        };
      } else if (data.plainLyrics) {
        lyrics = {
          synced: false,
          lines: data.plainLyrics
            .split('\n')
            .map((text: string, i: number) => ({ text: text.trim(), startMs: i * 3000 })),
          source: 'lrclib_plain',
        };
      }

      return {
        valid: true,
        lyrics,
        trackName: data.trackName,
        artistName: data.artistName,
        albumName: data.albumName,
        durationSec: data.duration,
      };
    } catch (e: any) {
      return { valid: false, rejectionReason: e.message || 'Fetch error' };
    }
  }
}
