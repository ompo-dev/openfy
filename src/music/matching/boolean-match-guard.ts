/**
 * BooleanMatchGuard
 * Evaluates strict boolean constraints for candidate validation.
 * No fuzzy score can override a failed required boolean constraint.
 */

import { IdentityLock } from '../identity/identity-lock';
import { normalizeText } from '../identity/normalizer';

export interface MatchRequirements {
  title: boolean;
  artist: boolean;
  duration: boolean;
  version: boolean;
  sourceRelation: boolean;
}

export interface GuardDecision {
  passed: boolean;
  requirements: MatchRequirements;
  failedConstraints: string[];
  confidence: 'PROVEN' | 'VERY_HIGH' | 'HIGH' | 'UNCERTAIN' | 'REJECTED';
}

const FORBIDDEN_VERSION_WORDS = [
  'live',
  'concert',
  'ao vivo',
  'acoustic',
  'acustico',
  'unplugged',
  'remix',
  'rework',
  'sped up',
  'speed up',
  'nightcore',
  'slowed',
  'reverb',
  'cover',
  'tribute',
  'karaoke',
  'instrumental',
  '10 hour',
  '1 hour',
  'loop',
];

export class BooleanMatchGuard {
  private readonly maxDurationDiffMs: number;

  constructor(options: { maxDurationDiffMs?: number } = {}) {
    this.maxDurationDiffMs = options.maxDurationDiffMs ?? 3000;
  }

  /**
   * Evaluate a candidate against the locked canonical identity using absolute boolean gates
   */
  public evaluate(
    locked: IdentityLock,
    candidate: {
      title: string;
      artist?: string;
      author?: string;
      durationMs?: number;
      isrc?: string;
      isOfficialRelation?: boolean;
    }
  ): GuardDecision {
    const failedConstraints: string[] = [];
    const normTargetTitle = normalizeText(locked.title);
    const normCandTitle = normalizeText(candidate.title);
    const candTitleLower = (candidate.title || '').toLowerCase();
    const targetTitleLower = (locked.title || '').toLowerCase();

    // 1. Version Constraint: Must NOT contain forbidden tags if original track doesn't have them
    let versionPassed = true;
    for (const tag of FORBIDDEN_VERSION_WORDS) {
      if (candTitleLower.includes(tag) && !targetTitleLower.includes(tag)) {
        versionPassed = false;
        failedConstraints.push(`Version conflict: candidate contains '${tag}'`);
        break;
      }
    }

    // 2. Duration Constraint: Must be within tolerance (<= 3000ms) if target duration is known
    let durationPassed = true;
    let durationDiffMs = 0;
    if (locked.durationMs && locked.durationMs > 0 && candidate.durationMs && candidate.durationMs > 0) {
      durationDiffMs = Math.abs(locked.durationMs - candidate.durationMs);
      if (durationDiffMs > this.maxDurationDiffMs) {
        durationPassed = false;
        failedConstraints.push(`Duration mismatch: diff is ${durationDiffMs}ms (> ${this.maxDurationDiffMs}ms)`);
      }
    }

    // 3. Artist Constraint: Author/Artist or Title must match at least ONE of the locked canonical artists
    let artistPassed = false;
    const candAuthorNorm = normalizeText(candidate.author || candidate.artist || '');
    const lockedArtistsNorm = locked.artistNames.map(a => normalizeText(a));

    for (const artNorm of lockedArtistsNorm) {
      if (
        artNorm &&
        (candAuthorNorm.includes(artNorm) ||
          normCandTitle.includes(artNorm) ||
          candAuthorNorm.includes('topic') ||
          candAuthorNorm.includes('vevo'))
      ) {
        artistPassed = true;
        break;
      }
    }

    if (!artistPassed && lockedArtistsNorm.length > 0) {
      failedConstraints.push(`Artist mismatch: '${candAuthorNorm}' not recognized among canonical artists [${locked.artistNames.join(', ')}]`);
    }

    // 4. Title Constraint: Clean title match
    const titlePassed =
      normCandTitle.includes(normTargetTitle) ||
      normTargetTitle.includes(normCandTitle);

    if (!titlePassed) {
      failedConstraints.push(`Title mismatch: '${normCandTitle}' vs '${normTargetTitle}'`);
    }

    // 5. Source Relation Constraint (e.g. from Letras / MusicBrainz verified link or ISRC)
    const isrcMatch = Boolean(locked.isrc && candidate.isrc && locked.isrc === candidate.isrc);
    const sourceRelationPassed = Boolean(candidate.isOfficialRelation || isrcMatch);

    const requirements: MatchRequirements = {
      title: titlePassed,
      artist: artistPassed,
      duration: durationPassed,
      version: versionPassed,
      sourceRelation: sourceRelationPassed,
    };

    // Strict boolean gate: Title, Artist, Duration, and Version MUST ALL PASS!
    const mandatoryPassed = titlePassed && artistPassed && durationPassed && versionPassed;

    let confidence: 'PROVEN' | 'VERY_HIGH' | 'HIGH' | 'UNCERTAIN' | 'REJECTED' = 'REJECTED';

    if (mandatoryPassed) {
      if (sourceRelationPassed || (isrcMatch && durationDiffMs <= 1500)) {
        confidence = 'PROVEN';
      } else if (durationDiffMs <= 2000) {
        confidence = 'VERY_HIGH';
      } else {
        confidence = 'HIGH';
      }
    }

    return {
      passed: mandatoryPassed,
      requirements,
      failedConstraints,
      confidence,
    };
  }
}
