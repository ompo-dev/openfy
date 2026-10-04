type TrackIdentity = {
  id?: string;
  spotifyId?: string;
  title: string;
  subtitle?: string;
  artistName?: string;
  artists?: { name: string }[];
  durationMs?: number;
  duration_ms?: number;
  youtubeVideoId?: string;
};

const normalize = (value: string) => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const primaryArtist = (track: TrackIdentity) => normalize(
  track.artists?.[0]?.name || (track.artistName || track.subtitle || '').split(/\s*(?:,|&|\u00b7)\s*/)[0]
);

/** Recognizes catalog aliases without confusing different songs in the same video. */
export function isSameRecording(left: TrackIdentity | null | undefined, right: TrackIdentity): boolean {
  if (!left) return false;
  const leftId = left.spotifyId || left.id;
  const rightId = right.spotifyId || right.id;
  const title = normalize(left.title);
  if (!title || title !== normalize(right.title)) return false;
  if (leftId && leftId === rightId) return true;
  if (left.youtubeVideoId && left.youtubeVideoId === right.youtubeVideoId) return true;
  const leftDuration = left.duration_ms || left.durationMs || 0;
  const rightDuration = right.duration_ms || right.durationMs || 0;
  if (leftDuration && rightDuration && Math.abs(leftDuration - rightDuration) >= 4000) return false;
  const artist = primaryArtist(left);
  return Boolean(artist && artist === primaryArtist(right));
}
