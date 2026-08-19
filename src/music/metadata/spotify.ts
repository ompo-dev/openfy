import type {
  CanonicalTrack,
} from '../identity/canonical-track';

import type {
  MetadataProvider,
} from './provider';

export interface SpotifyClient {
  getTrack(
    id: string
  ): Promise<any>;

  search(
    query: string
  ): Promise<any>;
}

export class SpotifyMetadataProvider
  implements MetadataProvider
{
  readonly provider = 'spotify' as const;

  constructor(
    private readonly client: SpotifyClient
  ) {}

  async getTrack(
    id: string
  ): Promise<CanonicalTrack> {
    const track = await this.client.getTrack(id);
    return this.mapTrack(track);
  }

  async search(
    query: string
  ): Promise<CanonicalTrack[]> {
    const result = await this.client.search(query);
    return (result.tracks?.items ?? []).map((track: any) =>
      this.mapTrack(track)
    );
  }

  private mapTrack(
    track: any
  ): CanonicalTrack {
    return {
      id: `spotify:${track.id}`,
      title: track.name,
      artists: (track.artists ?? []).map((artist: any) => ({
        id: artist.id,
        name: artist.name,
      })),
      album: track.album
        ? {
            id: track.album.id,
            name: track.album.name,
          }
        : undefined,
      durationMs: track.duration_ms,
      isrc: track.external_ids?.isrc,
      version: {
        type: 'ORIGINAL',
      },
      artwork: track.album?.images?.[0]
        ? {
            url: track.album.images[0].url,
            width: track.album.images[0].width,
            height: track.album.images[0].height,
          }
        : undefined,
      sources: [
        {
          provider: 'spotify',
          id: track.id,
          url: `https://open.spotify.com/track/${track.id}`,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
