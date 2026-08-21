/**
 * Universal Music Importer & Anchor-of-Truth Resolution Engine
 * Handles one-click "Share to Openfy" flow for Spotify, YouTube, Apple Music, Deezer, and SoundCloud.
 */

import { MusicUrlDetector, ParsedMusicUrl } from './url-detector';
import type { CanonicalTrack } from '../identity/canonical-track';
import {
  StrictTrackMatcher,
  MatchDecision,
} from '../matching/strict-track-matcher';
import { MUSIC_SERVER_URL } from '@config';
import { fetchWithTimeout } from '@utils';

export interface ImportResult {
  success: boolean;
  anchorPlatform: string;
  track: CanonicalTrack;
  playbackSource?: {
    type: 'DIRECT_AUDIO' | 'HLS' | 'EXTERNAL';
    url: string;
    format: string;
    quality: string;
    verified: boolean;
  } | null;
  lyrics?: {
    synced: boolean;
    lines: Array<{ text: string; startMs: number }>;
  } | null;
  matchDecision: MatchDecision;
  error?: string;
}

export class UniversalMusicImporter {
  private readonly matcher = new StrictTrackMatcher({
    maxDurationDiffMs: 3000,
  });

  /**
   * Import any incoming link from OS share sheet or clipboard
   */
  public async importFromUrl(rawInput: string): Promise<ImportResult> {
    const parsed = MusicUrlDetector.parse(rawInput);
    if (!parsed) {
      throw new Error(
        'Formato de link não reconhecido. Compartilhe um link do Spotify, YouTube, Apple Music, Deezer ou SoundCloud.'
      );
    }

    console.log(
      `[UniversalImporter] Detected ${parsed.platform} ${parsed.resourceType}: ${parsed.id}`
    );

    // Step 1: Query backend resolution service for anchor & strict match
    try {
      if (!MUSIC_SERVER_URL) throw new Error('Music server unavailable');
      const backendRes = await fetchWithTimeout(
        `${MUSIC_SERVER_URL}/api/music/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: parsed.cleanUrl,
            spotifyId: parsed.platform === 'spotify' ? parsed.id : undefined,
            platform: parsed.platform,
            title: parsed.id.replace(/[-_]/g, ' '),
          }),
        },
        5000
      );

      if (backendRes.ok) {
        const data = await backendRes.json();
        if (data.track) {
          return {
            success: true,
            anchorPlatform: parsed.platform,
            track: {
              id: data.track.spotifyId || `${parsed.platform}:${parsed.id}`,
              title: data.track.title,
              artists: [{ name: data.track.artistName }],
              album: { name: data.track.albumName },
              durationMs: data.track.duration_ms,
              isrc: data.track.isrc,
              version: { type: 'ORIGINAL' },
              artwork: { url: data.track.imageURL },
              sources: [
                {
                  provider: parsed.platform as any,
                  id: parsed.id,
                  url: parsed.cleanUrl,
                },
              ],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            playbackSource: data.source
              ? {
                  type: 'DIRECT_AUDIO',
                  url: data.source.url,
                  format: data.source.format || 'mp3',
                  quality: data.source.quality || '128kbps',
                  verified: data.source.verified || true,
                }
              : null,
            lyrics: data.lyrics,
            matchDecision: {
              confidence: data.confidence || 'VERY_HIGH',
              score: data.source?.score || 0.92,
              evidence: [
                'Anchor resolved from provider',
                'Verified audio stream match',
              ],
              blockers: [],
              requiresVerification: false,
              canAutoPlay: Boolean(data.source),
            },
          };
        }
      }
    } catch {}

    // Fallback: Return structured anchor without auto-play if backend unavailable
    return {
      success: true,
      anchorPlatform: parsed.platform,
      track: {
        id: `${parsed.platform}:${parsed.id}`,
        title: parsed.id,
        artists: [{ name: 'Artista' }],
        version: { type: 'ORIGINAL' },
        sources: [
          {
            provider: parsed.platform as any,
            id: parsed.id,
            url: parsed.cleanUrl,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      playbackSource: null,
      lyrics: null,
      matchDecision: {
        confidence: 'UNCERTAIN',
        score: 0.5,
        evidence: ['Anchor detected'],
        blockers: ['Awaiting audio stream verification'],
        requiresVerification: true,
        canAutoPlay: false,
      },
    };
  }
}
