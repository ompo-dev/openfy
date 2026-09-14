import { evaluateCandidateMatch, hasCanonicalArtistMatch, normalizeString } from '../canonical/canonicalMatcher';

export type YouTubeCandidate = {
  videoId: string;
  title: string;
  artist: string;
  channelId?: string;
  durationMs: number;
  viewCount?: number;
  subscriberCount?: number;
  isVerifiedChannel?: boolean;
  isOfficialArtistChannel?: boolean;
  isLive?: boolean;
  isUpcoming?: boolean;
  imageURL?: string;
};

/** YouTube text counts, including localized compact forms. Missing is not zero. */
export const parseYouTubeCount = (value?: string | number): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : undefined;
  const text = value?.toLowerCase().replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u00a0]/g, '');
  if (!text) return undefined;
  const match = text.match(/([\d][\d.,\s]*)\s*(billion|million|thousand|bilh[oõ]es|bilh[aã]o|milh[oõ]es|milh[aã]o|mil|mi|[kmb])?\b/);
  if (!match) return undefined;
  const suffix = match[2] || '';
  const multiplier = /^(b|billion|bilh)/.test(suffix) ? 1e9 :
    /^(m$|mi$|million|milh)/.test(suffix) ? 1e6 : suffix ? 1e3 : 1;
  const digits = match[1].replace(/\s/g, '');
  const number = Number(multiplier === 1 ? digits.replace(/[.,]/g, '') : digits.replace(',', '.'));
  return Number.isFinite(number) ? Math.round(number * multiplier) : undefined;
};

export const rankYouTubeCandidate = (
  candidate: YouTubeCandidate,
  canonical: { title: string; artists: string[]; durationMs: number; spotifyId: string }
) => {
  const match = evaluateCandidateMatch({
    ...candidate, provider: 'youtube', url: `https://www.youtube.com/watch?v=${candidate.videoId}`,
  }, canonical);
  const fanChannel = /\b(fan|fans|fandom|unofficial|reuploads?)\b/.test(normalizeString(candidate.artist));
  // Audience only breaks ties among tracks that already pass identity and timing.
  const authority = candidate.isOfficialArtistChannel ? 32 : candidate.isVerifiedChannel ? 20 : 0;
  const audience = Math.min(6, Math.log10(1 + (candidate.subscriberCount || 0))) +
    Math.min(5, Math.log10(1 + (candidate.viewCount || 0)) * 0.7);
  const artistName = hasCanonicalArtistMatch('', candidate.artist, canonical.artists) ? 4 : 0;
  const durationPenalty = Math.min(20, match.durationDifferenceMs / 1000);
  const eligible = match.isVerified && !candidate.isLive && !candidate.isUpcoming && !fanChannel;
  return {
    candidate,
    match,
    eligible,
    rank: match.sourceConfidence + authority + audience + artistName - durationPenalty,
    authority,
    audience,
  };
};
