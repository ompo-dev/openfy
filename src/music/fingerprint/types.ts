export interface AudioFingerprint {
  algorithm:
    | 'CHROMAPRINT'
    | 'ACOUSTID'
    | 'CUSTOM';

  fingerprint: string;

  durationMs: number;
}

export interface FingerprintMatch {
  score: number;

  exact: boolean;

  offsetMs?: number;

  confidence: number;
}
