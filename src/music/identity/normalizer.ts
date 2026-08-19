import type {
  CanonicalTrack,
  TrackVersion,
} from './canonical-track';

import {
  normalizeISRC,
} from './identifiers';

export interface NormalizedTrack {
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  isrc?: string;
  musicbrainzRecordingId?: string;
  version: TrackVersion;
}

export function normalizeText(
  value: string
): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/['"`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTrack(
  track: CanonicalTrack
): NormalizedTrack {
  return {
    title: normalizeText(track.title),

    artists: track.artists
      .map(artist =>
        normalizeText(artist.name)
      )
      .filter(Boolean)
      .sort(),

    album: track.album
      ? normalizeText(track.album.name)
      : undefined,

    durationMs:
      track.durationMs,

    isrc:
      normalizeISRC(track.isrc),

    musicbrainzRecordingId:
      track.musicbrainzRecordingId
        ?.trim()
        .toLowerCase(),

    version:
      track.version,
  };
}
