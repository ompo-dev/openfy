import type {
  CanonicalTrack,
} from '../identity/canonical-track';

import type {
  MetadataProvider,
} from './provider';

export class MusicBrainzProvider
  implements MetadataProvider
{
  readonly provider = 'musicbrainz' as const;
  private readonly baseURL = 'https://musicbrainz.org/ws/2';

  constructor(
    private readonly userAgent: string = 'Openfy/1.0.0 (contact@openfy.app)'
  ) {}

  async getTrack(
    id: string
  ): Promise<CanonicalTrack> {
    const url =
      `${this.baseURL}/recording/${id}` +
      `?fmt=json&inc=artists+releases`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': this.userAgent,
      },
    });

    if (!response.ok) {
      throw new Error(`MusicBrainz failed: ${response.status}`);
    }

    const data = (await response.json()) as any;

    return {
      id: `musicbrainz:${data.id}`,
      title: data.title,
      artists: (data['artist-credit'] ?? []).map((credit: any) => ({
        id: credit.artist?.id,
        name: credit.name ?? credit.artist?.name,
      })),
      durationMs: data.length,
      musicbrainzRecordingId: data.id,
      version: {
        type: 'ORIGINAL',
      },
      sources: [
        {
          provider: 'musicbrainz',
          id: data.id,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async search(
    query: string
  ): Promise<CanonicalTrack[]> {
    const params = new URLSearchParams({
      query,
      fmt: 'json',
    });

    const response = await fetch(`${this.baseURL}/recording?${params}`, {
      headers: {
        'User-Agent': this.userAgent,
      },
    });

    if (!response.ok) {
      throw new Error(`MusicBrainz search failed: ${response.status}`);
    }

    const data = (await response.json()) as any;

    return (data.recordings ?? []).map((recording: any) => ({
      id: `musicbrainz:${recording.id}`,
      title: recording.title,
      artists: (recording['artist-credit'] ?? []).map((credit: any) => ({
        id: credit.artist?.id,
        name: credit.name ?? credit.artist?.name,
      })),
      durationMs: recording.length,
      musicbrainzRecordingId: recording.id,
      version: {
        type: 'ORIGINAL',
      },
      sources: [
        {
          provider: 'musicbrainz',
          id: recording.id,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }
}
