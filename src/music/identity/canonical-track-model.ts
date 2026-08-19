/**
 * CanonicalTrackModel - Fully Decoupled Identity, Metadata, Artwork, Lyrics & Playback
 *
 * Core Rule: Spotify/Anchor defines identity.
 * Secondary providers can provide lyrics or playback, but NEVER redefine identity.
 */

export interface TrackIdentity {
  id: string;
  title: string;
  artists: string[];
  durationMs: number;
  isrc?: string;
  anchorProvider: 'spotify' | 'apple_music' | 'youtube' | 'deezer' | 'soundcloud';
}

export interface TrackMetadata {
  album?: string;
  releaseDate?: string;
  label?: string;
  genres?: string[];
}

import type { LyricLine } from '../lyrics/types';

export interface TrackArtworkData {
  url: string;
  width?: number;
  height?: number;
}

export interface TrackLyricsData {
  synced: boolean;
  lines: LyricLine[];
  source?: string;
}

export interface PlaybackSourceData {
  type: 'DIRECT_AUDIO' | 'HLS' | 'EXTERNAL';
  url: string;
  directUrl?: string;
  provider: 'soundcloud' | 'youtube' | 'deezer' | 'spotify';
  format: string;
  quality: string;
  verified: boolean;
  confidence: 'PROVEN' | 'VERY_HIGH' | 'HIGH';
  score: number;
}

export interface CanonicalTrackModel {
  identity: TrackIdentity;
  metadata: TrackMetadata;
  artwork?: TrackArtworkData;
  lyrics?: TrackLyricsData;
  playback?: PlaybackSourceData;
}
