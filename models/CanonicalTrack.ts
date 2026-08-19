/**
 * Canonical Track Model & Music Graph Types
 * Spotify serves as the Canonical Identity Authority (Metadata, ISRC, Duration, Artists, Artwork).
 * The Canonical Track links identity to verified audio sources and synchronized lyrics.
 */

export type TrackSourceProvider = 'soundcloud' | 'youtube' | 'spotyloader' | 'local';

export type TrackSource = {
  provider: TrackSourceProvider;
  url: string;
  externalId?: string;
  durationMs: number;
  quality: string;
  format: string;
  confidence: number; // 0 to 100
  isMasterRecording: boolean;
  verifiedAt: string;
};

export type LyricTimestampSegment = {
  index: number;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  words?: { word: string; timeMs: number }[];
};

export type CanonicalLyrics = {
  provider: 'lrclib' | 'letras' | 'vagalume' | 'local';
  plainText: string;
  syncedText?: string;
  segments: LyricTimestampSegment[];
  isSynced: boolean;
  timeOffsetMs: number; // Alignment offset (+/- ms) relative to audio stream
};

export type MatchReport = {
  spotifyId: string;
  canonicalTitle: string;
  canonicalArtists: string[];
  expectedDurationMs: number;
  sourceConfidence: number;
  durationDifferenceMs: number;
  isVerified: boolean;
  status: 'verified' | 'matched' | 'ambiguous' | 'unavailable';
  reasons: string[];
};

export type CanonicalTrack = {
  id: string; // Canonical Unique ID (usually spotifyId or UUID)
  spotifyId: string;
  isrc?: string;
  musicbrainzId?: string;
  title: string;
  artists: string[];
  primaryArtist: string;
  albumName: string;
  durationMs: number;
  imageURL: string;
  localAudioPath?: string;
  localImagePath?: string;
  audioSource?: TrackSource;
  lyrics?: CanonicalLyrics;
  matchReport?: MatchReport;
  createdAt: string;
  updatedAt: string;
};
