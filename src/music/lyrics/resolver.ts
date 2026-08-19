import type {
  Lyrics,
} from './types';

export interface LyricsProvider {
  name: string;

  find(
    query: {
      title: string;
      artist: string;
      album?: string;
      isrc?: string;
    }
  ): Promise<Lyrics | null>;
}

export class LyricsResolver {
  constructor(
    private readonly providers: LyricsProvider[]
  ) {}

  async resolve(
    query: {
      title: string;
      artist: string;
      album?: string;
      isrc?: string;
    }
  ): Promise<Lyrics | null> {
    for (const provider of this.providers) {
      try {
        const lyrics = await provider.find(query);
        if (lyrics && lyrics.lines.length) {
          return lyrics;
        }
      } catch {}
    }

    return null;
  }
}
