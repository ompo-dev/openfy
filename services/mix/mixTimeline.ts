import type { CatalogTrackInput } from '../library/catalogLibrary';

export type MixClip = { id: string; trackId: string; sourceStartMs: number; sourceEndMs: number; volume: number; lane?: number; gapBeforeMs?: number;
  fadeInMs?: number; fadeOutMs?: number; duckAmount?: number; beatsMs?: number[] };
export const MAX_MIX_LANES = 8;
export const MAX_MIX_DURATION_MS = 24 * 60 * 60 * 1000;
export type MixProject = {
  version: 1; id: string; title: string; description: string; revision: number;
  tracks: CatalogTrackInput[]; clips: MixClip[]; createdAt: string; updatedAt: string;
};
export const MIN_CLIP_MS = 100;
export const createMixId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
export const clipDuration = (clip: MixClip) => clip.sourceEndMs - clip.sourceStartMs;
/** Remove unused audio lanes without touching timing or source edits. */
export const compactMixLanes = (clips: MixClip[]): MixClip[] => {
  const used = [...new Set(clips.map((clip) => clip.lane ?? 0))].sort((a, b) => a - b);
  return clips.map((clip) => {
    const lane = used.indexOf(clip.lane ?? 0);
    return lane === (clip.lane ?? 0) ? clip : { ...clip, lane };
  });
};
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
      ![clip.fadeInMs ?? 0, clip.fadeOutMs ?? 0, clip.duckAmount ?? 0].every(Number.isFinite) ||
      (clip.fadeInMs ?? 0) < 0 || (clip.fadeOutMs ?? 0) < 0 ||
      (clip.fadeInMs ?? 0) + (clip.fadeOutMs ?? 0) > clipDuration(clip) ||
      (clip.duckAmount ?? 0) < 0 || (clip.duckAmount ?? 0) > 1 ||
      (clip.beatsMs !== undefined && (!Array.isArray(clip.beatsMs) || clip.beatsMs.length > 10000 ||
        clip.beatsMs.some((ms, i) => !Number.isSafeInteger(ms) || ms < clip.sourceStartMs || ms >= clip.sourceEndMs ||
          (i > 0 && ms <= clip.beatsMs![i - 1])))) ||
      clip.sourceStartMs < 0 || clipDuration(clip) < MIN_CLIP_MS ||
      clip.sourceEndMs > track.duration_ms || clip.volume < 0 || clip.volume > 1) {
      throw new Error('Trecho de áudio inválido.');
    }
    ids.add(clip.id);
  }
  if (mixDuration(clips) > MAX_MIX_DURATION_MS) throw new Error('O mix aceita até 24 horas.');
};

const fitEffects = (clip: MixClip, startMs: number, endMs: number): MixClip => {
  const duration = endMs - startMs;
  const fadeInMs = Math.min(clip.fadeInMs || 0, duration);
  return { ...clip, sourceStartMs: startMs, sourceEndMs: endMs,
    ...(clip.fadeInMs !== undefined ? { fadeInMs } : {}),
    ...(clip.fadeOutMs !== undefined ? { fadeOutMs: Math.min(clip.fadeOutMs, duration - fadeInMs) } : {}),
    ...(clip.beatsMs !== undefined ? { beatsMs: clip.beatsMs.filter((ms) => ms >= startMs && ms < endMs) } : {}) };
};
export const trimMixClip = (clips: MixClip[], id: string, startMs: number, endMs: number): MixClip[] =>
  clips.map((clip) => clip.id === id ? fitEffects(clip, Math.round(startMs), Math.round(endMs)) : clip);

/** Slip edits change source time, never the clip's duration, lane or gap. */
export const slipSourceStart = (clip: MixClip, requested: number, sourceDuration: number) =>
  Math.max(0, Math.min(Math.floor(sourceDuration - clipDuration(clip)), Math.round(requested)));
export const slipMixClip = (clips: MixClip[], id: string, requested: number, sourceDuration: number): MixClip[] =>
  clips.map((clip) => {
    if (clip.id !== id || !Number.isFinite(requested) || !Number.isFinite(sourceDuration) || sourceDuration < clipDuration(clip)) return clip;
    const start = slipSourceStart(clip, requested, sourceDuration);
    return start === clip.sourceStartMs ? clip : fitEffects(clip, start, start + clipDuration(clip));
  });

