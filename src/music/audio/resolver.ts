import type {
  CanonicalTrack,
} from '../identity/canonical-track';

import type {
  AudioSource,
} from './types';

export interface AudioProvider {
  name: string;

  resolve(
    track: CanonicalTrack
  ): Promise<AudioSource | null>;
}

export class AudioResolver {
  constructor(
    private readonly providers: AudioProvider[]
  ) {}

  async resolve(
    track: CanonicalTrack
  ): Promise<AudioSource | null> {
    for (const provider of this.providers) {
      try {
        const source = await provider.resolve(track);
        if (source && source.verified) {
          return source;
        }
      } catch {
        continue;
      }
    }

    return null;
  }
}
