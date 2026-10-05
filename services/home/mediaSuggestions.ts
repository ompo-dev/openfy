import type { PlayerTrack } from '../../stores/usePlayerStore';
import { isSameRecording } from '../library/trackIdentity';

export type SuggestedMediaEntry = { id: string; title: string; artworkURL: string; trackJSON: string };

export const buildMediaSuggestions = (current: PlayerTrack, candidates: PlayerTrack[], limit = 4): PlayerTrack[] => {
  const ids = new Set([current.spotifyId]);
  const selected: PlayerTrack[] = [];
  for (const track of candidates) {
    if (selected.length >= limit) break;
    if (!track.spotifyId || !track.title || ids.has(track.spotifyId) || isSameRecording(current, track) ||
      selected.some((existing) => isSameRecording(existing, track))) continue;
    ids.add(track.spotifyId);
    selected.push(track);
  }
  return selected;
};

export const toSuggestedMediaEntry = (track: PlayerTrack): SuggestedMediaEntry => ({
  id: track.spotifyId,
  title: track.title,
  artworkURL: track.localImagePath || track.imageURL || '',
  trackJSON: JSON.stringify(track),
});

export const parseSuggestedMediaTrack = (json: string): PlayerTrack | null => {
  try {
    const track = JSON.parse(json);
    if (!track || typeof track.spotifyId !== 'string' || !track.spotifyId ||
      typeof track.title !== 'string' || !track.title || typeof track.artistName !== 'string' ||
      typeof track.duration_ms !== 'number' || !Number.isFinite(track.duration_ms) || track.duration_ms < 0) return null;
    return track as PlayerTrack;
  } catch { return null; }
};
