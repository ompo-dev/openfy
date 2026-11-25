import type { CatalogTrackInput } from '../library/catalogLibrary';

export type MixClip = { id: string; trackId: string; sourceStartMs: number; sourceEndMs: number; volume: number; lane?: number; gapBeforeMs?: number };
export const MAX_MIX_LANES = 8;
export const MAX_MIX_DURATION_MS = 24 * 60 * 60 * 1000;
export type MixProject = {
  version: 1; id: string; title: string; description: string; revision: number;
  tracks: CatalogTrackInput[]; clips: MixClip[]; createdAt: string; updatedAt: string;
};
export const MIN_CLIP_MS = 100;
export const createMixId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
export const clipDuration = (clip: MixClip) => clip.sourceEndMs - clip.sourceStartMs;
export const mixDuration = (clips: MixClip[]) => mixTimeline(clips).reduce((total, clip) => Math.max(total, clip.endMs), 0);
export const mixTimeline = (clips: MixClip[]) => {
  const cursors = new Map<number, number>();
  return clips.map((clip) => {
    const lane = clip.lane ?? 0;
    const startMs = (cursors.get(lane) ?? 0) + (clip.gapBeforeMs ?? 0);
    const entry = { ...clip, lane, startMs, endMs: startMs + clipDuration(clip) };
    cursors.set(lane, entry.endMs);
    return entry;
  });
};
export const validateMixClips = (clips: MixClip[], tracks: CatalogTrackInput[]) => {
  const byId = new Map(tracks.map((track) => [track.spotifyId, track]));
  if (byId.size !== tracks.length) throw new Error('Fontes de áudio duplicadas.');
  const ids = new Set<string>();
  if (clips.length > 200) throw new Error('O mix aceita até 200 clipes.');
  for (const clip of clips) {
    const track = byId.get(clip.trackId);
    if (!track || !clip.id || ids.has(clip.id) || !Number.isInteger(clip.lane ?? 0) ||
      (clip.lane ?? 0) < 0 || (clip.lane ?? 0) >= MAX_MIX_LANES ||
      !Number.isSafeInteger(clip.gapBeforeMs ?? 0) || (clip.gapBeforeMs ?? 0) < 0 ||
      ![clip.sourceStartMs, clip.sourceEndMs, clip.volume].every(Number.isFinite) ||
      clip.sourceStartMs < 0 || clipDuration(clip) < MIN_CLIP_MS ||
      clip.sourceEndMs > track.duration_ms || clip.volume < 0 || clip.volume > 1) {
      throw new Error('Trecho de áudio inválido.');
    }
    ids.add(clip.id);
  }
  if (mixDuration(clips) > MAX_MIX_DURATION_MS) throw new Error('O mix aceita até 24 horas.');
};

export const trimMixClip = (clips: MixClip[], id: string, startMs: number, endMs: number): MixClip[] =>
  clips.map((clip) => clip.id === id ? { ...clip, sourceStartMs: Math.round(startMs), sourceEndMs: Math.round(endMs) } : clip);

export const splitMixClip = (clips: MixClip[], id: string, positionMs: number): MixClip[] => {
  const entry = mixTimeline(clips).find((clip) => clip.id === id);
  if (!entry) return clips;
  const offset = Math.round(positionMs - entry.startMs);
  if (offset < MIN_CLIP_MS || clipDuration(entry) - offset < MIN_CLIP_MS) return clips;
  return clips.flatMap((clip) => clip.id === id ? [
    { ...clip, sourceEndMs: clip.sourceStartMs + offset },
    { ...clip, id: createMixId(), sourceStartMs: clip.sourceStartMs + offset, ...(clip.gapBeforeMs !== undefined ? { gapBeforeMs: 0 } : {}) },
  ] : [clip]);
};

export const moveMixClip = (clips: MixClip[], from: number, to: number): MixClip[] => {
  if (from < 0 || to < 0 || from >= clips.length || to >= clips.length || from === to) return clips;
  const result = [...clips];
  result.splice(to, 0, result.splice(from, 1)[0]);
  return result;
};

/** Find the nearest non-overlapping placement, without shifting any other clip. */
export const placeMixClip = (clips: MixClip[], id: string, lane: number, requestedMs: number): MixClip[] => {
  const timeline = mixTimeline(clips);
  const moving = timeline.find((clip) => clip.id === id);
  if (!moving || !Number.isFinite(requestedMs) || !Number.isInteger(lane) || lane < 0 || lane >= MAX_MIX_LANES) return clips;
  const duration = clipDuration(moving);
  const target = Math.max(0, Math.min(MAX_MIX_DURATION_MS - duration, Math.round(requestedMs)));
  const other = timeline.filter((clip) => clip.id !== id);
  const occupied = other.filter((clip) => clip.lane === lane).sort((a, b) => a.startMs - b.startMs);
  let cursor = 0;
  let best = -1;
  let distance = Infinity;
  for (const end of [...occupied.map((clip) => clip.startMs), MAX_MIX_DURATION_MS]) {
    if (end - cursor >= duration) {
      const candidate = Math.max(cursor, Math.min(end - duration, target));
      if (Math.abs(candidate - target) < distance) { best = candidate; distance = Math.abs(candidate - target); }
    }
    const next = occupied.find((clip) => clip.startMs === end);
    if (next) cursor = next.endMs;
  }
  if (best < 0 || (moving.lane === lane && moving.startMs === best)) return clips;
  const positions = [...other, { ...moving, lane, startMs: best, endMs: best + duration }];
  // Preserve the original global ordering as much as possible; each lane is chronological.
  const ordered = positions.sort((a, b) => a.lane - b.lane || a.startMs - b.startMs);
  const ends = new Map<number, number>();
  return ordered.map(({ startMs, endMs, ...clip }) => {
    const gapBeforeMs = startMs - (ends.get(clip.lane) ?? 0);
    ends.set(clip.lane, endMs);
    return { ...clip, gapBeforeMs };
  });
};

export const formatMixTime = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
