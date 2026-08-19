import type {
  AudioFingerprint,
} from './types';

export interface AcoustIDResult {
  recordingId: string;
  score: number;
}

export class AcoustIDClient {
  constructor(
    private readonly apiKey: string
  ) {}

  async lookup(
    fingerprint: AudioFingerprint
  ): Promise<AcoustIDResult[]> {
    const params = new URLSearchParams({
      client: this.apiKey,
      fingerprint: fingerprint.fingerprint,
      duration: String(Math.round(fingerprint.durationMs / 1000)),
      meta: 'recordings+releasegroups+artists',
    });

    const response = await fetch(
      `https://api.acoustid.org/v2/lookup?${params}`
    );

    if (!response.ok) {
      throw new Error(`AcoustID request failed: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const results = data.results ?? [];

    return results.flatMap((result: any) =>
      (result.recordings ?? []).map((recording: any) => ({
        recordingId: recording.id,
        score: result.score ?? 0,
      }))
    );
  }
}
