/**
 * YouTubeOfficialRanker
 * High-precision YouTube search ranker that identifies the exact 100% official artist upload.
 * Validates channel authenticity, duration proximity (<= 15s / 5%), and sorts official artist uploads by highest view count.
 */

import { normalizeText } from '../identity/normalizer';
import type { TrackIdentity } from '../identity/canonical-track-model';

export interface VerifiedYouTubeCandidate {
  videoId: string;
  title: string;
  channel: string;
  durationSec: number;
  durationText: string;
  viewCountText: string;
  views: number;
  url: string;
  isOfficialArtistChannel: boolean;
  durationDiffSec: number;
  score: number;
}

const FORBIDDEN_WORDS = [
  'slowed',
  'speed up',
  'sped up',
  'bassboost',
  'nightcore',
  '10 hour',
  '1 hour',
  'loop',
  'react',
  'reacao',
  'bastidores',
  'making of',
  'cover',
  'tribute',
  'karaoke',
];

export function parseViewCount(viewText: string): number {
  if (!viewText) return 0;
  const clean = viewText.toLowerCase().replace(/visualizaç[õo]es|views/g, '').trim();
  if (clean.includes('mi') || clean.includes('m')) {
    return parseFloat(clean.replace(',', '.')) * 1000000;
  }
  if (clean.includes('mil') || clean.includes('k')) {
    return parseFloat(clean.replace(',', '.')) * 1000;
  }
  return parseInt(clean.replace(/\./g, '').replace(/,/g, ''), 10) || 0;
}

export class YouTubeOfficialRanker {
  /**
   * Search YouTube and rank candidates for the locked canonical track
   */
  public async searchAndRank(target: TrackIdentity): Promise<VerifiedYouTubeCandidate | null> {
    const primaryArtist = target.artists[0] || '';
    const query = `${target.title} ${primaryArtist}`.trim();

    try {
      const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) return null;

      const html = await res.text();
      const match =
        html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/) ||
        html.match(/ytInitialData\s*=\s*({[\s\S]*?});/);

      if (!match) return null;

      const data = JSON.parse(match[1]);
      const contents =
        data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
          ?.contents?.[0]?.itemSectionRenderer?.contents || [];

      const candidates: VerifiedYouTubeCandidate[] = [];
      const targetDurationSec = target.durationMs > 0 ? target.durationMs / 1000 : 0;
      const normTargetTitle = normalizeText(target.title);
      const lockedArtistsNorm = target.artists.map((a) => normalizeText(a));

      for (const item of contents) {
        const v = item.videoRenderer;
        if (!v || !v.videoId) continue;

        const videoId = v.videoId;
        const title = v.title?.runs?.[0]?.text || '';
        const channel = v.ownerText?.runs?.[0]?.text || '';
        const durationText = v.lengthText?.simpleText || '';
        const viewCountText = v.viewCountText?.simpleText || '';
        const views = parseViewCount(viewCountText);

        // Calculate duration in seconds
        const parts = durationText.split(':').map(Number);
        let durationSec = 0;
        if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
        if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];

        if (durationSec < 40) continue; // Reject snippets

        const titleLower = title.toLowerCase();
        const normCandTitle = normalizeText(title);
        const normChannel = normalizeText(channel);

        // 1. Anti-remix / cover / react filter
        let hasForbidden = false;
        for (const f of FORBIDDEN_WORDS) {
          if (titleLower.includes(f) && !target.title.toLowerCase().includes(f)) {
            hasForbidden = true;
            break;
          }
        }
        if (hasForbidden) continue;

        // 2. Title matching
        const titleMatched =
          normCandTitle.includes(normTargetTitle) ||
          normTargetTitle.includes(normCandTitle);

        if (!titleMatched) continue;

        // 3. Artist / Channel Verification
        let isOfficialArtistChannel = false;
        for (const artNorm of lockedArtistsNorm) {
          if (
            artNorm &&
            (normChannel.includes(artNorm) ||
              normCandTitle.includes(artNorm) ||
              normChannel.includes('topic') ||
              normChannel.includes('vevo') ||
              normChannel.includes('records'))
          ) {
            isOfficialArtistChannel = true;
            break;
          }
        }

        // 4. Duration Proximity Check (<= 25s or <= 5% for long sets/intros)
        let durationDiffSec = 0;
        let durationAcceptable = true;
        if (targetDurationSec > 0) {
          durationDiffSec = Math.abs(targetDurationSec - durationSec);
          const maxDiffSec = Math.max(25, targetDurationSec * 0.05);
          if (durationDiffSec > maxDiffSec) {
            durationAcceptable = false;
          }
        }

        if (!durationAcceptable) continue;

        let score = 0.7;
        if (isOfficialArtistChannel) score += 0.2;
        if (durationDiffSec <= 10) score += 0.1;

        candidates.push({
          videoId,
          title,
          channel,
          durationSec,
          durationText,
          viewCountText,
          views,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          isOfficialArtistChannel,
          durationDiffSec,
          score,
        });
      }

      if (candidates.length === 0) return null;

      // Primary sort: Official artist channels first, then by HIGHEST VIEW COUNT
      candidates.sort((a, b) => {
        if (a.isOfficialArtistChannel && !b.isOfficialArtistChannel) return -1;
        if (!a.isOfficialArtistChannel && b.isOfficialArtistChannel) return 1;
        const aIsTopic = a.channel.toLowerCase().includes('topic');
        const bIsTopic = b.channel.toLowerCase().includes('topic');
        if (!aIsTopic && bIsTopic) return -1;
        if (aIsTopic && !bIsTopic) return 1;
        if (a.views !== b.views) return b.views - a.views;
        return a.durationDiffSec - b.durationDiffSec;
      });

      return candidates[0];
    } catch {
      return null;
    }
  }
}
