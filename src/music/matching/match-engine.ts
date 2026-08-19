import type {
  CanonicalTrack,
} from '../identity/canonical-track';

import {
  normalizeText,
  normalizeTrack,
} from '../identity/normalizer';

import {
  normalizeISRC,
} from '../identity/identifiers';

import {
  matchDuration,
} from './duration-matcher';

import {
  compareVersions,
  detectVersion,
} from './version-matcher';

export type MatchStatus =
  | 'EXACT'
  | 'HIGH_CONFIDENCE'
  | 'AMBIGUOUS'
  | 'NO_MATCH';

export type EvidenceType =
  | 'ISRC'
  | 'RECORDING_ID'
  | 'PROVIDER_ID'
  | 'TITLE'
  | 'ARTIST'
  | 'ALBUM'
  | 'DURATION'
  | 'VERSION'
  | 'FINGERPRINT';

export interface Evidence {
  type: EvidenceType;
  score: number;
  weight: number;
  exact: boolean;
  reason: string;
}

export interface CandidateResult {
  track: CanonicalTrack;
  score: number;
  evidences: Evidence[];
  conflicts: string[];
}

export interface MatchResult {
  status: MatchStatus;
  score: number;
  candidate?: CanonicalTrack;
  candidates: CandidateResult[];
  reason: string;
}

export interface FingerprintMatcher {
  compare(
    input: unknown,
    candidate: unknown
  ): Promise<number>;
}

function similarity(
  a: string,
  b: string
): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const aa = a.split(' ').filter(Boolean);
  const bb = new Set(b.split(' ').filter(Boolean));

  const intersection = aa.filter(token => bb.has(token)).length;
  const union = new Set([...aa, ...bb]).size;
  const jaccard = union === 0 ? 0 : intersection / union;

  const max = Math.max(a.length, b.length);
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let current = i;
    for (let j = 1; j <= b.length; j++) {
      const value = Math.min(
        previous[j] + 1,
        current + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      previous[j - 1] = current;
      current = value;
    }
    previous[b.length] = current;
  }

  const distance = previous[b.length];
  const levenshtein = 1 - distance / max;

  return levenshtein * 0.65 + jaccard * 0.35;
}

function artistSimilarity(
  a: string[],
  b: string[]
): number {
  if (!a.length || !b.length) {
    return 0;
  }

  const scores = a.map(artistA => {
    return Math.max(
      ...b.map(artistB => similarity(artistA, artistB))
    );
  });

  return (
    scores.reduce((sum, value) => sum + value, 0) / scores.length
  );
}

export class MatchEngine {
  constructor(
    private readonly options: {
      fingerprintMatcher?: FingerprintMatcher;
      exactThreshold?: number;
      highConfidenceThreshold?: number;
      ambiguityMargin?: number;
    } = {}
  ) {}

  async match(
    input: CanonicalTrack,
    candidates: CanonicalTrack[]
  ): Promise<MatchResult> {
    if (!candidates.length) {
      return {
        status: 'NO_MATCH',
        score: 0,
        candidates: [],
        reason: 'No candidates found.',
      };
    }

    const results = await Promise.all(
      candidates.map(candidate => this.evaluate(input, candidate))
    );

    results.sort((a, b) => b.score - a.score);

    const best = results[0];
    const second = results[1];

    if (!best) {
      return {
        status: 'NO_MATCH',
        score: 0,
        candidates: [],
        reason: 'No valid candidate.',
      };
    }

    const ambiguityMargin = this.options.ambiguityMargin ?? 0.04;

    if (second && best.score - second.score < ambiguityMargin) {
      return {
        status: 'AMBIGUOUS',
        score: best.score,
        candidates: results,
        reason: 'Two or more candidates are too similar.',
      };
    }

    const criticalConflict = best.conflicts.some(
      conflict =>
        conflict === 'ISRC_MISMATCH' || conflict === 'RECORDING_ID_MISMATCH'
    );

    if (criticalConflict) {
      return {
        status: 'AMBIGUOUS',
        score: best.score,
        candidates: results,
        reason: 'Critical identity conflict.',
      };
    }

    const exactThreshold = this.options.exactThreshold ?? 0.96;
    const highThreshold = this.options.highConfidenceThreshold ?? 0.88;

    if (best.score >= exactThreshold && this.isExact(best)) {
      return {
        status: 'EXACT',
        score: best.score,
        candidate: best.track,
        candidates: results,
        reason: 'Exact identity verified.',
      };
    }

    if (best.score >= highThreshold) {
      return {
        status: 'HIGH_CONFIDENCE',
        score: best.score,
        candidate: best.track,
        candidates: results,
        reason: 'High confidence match.',
      };
    }

    return {
      status: 'NO_MATCH',
      score: best.score,
      candidates: results,
      reason: 'Insufficient evidence.',
    };
  }

