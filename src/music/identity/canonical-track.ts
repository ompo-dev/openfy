export type MusicProvider =
  | 'spotify'
  | 'youtube'
  | 'musicbrainz'
  | 'deezer'
  | 'soundcloud'
  | 'local'
  | 'other';

export interface Artist {
  id?: string;
  name: string;
}

export interface Album {
  id?: string;
  name: string;
  artist?: Artist;
}

export type TrackVersionType =
  | 'ORIGINAL'
  | 'REMASTER'
  | 'LIVE'
  | 'ACOUSTIC'
  | 'REMIX'
  | 'RADIO_EDIT'
  | 'EXTENDED'
  | 'INSTRUMENTAL'
  | 'CLEAN'
  | 'EXPLICIT'
  | 'SPED_UP'
  | 'SLOWED'
  | 'UNKNOWN';

export interface TrackVersion {
  type: TrackVersionType;
  label?: string;
}

export interface TrackSource {
  provider: MusicProvider;
  id: string;
  url?: string;
}

export interface TrackArtwork {
  url: string;
  width?: number;
  height?: number;
}

export interface CanonicalTrack {
  id: string;
  title: string;
  artists: Artist[];
  album?: Album;
  durationMs?: number;
  isrc?: string;
  musicbrainzRecordingId?: string;
  version: TrackVersion;
  artwork?: TrackArtwork;
  sources: TrackSource[];
  createdAt: string;
  updatedAt: string;
}
