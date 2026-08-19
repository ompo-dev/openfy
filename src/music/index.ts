/**
 * Openfy Canonical Music Architecture
 * Multi-layer Identity, Verification, Fingerprinting, Metadata, Lyrics and Audio Resolution
 */

import type { CanonicalTrack } from './identity/canonical-track';
import { CandidateResolver, CandidateRepository } from './matching/candidate-resolver';
import { MatchEngine, MatchResult } from './matching/match-engine';
import { AudioResolver, AudioProvider } from './audio/resolver';
import { LyricsResolver, LyricsProvider } from './lyrics/resolver';

export * from './identity/canonical-track';
export * from './identity/identifiers';
export * from './identity/normalizer';
export * from './identity/identity-lock';
export * from './identity/canonical-track-model';
export * from './matching/duration-matcher';
export * from './matching/version-matcher';
export * from './matching/match-engine';
export * from './matching/strict-track-matcher';
export * from './matching/boolean-match-guard';
export * from './matching/candidate-resolver';
export * from './fingerprint/types';
export * from './fingerprint/chromaprint';
export * from './fingerprint/acoustid';
export * from './metadata/provider';
export * from './metadata/spotify';
export * from './metadata/musicbrainz';
export * from './lyrics/types';
export * from './lyrics/resolver';
export * from './lyrics/synchronizer';
export * from './audio/types';
export * from './audio/resolver';
export * from './importer/url-detector';
export * from './importer/universal-importer';
export * from './discovery/entity-page-resolver';
export * from './resolver/exact-identifier-get';

export class MusicResolutionService {
  constructor(
    private readonly candidates: CandidateResolver,
    private readonly matcher: MatchEngine,
    private readonly audio: AudioResolver,
    private readonly lyrics: LyricsResolver
  ) {}

  async resolve(input: CanonicalTrack) {
    // 1. Candidate resolution
    const candidates = await this.candidates.resolve(input);

    // 2. Identity determination
    const match = await this.matcher.match(input, candidates);

    // If ambiguous or no match, prefer safety over wrong music
    if (
      !match.candidate ||
      (match.status !== 'EXACT' && match.status !== 'HIGH_CONFIDENCE')
    ) {
      return {
        match,
        audio: null,
        lyrics: null,
      };
    }

    const track = match.candidate;

    // 3. Audio stream resolution
    const audio = await this.audio.resolve(track);

    // 4. Synchronized lyrics resolution
    const primaryArtist = track.artists[0]?.name;
    const lyrics = primaryArtist
      ? await this.lyrics.resolve({
          title: track.title,
          artist: primaryArtist,
          album: track.album?.name,
          isrc: track.isrc,
        })
      : null;

    return {
      match,
      track,
      audio,
      lyrics,
    };
  }
}