  private async evaluate(
    input: CanonicalTrack,
    candidate: CanonicalTrack
  ): Promise<CandidateResult> {
    const a = normalizeTrack(input);
    const b = normalizeTrack(candidate);

    const evidences: Evidence[] = [];
    const conflicts: string[] = [];

    /*
     * ISRC
     */
    const inputISRC = normalizeISRC(a.isrc);
    const candidateISRC = normalizeISRC(b.isrc);

    if (inputISRC && candidateISRC) {
      const exact = inputISRC === candidateISRC;
      evidences.push({
        type: 'ISRC',
        score: exact ? 1 : 0,
        weight: 100,
        exact,
        reason: exact ? 'ISRC exact.' : 'ISRC mismatch.',
      });

      if (!exact) {
        conflicts.push('ISRC_MISMATCH');
      }
    }

    /*
     * MusicBrainz recording
     */
    if (a.musicbrainzRecordingId && b.musicbrainzRecordingId) {
      const exact = a.musicbrainzRecordingId === b.musicbrainzRecordingId;
      evidences.push({
        type: 'RECORDING_ID',
        score: exact ? 1 : 0,
        weight: 95,
        exact,
        reason: exact ? 'Recording ID exact.' : 'Recording ID mismatch.',
      });

      if (!exact) {
        conflicts.push('RECORDING_ID_MISMATCH');
      }
    }

    /*
     * Title
     */
    const titleScore = similarity(a.title, b.title);
    evidences.push({
      type: 'TITLE',
      score: titleScore,
      weight: 20,
      exact: titleScore === 1,
      reason: `Title: ${titleScore.toFixed(3)}`,
    });

    /*
     * Artist
     */
    const artistScore = artistSimilarity(a.artists, b.artists);
    evidences.push({
      type: 'ARTIST',
      score: artistScore,
      weight: 30,
      exact: artistScore === 1,
      reason: `Artist: ${artistScore.toFixed(3)}`,
    });

    /*
     * Album
     */
    if (a.album && b.album) {
      const albumScore = similarity(a.album, b.album);
      evidences.push({
        type: 'ALBUM',
        score: albumScore,
        weight: 10,
        exact: albumScore === 1,
        reason: `Album: ${albumScore.toFixed(3)}`,
      });
    }

    /*
     * Duration
     */
    const duration = matchDuration(a.durationMs, b.durationMs);
    evidences.push({
      type: 'DURATION',
      score: duration.score,
      weight: 20,
      exact: duration.exact,
      reason: `Duration difference: ${duration.differenceMs ?? 'unknown'}ms`,
    });

    /*
     * Version
     */
    const versionA = a.version ?? detectVersion(input.title);
    const versionB = b.version ?? detectVersion(candidate.title);
    const versionScore = compareVersions(versionA, versionB);

    evidences.push({
      type: 'VERSION',
      score: versionScore,
      weight: 30,
      exact: versionScore === 1,
      reason: `Version: ${versionA.type} / ${versionB.type}`,
    });

    if (versionScore === 0) {
      conflicts.push('VERSION_MISMATCH');
    }

    /*
     * Fingerprint
     */
    if (this.options.fingerprintMatcher) {
      const inputFingerprint = (input as any).fingerprint;
      const candidateFingerprint = (candidate as any).fingerprint;

      if (inputFingerprint && candidateFingerprint) {
        const score = await this.options.fingerprintMatcher.compare(
          inputFingerprint,
          candidateFingerprint
        );

        evidences.push({
          type: 'FINGERPRINT',
          score,
          weight: 120,
          exact: score === 1,
          reason: `Fingerprint: ${score.toFixed(3)}`,
        });
      }
    }

    const score = this.calculateScore(evidences);

    return {
      track: candidate,
      score,
      evidences,
      conflicts,
    };
  }

  private calculateScore(evidences: Evidence[]): number {
    if (
      evidences.some(
        evidence =>
          (evidence.type === 'ISRC' || evidence.type === 'RECORDING_ID') &&
          !evidence.exact
      )
    ) {
      return 0;
    }

    let total = 0;
    let weight = 0;

    for (const evidence of evidences) {
      total += evidence.score * evidence.weight;
      weight += evidence.weight;
    }

    return weight ? total / weight : 0;
  }

  private isExact(result: CandidateResult): boolean {
    const strongIdentity = result.evidences.some(
      evidence =>
        (evidence.type === 'ISRC' ||
          evidence.type === 'RECORDING_ID' ||
          evidence.type === 'FINGERPRINT') &&
        evidence.exact
    );

    const metadata = result.evidences
      .filter(
        evidence =>
          evidence.type === 'TITLE' ||
          evidence.type === 'ARTIST' ||
          evidence.type === 'DURATION'
      )
      .every(evidence => evidence.score >= 0.95);

    return strongIdentity && metadata && result.conflicts.length === 0;
  }
}
