import type {
  CanonicalTrack,
  MusicProvider,
} from '../identity/canonical-track';

export interface CandidateRepository {
  findByISRC(
    isrc: string
  ): Promise<CanonicalTrack[]>;

  findByRecordingId(
    id: string
  ): Promise<CanonicalTrack[]>;

  findByProviderId(
    provider: MusicProvider,
    id: string
  ): Promise<CanonicalTrack[]>;

  searchMetadata(
    query: {
      title: string;
      artists: string[];
    }
  ): Promise<CanonicalTrack[]>;
}

export class CandidateResolver {
  constructor(
    private readonly repository: CandidateRepository
  ) {}

  async resolve(
    input: CanonicalTrack
  ): Promise<CanonicalTrack[]> {
    const candidates = new Map<string, CanonicalTrack>();

    /*
     * Primeiro: identificadores fortes (ISRC, Recording ID).
     */
    if (input.isrc) {
      const tracks = await this.repository.findByISRC(input.isrc);
      this.add(candidates, tracks);
    }

    if (input.musicbrainzRecordingId) {
      const tracks = await this.repository.findByRecordingId(
        input.musicbrainzRecordingId
      );
      this.add(candidates, tracks);
    }

    /*
     * Provider ID.
     */
    for (const source of input.sources) {
      const tracks = await this.repository.findByProviderId(
        source.provider,
        source.id
      );
      this.add(candidates, tracks);
    }

    /*
     * Só usamos metadata quando não encontramos identidade forte.
     */
    if (!candidates.size) {
      const tracks = await this.repository.searchMetadata({
        title: input.title,
        artists: input.artists.map(artist => artist.name),
      });
      this.add(candidates, tracks);
    }

    return [...candidates.values()];
  }

  private add(
    map: Map<string, CanonicalTrack>,
    tracks: CanonicalTrack[]
  ) {
    for (const track of tracks) {
      map.set(track.id, track);
    }
  }
}
