/**
 * Canonical Matcher & Audio Alignment Engine
 *
 * Implements Multi-Layer Verification:
 * 1. Official Artist Channel verification (VEVO, Topic, Artist Name, Official)
 * 2. High View / Play Count Popularity Weighting (favor millions of views over fan uploads)
 * 3. Strict Duration Proximity Scoring (timing must match the Spotify/catalog reference)
 * 4. Anti-Remix / Anti-Cover / Anti-Slowed / Anti-Loop Filtering
 * 5. Audio-to-Lyrics Timestamp Alignment & Offset Calibration
 */

import { CanonicalTrack, MatchReport, CanonicalLyrics } from '../../models/CanonicalTrack';

const HARD_REJECT_WORDS = [
  'slowed',
  'speed up',
  'sped up',
  'bass boosted',
  'bassboost',
  '8daudio',
  '8d audio',
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
  'instrumental',
  'karaoke',
];

/**
 * Clean and normalize title strings for accurate fuzzy matching
 */
export const normalizeString = (str: string): string => {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/(?<=\w)\.(?=\w)/g, '') // preserve initialisms such as A.R.T.
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

const isKnownArtist = (artist: string): boolean => {
  const normalized = normalizeString(artist);
  return (
    normalized.length > 0 &&
    normalized !== 'artista' &&
    normalized !== 'unknown artist' &&
    normalized !== 'unknown'
  );
};

export const hasCanonicalTitleMatch = (
  candidateTitle: string,
  canonicalTitle: string
): boolean => {
  const candidate = normalizeString(candidateTitle);
  const canonical = normalizeString(canonicalTitle);
  const escapedCanonical = canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hasUnexpectedContinuation =
    !!canonical &&
    new RegExp(`(?:^|\\s)${escapedCanonical}\\s+\\d+\\b`).test(candidate);

  if (!canonical || hasUnexpectedContinuation) return false;

  const candidateWords = candidate.split(' ');
  let candidateIndex = 0;
  return canonical.split(' ').every((word) => {
    const nextIndex = candidateWords.indexOf(word, candidateIndex);
    if (nextIndex < 0) return false;
    candidateIndex = nextIndex + 1;
    return true;
  });
};

/**
 * Detects a lyric provider returning a different numbered track under the
 * requested title. LRC timestamps are removed first, so timestamps never
 * masquerade as a title suffix.
 */
