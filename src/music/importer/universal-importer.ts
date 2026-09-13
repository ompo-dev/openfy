/**
 * Universal Music Importer & Anchor-of-Truth Resolution Engine
 * Handles one-click "Share to Openfy" flow for Spotify, YouTube, Apple Music, Deezer, and SoundCloud.
 */

import { MusicUrlDetector } from './url-detector';
import type { CanonicalTrack } from '../identity/canonical-track';
import { MatchDecision } from '../matching/strict-track-matcher';

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
    lines: { text: string; startMs: number }[];
  } | null;
  matchDecision: MatchDecision;
  error?: string;
}

export class UniversalMusicImporter {
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
        evidence: ['Anchor detected on device'],
        blockers: ['Awaiting local audio stream verification'],
        requiresVerification: true,
        canAutoPlay: false,
      },
    };
  }
}
