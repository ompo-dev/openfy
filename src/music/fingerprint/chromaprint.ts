import type {
  AudioFingerprint,
  FingerprintMatch,
} from './types';

export interface ChromaprintEngine {
  generate(
    audioPath: string
  ): Promise<AudioFingerprint>;

  compare(
    a: AudioFingerprint,
    b: AudioFingerprint
  ): Promise<FingerprintMatch>;
}

export class ChromaprintAdapter
  implements ChromaprintEngine
{
  constructor(
    private readonly executable = 'fpcalc'
  ) {}

  async generate(
    audioPath: string
  ): Promise<AudioFingerprint> {
    throw new Error(
      'Chromaprint execution requires native binary fpcalc.'
    );
  }

  async compare(
    a: AudioFingerprint,
    b: AudioFingerprint
  ): Promise<FingerprintMatch> {
    if (a.fingerprint === b.fingerprint) {
      return {
        score: 1,
        exact: true,
        confidence: 1,
      };
    }

    return {
      score: 0,
      exact: false,
      confidence: 0,
    };
  }
}
