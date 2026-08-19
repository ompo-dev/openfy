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

export interface CanonicalTrack {
  id: string;
  title: string;
  artists: Artist[];
  album?: Album;
  durationMs?: number;
  isrc?: string;
  musicbrainzRecordingId?: string;
  version: TrackVersion;
  artwork?: {
    url: string;
    width?: number;
    height?: number;
  };
  sources: TrackSource[];
  createdAt: string;
  updatedAt: string;
}
