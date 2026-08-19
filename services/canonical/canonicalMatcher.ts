/**
 * Canonical Matcher & Audio Alignment Engine
 *
 * Implements Multi-Layer Verification:
 * 1. Spotify / Catalog Reference Identity
 * 2. Strict Duration Proximity Scoring (rejection of extended loops, podcasts, compilations, snippets)
 * 3. Tiered Filtering: Hard Rejection for Sped Up/Slowed/Loops vs Soft Scoring for Official Edits
 * 4. Audio-to-Lyrics Timestamp Alignment & Offset Calibration
 */

import { CanonicalTrack, MatchReport, TrackSource, CanonicalLyrics } from '../../models/CanonicalTrack';

const HARD_REJECT_WORDS = [
  'slowed',
  'speed up',
  'sped up',
  'bass boosted',
  'bassboost',
  '8daudio',
  'nightcore',
  '10 hour',
  '1 hour',
  'extended',
  'compilation',
  'loop',
  'full album',
  'podcast',
  'snippet',
  'preview',
];

const SOFT_PENALTY_WORDS = [
  'remix',
  'edit',
  'cover',
  'live',
  'concert',
  'acoustic',
  'tiny desk',
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
 * Check if candidate title contains hard forbidden non-original words
 */
export const hasHardForbiddenWords = (
  candidateTitle: string,
  canonicalTitle: string
): boolean => {
  const cTitle = (candidateTitle || '').toLowerCase();
  const oTitle = (canonicalTitle || '').toLowerCase();

  for (const word of HARD_REJECT_WORDS) {
    if (cTitle.includes(word) && !oTitle.includes(word)) {
      return true;
    }
  }
  return false;
};

/**
 * Alias for backward compatibility
 */
export const hasUnwantedForbiddenWords = hasHardForbiddenWords;

/**
 * Score how well candidate duration matches canonical duration
 */
export const evaluateDurationMatch = (
  candidateDurationMs: number,
  canonicalDurationMs: number
): { score: number; diffMs: number; isAcceptable: boolean } => {
  const durSec = candidateDurationMs / 1000;

  // Reject hard snippets (< 45s) or long compilations (> 420s / 7 mins)
  if (durSec < 45 || durSec > 420) {
    return { score: 0, diffMs: Math.abs(candidateDurationMs - canonicalDurationMs), isAcceptable: false };
  }

  if (!canonicalDurationMs || canonicalDurationMs <= 0) {
    const isReasonable = durSec >= 60 && durSec <= 360;
    return { score: isReasonable ? 80 : 20, diffMs: 0, isAcceptable: isReasonable };
  }

  const diffMs = Math.abs(candidateDurationMs - canonicalDurationMs);
  const diffSec = diffMs / 1000;

  // If duration differs by more than 35 seconds from Spotify canonical duration, reject
  if (diffSec > 35) {
    return { score: 0, diffMs, isAcceptable: false };
  }

  const score = Math.max(50, 100 - diffSec * 1.5);
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
  const lowerCandTitle = (candidate.title || '').toLowerCase();
  const lowerCanonTitle = (canonical.title || '').toLowerCase();

  // 1. Hard Rejection (slowed, loops, compilations)
  if (hasHardForbiddenWords(candidate.title, canonical.title)) {
    return {
      spotifyId: canonical.spotifyId,
      canonicalTitle: canonical.title,
      canonicalArtists: canonical.artists,
      expectedDurationMs: canonical.durationMs,
      sourceConfidence: 0,
      durationDifferenceMs: 0,
      isVerified: false,
      status: 'unavailable',
      reasons: ['Candidate title contains hard-rejected word (slowed/loop/compilation)'],
    };
  }

  // 2. Duration Verification
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

  let confidence = durationEval.score * 0.5; // 50% baseline from exact duration proximity
  reasons.push(`Duration matched: ${(durationEval.diffMs / 1000).toFixed(1)}s difference`);

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
    confidence += 30;
    reasons.push('Title verified');
  }

  if (hasArtistMatch) {
    confidence += 20;
    reasons.push('Artist verified');
  }

  // Soft word penalty (covers, edits, remixes not present in original title)
  for (const w of SOFT_PENALTY_WORDS) {
    if (lowerCandTitle.includes(w) && !lowerCanonTitle.includes(w)) {
      confidence -= 18;
      reasons.push(`Soft penalty for "${w}"`);
    }
  }

  const finalConfidence = Math.min(100, Math.max(20, Math.round(confidence)));
  const isVerified = finalConfidence >= 75;

  return {
    spotifyId: canonical.spotifyId,
    canonicalTitle: canonical.title,
    canonicalArtists: canonical.artists,
    expectedDurationMs: canonical.durationMs,
    sourceConfidence: finalConfidence,
    durationDifferenceMs: durationEval.diffMs,
    isVerified,
    status: isVerified ? 'verified' : finalConfidence >= 50 ? 'matched' : 'ambiguous',
    reasons,
  };
};

/**
 * Audio-to-Lyrics Alignment Engine
 */
export const alignLyricsWithAudio = (
  lyrics: CanonicalLyrics,
  audioDurationMs: number,
  canonicalDurationMs: number
): CanonicalLyrics => {
  if (!lyrics.isSynced || lyrics.segments.length === 0) {
    return lyrics;
  }

  const durationDelta =
    audioDurationMs > 0 && canonicalDurationMs > 0
      ? audioDurationMs - canonicalDurationMs
      : 0;

  const offsetMs =
    Math.abs(durationDelta) < 3500 ? Math.round(durationDelta / 2) : 0;

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
