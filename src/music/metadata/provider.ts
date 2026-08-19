import type {
  CanonicalTrack,
  MusicProvider,
} from '../identity/canonical-track';

export interface MetadataProvider {
  readonly provider: MusicProvider;

  getTrack(
    id: string
  ): Promise<CanonicalTrack>;

  search(
    query: string
  ): Promise<CanonicalTrack[]>;

  getAlbum?(
    id: string
  ): Promise<CanonicalTrack[]>;

  getPlaylist?(
    id: string
  ): Promise<CanonicalTrack[]>;
}
