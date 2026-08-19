/**
 * StrictTrackMatcher - Provable Identity & Anti-Guessing Matching Engine
 *
 * Core Principle: "I don't know" (UNCERTAIN / NO_MATCH) > "Probably wrong".
 * Weak metadata evidence NEVER compensates for absence of proof.
 * Hard filters reject version mismatches and timing deviations > 3s before scoring.
 */

import type { CanonicalTrack, TrackVersionType } from '../identity/canonical-track';
import { normalizeText } from '../identity/normalizer';
import { normalizeISRC } from '../identity/identifiers';

export type IdentityConfidence =
  | 'PROVEN'
  | 'VERY_HIGH'
  | 'HIGH'
  | 'UNCERTAIN'
  | 'REJECTED';

export type RejectionReason =
  | 'DURATION_MISMATCH'
  | 'LIVE_VERSION'
  | 'ACOUSTIC_VERSION'
  | 'REMIX'
  | 'SPED_UP'
  | 'SLOWED'
  | 'COVER'
  | 'INSTRUMENTAL'
  | 'SNIPPET'
  | 'COMPILATION_OR_LOOP'
  | 'CRITICAL_IDENTITY_CONFLICT';

export interface Candidate {
  id?: string;
  title: string;
  artist?: string;
  author?: string;
  album?: string;
  durationMs?: number;
  isrc?: string;
  musicbrainzRecordingId?: string;
  provider?: string;
  url?: string;
  isOfficialTopicOrLabel?: boolean;
  viewCount?: number;
}

export interface MatchDecision {
  candidate?: Candidate;
  confidence: IdentityConfidence;
  score: number;
  evidence: string[];
  blockers: string[];
  requiresVerification: boolean;
  canAutoPlay: boolean;
}

const FORBIDDEN_VERSION_TAGS: Array<{ tag: string; reason: RejectionReason; type: TrackVersionType }> = [
  { tag: 'live', reason: 'LIVE_VERSION', type: 'LIVE' },
  { tag: 'concert', reason: 'LIVE_VERSION', type: 'LIVE' },
  { tag: 'ao vivo', reason: 'LIVE_VERSION', type: 'LIVE' },
  { tag: 'acoustic', reason: 'ACOUSTIC_VERSION', type: 'ACOUSTIC' },
  { tag: 'acustico', reason: 'ACOUSTIC_VERSION', type: 'ACOUSTIC' },
  { tag: 'unplugged', reason: 'ACOUSTIC_VERSION', type: 'ACOUSTIC' },
  { tag: 'remix', reason: 'REMIX', type: 'REMIX' },
  { tag: 'rework', reason: 'REMIX', type: 'REMIX' },
  { tag: 'sped up', reason: 'SPED_UP', type: 'SPED_UP' },
  { tag: 'speed up', reason: 'SPED_UP', type: 'SPED_UP' },
  { tag: 'nightcore', reason: 'SPED_UP', type: 'SPED_UP' },
  { tag: 'slowed', reason: 'SLOWED', type: 'SLOWED' },
  { tag: 'reverb', reason: 'SLOWED', type: 'SLOWED' },
  { tag: 'slowed+reverb', reason: 'SLOWED', type: 'SLOWED' },
  { tag: 'cover', reason: 'COVER', type: 'UNKNOWN' },
  { tag: 'tribute', reason: 'COVER', type: 'UNKNOWN' },
  { tag: 'karaoke', reason: 'COVER', type: 'UNKNOWN' },
  { tag: 'instrumental', reason: 'INSTRUMENTAL', type: 'INSTRUMENTAL' },
  { tag: '10 hour', reason: 'COMPILATION_OR_LOOP', type: 'UNKNOWN' },
  { tag: '1 hour', reason: 'COMPILATION_OR_LOOP', type: 'UNKNOWN' },
  { tag: 'loop', reason: 'COMPILATION_OR_LOOP', type: 'UNKNOWN' },
];

export class StrictTrackMatcher {
  private readonly maxDurationDiffMs: number;