export const hasConflictingNumberedTitleInLyrics = (
  lyrics: string | undefined,
  canonicalTitle: string
): boolean => {
  const title = normalizeString(canonicalTitle);
  if (!title || !lyrics) return false;

  const text = normalizeString(
    lyrics.replace(/\[\d{1,2}:\d{2}(?:\.\d+)?\]/g, ' ')
  );
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escapedTitle}\\s+\\d+\\b`).test(text);
};

export const hasCanonicalArtistMatch = (
  candidateTitle: string,
  candidateArtist: string,
  canonicalArtist: string
): boolean => {
  if (!isKnownArtist(canonicalArtist)) return true;

  const artist = normalizeString(canonicalArtist);
  const sourceArtist = normalizeString(candidateArtist);
  const hasSourceArtist = isKnownArtist(candidateArtist);

  // A user upload can put the target artist in its title while belonging to a
  // different creator. When provider exposes a creator, that creator is the
  // identity signal; title-only matching is reserved for sources without one.
  if (hasSourceArtist) {
    return (
      sourceArtist.includes(artist) ||
      sourceArtist.replace(/\s/g, '').includes(artist.replace(/\s/g, ''))
    );
  }

  const candidateContext = normalizeString(candidateTitle);
  return (
    candidateContext.includes(artist) ||
    candidateContext.replace(/\s/g, '').includes(artist.replace(/\s/g, ''))
  );
};

/**
 * Score how well candidate duration matches canonical duration
 */
export const evaluateDurationMatch = (
  candidateDurationMs: number,
  canonicalDurationMs: number
): { score: number; diffMs: number; isAcceptable: boolean } => {
  const durSec = candidateDurationMs / 1000;

  // Reject hard snippets (< 45s)
  if (durSec < 45) {
    return { score: 0, diffMs: Math.abs(candidateDurationMs - canonicalDurationMs), isAcceptable: false };
  }

  if (canonicalDurationMs && canonicalDurationMs > 0) {
    const diffMs = Math.abs(candidateDurationMs - canonicalDurationMs);
    const diffSec = diffMs / 1000;

    // If duration differs by more than 40 seconds from canonical duration, reject
    if (diffSec > 40) {
      return { score: 0, diffMs, isAcceptable: false };
    }

    const score = Math.max(40, 100 - diffSec * 2);
    return { score: Math.round(score), diffMs, isAcceptable: true };
  }

  // Fallback when canonical duration is unknown: accept 60s to 1200s (up to 20 min cyphers)
  const isReasonable = durSec >= 60 && durSec <= 1200;
  return { score: isReasonable ? 80 : 20, diffMs: 0, isAcceptable: isReasonable };
};

/**
 * Multi-layer Canonical Match Engine with Channel & View Count Weighting
 */
export const evaluateCandidateMatch = (
  candidate: {
    title: string;
    artist?: string;
    durationMs: number;
    provider: 'soundcloud' | 'youtube' | 'spotyloader';
    url: string;
    viewCount?: number;
    playbackCount?: number;
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
  const candAuthor = normalizeString(candidate.artist || '');

  // 1. Hard Rejection (slowed, loops, compilations, snippets)
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

  const normPrimaryArtist = normalizeString(canonical.artists[0] || '');

  if (!hasCanonicalTitleMatch(candidate.title, canonical.title)) {
    return {
      spotifyId: canonical.spotifyId,
      canonicalTitle: canonical.title,
      canonicalArtists: canonical.artists,
      expectedDurationMs: canonical.durationMs,
      sourceConfidence: 0,
      durationDifferenceMs: 0,
      isVerified: false,
      status: 'unavailable',
      reasons: ['Candidate title does not match the canonical track'],
    };
  }

  if (
    !hasCanonicalArtistMatch(
      candidate.title,
      candidate.artist || '',
      canonical.artists[0] || ''
    )
  ) {
    return {
      spotifyId: canonical.spotifyId,
      canonicalTitle: canonical.title,
      canonicalArtists: canonical.artists,
      expectedDurationMs: canonical.durationMs,
      sourceConfidence: 0,
      durationDifferenceMs: 0,
      isVerified: false,
      status: 'unavailable',
      reasons: ['Candidate artist does not match the canonical artist'],
    };
  }

  // 2. Duration Verification (Timing proximity)
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

  let confidence = durationEval.score * 0.4; // 40% baseline from exact duration proximity
  reasons.push(`Duration matched: ${(durationEval.diffMs / 1000).toFixed(1)}s difference`);

  // 3. Official Artist Channel / Uploader Matching (+30 points)
  const isOfficialChannel =
    normPrimaryArtist &&
    (candAuthor.includes(normPrimaryArtist) ||
      candAuthor.includes('vevo') ||
      candAuthor.includes('topic') ||
      candAuthor.includes('records') ||
      candAuthor.includes('official'));

  if (isOfficialChannel) {
    confidence += 30;
    reasons.push('Official channel/uploader verified');
  }

  // 4. Title & artist are hard-verified above; both also raise confidence.
  confidence += 20;
  reasons.push('Title verified');
  if (isKnownArtist(canonical.artists[0] || '')) {
    confidence += 20;
    reasons.push('Artist verified');
  }

  // 5. Popularity / View Count Bonus (+10 points)
  const popularity = candidate.viewCount || candidate.playbackCount || 0;
  if (popularity > 50000) {
    confidence += 10;
    reasons.push(`High playcount verified (${popularity.toLocaleString()})`);
  }

  // 6. Soft Penalty for Remix/Cover/Edits
  for (const w of SOFT_PENALTY_WORDS) {
    if (lowerCandTitle.includes(w) && !lowerCanonTitle.includes(w)) {
      confidence -= 35;
      reasons.push(`Soft penalty for "${w}"`);
    }
  }

  const finalConfidence = Math.min(100, Math.max(10, Math.round(confidence)));
  const isVerified = finalConfidence >= 70;

  return {
    spotifyId: canonical.spotifyId,
    canonicalTitle: canonical.title,
    canonicalArtists: canonical.artists,
    expectedDurationMs: canonical.durationMs,
    sourceConfidence: finalConfidence,
    durationDifferenceMs: durationEval.diffMs,
    isVerified,
    status: isVerified ? 'verified' : finalConfidence >= 40 ? 'matched' : 'ambiguous',
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