/** Replace the source; a shorter replacement leaves silence instead of shifting later clips. */
export function replaceMixClipSource(clips: MixClip[], id: string, track: CatalogTrackInput): MixClip[] {
  const index = clips.findIndex((clip) => clip.id === id);
  if (index < 0 || !Number.isFinite(track.duration_ms) || track.duration_ms < MIN_CLIP_MS) return clips;
  const clip = clips[index];
  if (clip.trackId === track.spotifyId) return clips;
  const duration = Math.min(clipDuration(clip), Math.floor(track.duration_ms));
  const replacement = fitEffects({ ...clip, trackId: track.spotifyId, beatsMs: undefined }, 0, duration);
  const next = [...clips];
  next[index] = replacement;
  const following = next.findIndex((item, i) => i > index && (item.lane ?? 0) === (clip.lane ?? 0));
  if (following >= 0 && duration < clipDuration(clip)) {
    next[following] = { ...next[following], gapBeforeMs: (next[following].gapBeforeMs ?? 0) + clipDuration(clip) - duration };
  }
  return next;
}

/** Left-handle trims move the visible left boundary, keeping the right boundary
 * fixed where the lane has room. Extending beyond the previous clip ripples. */
export const trimMixClipAtPosition = (clips: MixClip[], id: string, startMs: number, endMs: number): MixClip[] =>
  clips.map((clip) => {
    if (clip.id !== id) return clip;
    const trimmed = fitEffects(clip, Math.round(startMs), Math.round(endMs));
    const gap = Math.max(0, (clip.gapBeforeMs ?? 0) + trimmed.sourceStartMs - clip.sourceStartMs);
    return gap === (clip.gapBeforeMs ?? 0) ? trimmed : { ...trimmed, gapBeforeMs: gap };
  });

export const splitMixClip = (clips: MixClip[], id: string, positionMs: number): MixClip[] => {
  const entry = mixTimeline(clips).find((clip) => clip.id === id);
  if (!entry) return clips;
  const offset = Math.round(positionMs - entry.startMs);
  if (offset < MIN_CLIP_MS || clipDuration(entry) - offset < MIN_CLIP_MS) return clips;
  return clips.flatMap((clip) => clip.id === id ? [
    fitEffects({ ...clip, ...(clip.fadeOutMs !== undefined ? { fadeOutMs: 0 } : {}) }, clip.sourceStartMs, clip.sourceStartMs + offset),
    { ...fitEffects({ ...clip, ...(clip.fadeInMs !== undefined ? { fadeInMs: 0 } : {}) }, clip.sourceStartMs + offset, clip.sourceEndMs), id: createMixId(), ...(clip.gapBeforeMs !== undefined ? { gapBeforeMs: 0 } : {}) },
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

/** Copy a clip with a new identity; place it without disturbing existing audio. */
export function insertMixClipCopy(clips: MixClip[], clip: MixClip, id: string, lane: number, position: number, forwardOnly = false): MixClip[] {
  if (clips.length >= 200 || clips.some((item) => item.id === id) || !Number.isInteger(lane) || lane < 0 || lane >= MAX_MIX_LANES || !Number.isFinite(position)) return clips;
  const duration = clipDuration(clip);
  const occupied = mixTimeline(clips).filter((item) => item.lane === lane);
  let target = Math.max(0, Math.round(position));
  if (forwardOnly) {
    for (const item of occupied) {
      if (target + duration <= item.startMs) break;
      if (target < item.endMs) target = item.endMs;
    }
    if (target + duration > MAX_MIX_DURATION_MS) return clips;
  }
  const copy = { ...clip, id, lane, gapBeforeMs: 0, ...(clip.beatsMs ? { beatsMs: [...clip.beatsMs] } : {}) };
  const next = placeMixClip([...clips, copy], id, lane, target);
  return mixDuration(next) > MAX_MIX_DURATION_MS ? clips : next;
}

export const formatMixTime = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** Pixel-based magnetic alignment of either edge to the cursor or another clip. */
export function snapMixPosition(entries: ReturnType<typeof mixTimeline>, id: string, ms: number, cursor: number, scale: number, edge?: 'start' | 'end') {
  const clip = entries.find((item) => item.id === id);
  if (!clip || scale <= 0) return { ms, guide: null as number | null };
  const threshold = Math.min(350, 7 / scale);
  const targets = [0, cursor, ...entries.filter((item) => item.id !== id).flatMap((item) => [item.startMs, item.endMs])];
  const offsets = edge ? [0] : [0, clipDuration(clip)];
  let best = { ms, guide: null as number | null };
  let distance = threshold;
  for (const target of targets) for (const offset of offsets) {
    const candidate = target - offset, delta = Math.abs(candidate - ms);
    if (candidate >= 0 && delta <= distance) { distance = delta; best = { ms: candidate, guide: target }; }
  }
  return best;
}