  constructor(options: { maxDurationDiffMs?: number } = {}) {
    this.maxDurationDiffMs = options.maxDurationDiffMs ?? 3000; // 3.0s strict tolerance
  }

  /**
   * Stage 1: Hard Pre-Filters
   * Rejects immediately if candidate is a version mismatch, loop, snippet, or timing mismatch.
   */
  public checkHardRejection(
    target: { title: string; durationMs?: number; version?: { type: string } },
    candidate: Candidate
  ): RejectionReason | null {
    const cTitle = (candidate.title || '').toLowerCase();
    const tTitle = (target.title || '').toLowerCase();

    // 1. Snippet filter (< 45s)
    if (candidate.durationMs && candidate.durationMs < 45000) {
      return 'SNIPPET';
    }

    // 2. Strict duration proximity: must be <= 3.0s if target duration is known
    if (target.durationMs && target.durationMs > 0 && candidate.durationMs && candidate.durationMs > 0) {
      const diff = Math.abs(candidate.durationMs - target.durationMs);
      if (diff > this.maxDurationDiffMs) {
        return 'DURATION_MISMATCH';
      }
    }

    // 3. Version tag mismatch filter
    for (const entry of FORBIDDEN_VERSION_TAGS) {
      const candidateHasTag = cTitle.includes(entry.tag);
      const targetHasTag = tTitle.includes(entry.tag) || (target.version && target.version.type === entry.type);

      if (candidateHasTag && !targetHasTag) {
        return entry.reason;
      }
    }

    return null;
  }

  /**
   * Stage 2 & 3: Tiered Evidence Match
   */
  public evaluate(
    target: {
      title: string;
      artists: { name: string }[];
      durationMs?: number;
      isrc?: string;
      musicbrainzRecordingId?: string;
      album?: { name: string };
      version?: { type: string };
    },
    candidate: Candidate
  ): MatchDecision {
    const rejection = this.checkHardRejection(target, candidate);
    if (rejection) {
      return {
        candidate,
        confidence: 'REJECTED',
        score: 0,
        evidence: [],
        blockers: [`Hard rejected: ${rejection}`],
        requiresVerification: false,
        canAutoPlay: false,
      };
    }

    const evidence: string[] = [];
    const blockers: string[] = [];

    let hasLevel1Proof = false;
    let hasLevel2Strong = false;

    // --- LEVEL 1: PROOF (ISRC / Recording ID / Fingerprint) ---
    const targetISRC = normalizeISRC(target.isrc);
    const candidateISRC = normalizeISRC(candidate.isrc);

    if (targetISRC && candidateISRC) {
      if (targetISRC === candidateISRC) {
        evidence.push(`ISRC exact match: ${targetISRC}`);
        hasLevel1Proof = true;
      } else {
        blockers.push(`ISRC mismatch: target (${targetISRC}) vs candidate (${candidateISRC})`);
        return {
          candidate,
          confidence: 'REJECTED',
          score: 0,
          evidence,
          blockers,
          requiresVerification: false,
          canAutoPlay: false,
        };
      }
    } else {
      blockers.push('Missing ISRC verification');
    }

    if (target.musicbrainzRecordingId && candidate.musicbrainzRecordingId) {
      if (target.musicbrainzRecordingId === candidate.musicbrainzRecordingId) {
        evidence.push(`MusicBrainz Recording ID match: ${target.musicbrainzRecordingId}`);
        hasLevel1Proof = true;
      } else {
        blockers.push('MusicBrainz Recording ID mismatch');
      }
    }

    // --- LEVEL 2: STRONG EVIDENCE (Exact Timing, Official Uploader/Channel, Primary Artist) ---
    const targetArtistNorm = normalizeText(target.artists[0]?.name || '');
    const candAuthorNorm = normalizeText(candidate.author || candidate.artist || '');
    const candTitleNorm = normalizeText(candidate.title || '');
    const targetTitleNorm = normalizeText(target.title || '');

    let durationDiffMs = 0;
    if (target.durationMs && candidate.durationMs) {
      durationDiffMs = Math.abs(target.durationMs - candidate.durationMs);
      if (durationDiffMs <= 1000) {
        evidence.push(`Exact duration match (${durationDiffMs}ms diff)`);
        hasLevel2Strong = true;
      } else if (durationDiffMs <= 3000) {
        evidence.push(`Close duration match (${durationDiffMs}ms diff)`);
      }
    }

    const isOfficialChannel =
      targetArtistNorm &&
      (candAuthorNorm.includes(targetArtistNorm) ||
        candAuthorNorm.includes('vevo') ||
        candAuthorNorm.includes('topic') ||
        candAuthorNorm.includes('records') ||
        candidate.isOfficialTopicOrLabel === true);

    if (isOfficialChannel) {
      evidence.push(`Official artist/topic channel match: "${candidate.author || candidate.artist}"`);
      hasLevel2Strong = true;
    } else if (candAuthorNorm && targetArtistNorm && !candAuthorNorm.includes(targetArtistNorm)) {
      blockers.push(`Uploader is not official artist ("${candidate.author || candidate.artist}")`);
    }

    // --- LEVEL 3: WEAK EVIDENCE (Title Lexical similarity) ---
    const titleMatches =
      candTitleNorm.includes(targetTitleNorm) ||
      targetTitleNorm.includes(candTitleNorm);

    if (titleMatches) {
      evidence.push('Clean title lexical match');
    }

    // --- FINAL CONSERVATIVE DECISION ---
    if (hasLevel1Proof && durationDiffMs <= 2000) {
      return {
        candidate,
        confidence: 'PROVEN',
        score: 1.0,
        evidence,
        blockers: [],
        requiresVerification: false,
        canAutoPlay: true,
      };
    }

    if (hasLevel2Strong && titleMatches && durationDiffMs <= 3000 && isOfficialChannel) {
      return {
        candidate,
        confidence: 'VERY_HIGH',
        score: 0.92,
        evidence,
        blockers,
        requiresVerification: false,
        canAutoPlay: true,
      };
    }

    if (hasLevel2Strong && titleMatches && durationDiffMs <= 3000) {
      return {
        candidate,
        confidence: 'HIGH',
        score: 0.85,
        evidence,
        blockers,
        requiresVerification: true,
        canAutoPlay: false, // Do not auto-play without verification
      };
    }

    return {
      candidate,
      confidence: 'UNCERTAIN',
      score: 0.5,
      evidence,
      blockers,
      requiresVerification: true,
      canAutoPlay: false,
    };
  }

