import type { CatalogTrackInput } from '../library/catalogLibrary';

export type MixClip = { id: string; trackId: string; sourceStartMs: number; sourceEndMs: number; volume: number };
export type MixProject = {
  version: 1; id: string; title: string; description: string; revision: number;
  tracks: CatalogTrackInput[]; clips: MixClip[]; createdAt: string; updatedAt: string;
};
export const MIN_CLIP_MS = 100;
export const createMixId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
export const clipDuration = (clip: MixClip) => clip.sourceEndMs - clip.sourceStartMs;
export const mixDuration = (clips: MixClip[]) => clips.reduce((total, clip) => total + clipDuration(clip), 0);
export const mixTimeline = (clips: MixClip[]) => {
  let startMs = 0;
  return clips.map((clip) => {
    const entry = { ...clip, startMs, endMs: startMs + clipDuration(clip) };
    startMs = entry.endMs;
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
    if (!track || !clip.id || ids.has(clip.id) ||
      ![clip.sourceStartMs, clip.sourceEndMs, clip.volume].every(Number.isFinite) ||
      clip.sourceStartMs < 0 || clipDuration(clip) < MIN_CLIP_MS ||
      clip.sourceEndMs > track.duration_ms || clip.volume < 0 || clip.volume > 1) {
      throw new Error('Trecho de áudio inválido.');
    }
    ids.add(clip.id);
  }
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
    { ...clip, id: createMixId(), sourceStartMs: clip.sourceStartMs + offset },
  ] : [clip]);
};

export const moveMixClip = (clips: MixClip[], from: number, to: number): MixClip[] => {
  if (from < 0 || to < 0 || from >= clips.length || to >= clips.length || from === to) return clips;
  const result = [...clips];
  result.splice(to, 0, result.splice(from, 1)[0]);
  return result;
};

export const formatMixTime = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
