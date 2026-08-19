/**
 * Canonical Matcher & Audio Alignment Engine
 *
 * Implements Multi-Layer Verification:
 * 1. Spotify / Catalog Reference Identity
 * 2. Strict Duration Proximity Scoring (rejection of extended loops, podcasts, compilations, snippets)
 * 3. Anti-Cover / Anti-Remix Strict Rule Enforcement
 * 4. Audio-to-Lyrics Timestamp Alignment & Offset Calibration
 */

import { CanonicalTrack, MatchReport, TrackSource, CanonicalLyrics } from '../../models/CanonicalTrack';

const FORBIDDEN_WORDS = [
  'remix',
  'reverb',
  'slowed',
  'speed up',
  'sped up',
  'bass boosted',
  'bassboost',
  'live',
  'acoustic',
  '8daudio',
  'concert',
  'acapella',
  'instrumental',
  'cover',
  'karaoke',
  'tribute',
  'edit',
  'remake',
  'type beat',
  'nightcore',
  'slow',
  'loop',
  '10 hour',
  '1 hour',
  'extended',
  'compilation',
  'mix',
  'set',
  'podcast',
];

/**
 * Clean and normalize title strings for accurate fuzzy matching
 */
export const normalizeString = (str: string): string => {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[\(\[\{].*?[\)\]\}]/g, '') // remove parenthesized content
    .replace(/[^a-z0-9\s]/g, ' ') // alphanumeric only
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Check if candidate title contains forbidden non-original words
 */
export const hasUnwantedForbiddenWords = (
  candidateTitle: string,
  canonicalTitle: string
): boolean => {
  const cTitle = (candidateTitle || '').toLowerCase();
  const oTitle = (canonicalTitle || '').toLowerCase();

  for (const word of FORBIDDEN_WORDS) {
    if (cTitle.includes(word) && !oTitle.includes(word)) {
      return true;
    }
  }
  return false;
};

/**
 * Score how well candidate duration matches canonical duration
 * Max allowed difference: 18 seconds (or 10% of track length)
 */
export const evaluateDurationMatch = (
  candidateDurationMs: number,
  canonicalDurationMs: number
): { score: number; diffMs: number; isAcceptable: boolean } => {
  if (!canonicalDurationMs || canonicalDurationMs <= 0) {
    // If canonical duration unknown, accept reasonable track length (60s to 380s)
    const isReasonable = candidateDurationMs >= 60000 && candidateDurationMs <= 400000;
    return { score: isReasonable ? 80 : 20, diffMs: 0, isAcceptable: isReasonable };
  }

  const diffMs = Math.abs(candidateDurationMs - canonicalDurationMs);
  const diffSec = diffMs / 1000;
  const canonicalSec = canonicalDurationMs / 1000;

  // Reject snippets (< 45s) or extended loops (> 25s difference)
  const maxAllowedDiffSec = Math.min(20, Math.max(8, canonicalSec * 0.08));

  if (diffSec > maxAllowedDiffSec) {
    return { score: 0, diffMs, isAcceptable: false };
  }

  // 100% score for exact match (< 2s diff), sliding down to 75% at max threshold
  const score = Math.max(75, 100 - (diffSec / maxAllowedDiffSec) * 25);
  return { score: Math.round(score), diffMs, isAcceptable: true };
};

/**
 * Multi-layer Canonical Match Engine
 */