  /**
   * Match target track against candidate list and pick the single provable match
   */
  public match(
    target: {
      title: string;
      artists: { name: string }[];
      durationMs?: number;
      isrc?: string;
      musicbrainzRecordingId?: string;
      album?: { name: string };
      version?: { type: string };
    },
    candidates: Candidate[]
  ): MatchDecision {
    if (!candidates || candidates.length === 0) {
      return {
        confidence: 'REJECTED',
        score: 0,
        evidence: [],
        blockers: ['No candidates available'],
        requiresVerification: false,
        canAutoPlay: false,
      };
    }

    const decisions = candidates.map(c => this.evaluate(target, c));

    // Filter only candidates with confidence PROVEN or VERY_HIGH
    const valid = decisions.filter(
      d => d.confidence === 'PROVEN' || d.confidence === 'VERY_HIGH'
    );

    if (valid.length === 0) {
      return {
        confidence: 'UNCERTAIN',
        score: 0,
        evidence: decisions[0]?.evidence || [],
        blockers: [
          'No candidate met strict PROVEN or VERY_HIGH identity thresholds. Preferring NO_MATCH over wrong track.',
          ...(decisions[0]?.blockers || []),
        ],
        requiresVerification: true,
        canAutoPlay: false,
      };
    }

    // Sort by highest confidence and lowest duration difference
    valid.sort((a, b) => {
      if (a.confidence === 'PROVEN' && b.confidence !== 'PROVEN') return -1;
      if (b.confidence === 'PROVEN' && a.confidence !== 'PROVEN') return 1;
      return (b.score || 0) - (a.score || 0);
    });

    return valid[0];
  }
}