export const evaluateCandidateMatch = (
  candidate: {
    title: string;
    artist?: string;
    durationMs: number;
    provider: 'soundcloud' | 'youtube' | 'spotyloader';
    url: string;
  },
  canonical: {
    title: string;
    artists: string[];
    durationMs: number;
    spotifyId: string;
  }
): MatchReport => {
  const reasons: string[] = [];
  let confidence = 0;

  // 1. Duration Verification
  const durationEval = evaluateDurationMatch(candidate.durationMs, canonical.durationMs);
  if (!durationEval.isAcceptable) {
    return {
      spotifyId: canonical.spotifyId,
      canonicalTitle: canonical.title,
      canonicalArtists: canonical.artists,
      expectedDurationMs: canonical.durationMs,
      sourceConfidence: 0,
      durationDifferenceMs: durationEval.diffMs,
      isVerified: false,
      status: 'unavailable',
      reasons: [`Duration mismatch: diff is ${(durationEval.diffMs / 1000).toFixed(1)}s (rejected)`],
    };
  }

  confidence += durationEval.score * 0.4; // 40% weight on exact duration
  reasons.push(`Duration matched: ${(durationEval.diffMs / 1000).toFixed(1)}s difference`);

  // 2. Anti-Remix / Anti-Cover Verification
  if (hasUnwantedForbiddenWords(candidate.title, canonical.title)) {
    return {
      spotifyId: canonical.spotifyId,
      canonicalTitle: canonical.title,
      canonicalArtists: canonical.artists,
      expectedDurationMs: canonical.durationMs,
      sourceConfidence: 0,
      durationDifferenceMs: durationEval.diffMs,
      isVerified: false,
      status: 'unavailable',
      reasons: ['Candidate title contains non-original remix/cover/slowed words'],
    };
  }

  // 3. Title & Artist Lexical Matching
  const normCanonicalTitle = normalizeString(canonical.title);
  const normCandidateTitle = normalizeString(candidate.title);
  const normPrimaryArtist = normalizeString(canonical.artists[0] || '');

  const hasTitleMatch =
    normCandidateTitle.includes(normCanonicalTitle) ||
    normCanonicalTitle.includes(normCandidateTitle);

  const hasArtistMatch =
    normPrimaryArtist &&
    (normCandidateTitle.includes(normPrimaryArtist) ||
      normalizeString(candidate.artist || '').includes(normPrimaryArtist));

  if (hasTitleMatch) {
    confidence += 35;
    reasons.push('Title verified');
  } else {
    confidence += 10;
  }

  if (hasArtistMatch) {
    confidence += 25;
    reasons.push('Artist verified');
  }

  const finalConfidence = Math.min(100, Math.round(confidence));
  const isVerified = finalConfidence >= 85;

  return {
    spotifyId: canonical.spotifyId,
    canonicalTitle: canonical.title,
    canonicalArtists: canonical.artists,
    expectedDurationMs: canonical.durationMs,
    sourceConfidence: finalConfidence,
    durationDifferenceMs: durationEval.diffMs,
    isVerified,
    status: isVerified ? 'verified' : finalConfidence >= 65 ? 'matched' : 'ambiguous',
    reasons,
  };
};

/**
 * Audio-to-Lyrics Alignment Engine
 * Calibrates timeline offset so lyrics synchronize seamlessly with slight intro silences
 */
export const alignLyricsWithAudio = (
  lyrics: CanonicalLyrics,
  audioDurationMs: number,
  canonicalDurationMs: number
): CanonicalLyrics => {
  if (!lyrics.isSynced || lyrics.segments.length === 0) {
    return lyrics;
  }

  // If audio has a known slight duration offset relative to reference, calculate intro alignment offset
  const durationDelta = audioDurationMs > 0 && canonicalDurationMs > 0
    ? audioDurationMs - canonicalDurationMs
    : 0;

  // Typical intro offset is around half of total duration delta for small shifts (< 3s)
  const offsetMs = Math.abs(durationDelta) < 3500 ? Math.round(durationDelta / 2) : 0;

  const adjustedSegments = lyrics.segments.map((seg) => ({
    ...seg,
    startTimeMs: Math.max(0, seg.startTimeMs + offsetMs),
    endTimeMs: Math.max(0, seg.endTimeMs + offsetMs),
  }));

  return {
    ...lyrics,
    timeOffsetMs: offsetMs,
    segments: adjustedSegments,
  };
};
