import { mixTimeline, type MixClip } from './mixTimeline';

export type GainPoint = { ms: number; gain: number };
type Entry = ReturnType<typeof mixTimeline>[number];
const DUCK_RAMP = 120;
export const hasMixEffects = (clip: MixClip) => Boolean(clip.fadeInMs || clip.fadeOutMs || clip.duckAmount);
export const sineEase = (t: number) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2;
export const fadeGain = (ms: number, duration: number, fadeIn: number, fadeOut: number) =>
  Math.min(fadeIn ? sineEase(ms / fadeIn) : 1, fadeOut ? sineEase((duration - ms) / fadeOut) : 1);

// Duck this clip only while another lane contains audible material.
// Ramp inside the overlap to avoid clicks, including overlapping duck windows.
export function gainEnvelope(clip: Entry, entries: Entry[]): GainPoint[] {
  const duration = clip.endMs - clip.startMs;
  const fadeIn = clip.fadeInMs || 0, fadeOut = clip.fadeOutMs || 0;
  const duck = clip.duckAmount || 0;
  const overlaps = duck ? entries.filter((other) => other.lane !== clip.lane && other.volume > 0 &&
    other.startMs < clip.endMs && other.endMs > clip.startMs)
    .map((other) => [Math.max(0, other.startMs - clip.startMs), Math.min(duration, other.endMs - clip.startMs)]) : [];
  const windows: number[][] = [];
  for (const overlap of overlaps.sort((a,b) => a[0] - b[0])) {
    const last = windows[windows.length - 1];
    if (last && overlap[0] <= last[1]) last[1] = Math.max(last[1], overlap[1]);
    else windows.push(overlap);
  }
  const points = new Set([0, duration, fadeIn, duration - fadeOut]);
  // Native renderers interpolate gain points. Sample the raised-cosine curve
  // at 32 equal subdivisions so preview and export use the same S envelope.
  for (let i = 1; i < 32; i++) {
    if (fadeIn) points.add(fadeIn * i / 32);
    if (fadeOut) points.add(duration - fadeOut * i / 32);
  }
  for (const [a, b] of windows) {
    const ramp = Math.min(DUCK_RAMP, (b - a) / 2);
    for (const t of [a, a + ramp, b - ramp, b]) points.add(t);
  }
  const times = [...points].filter((t) => t >= 0 && t <= duration).sort((a, b) => a - b);
  const gain = (t: number) => {
    const fade = fadeGain(t, duration, fadeIn, fadeOut);
    let reduction = 0;
    for (const [a, b] of windows) if (t >= a && t <= b) {
      const ramp = Math.min(DUCK_RAMP, (b - a) / 2);
      reduction = Math.max(reduction, Math.min(1, (t - a) / ramp, (b - t) / ramp));
    }
    return clip.volume * fade * (1 - duck * reduction);
  };
  // Include intermediate samples where both fade and duck change.
  return times.flatMap((t, i) => {
    if (!i) return [{ ms: t, gain: gain(t) }];
    const prev = times[i - 1];
    const n = duck && (prev < fadeIn || t > duration - fadeOut) && windows.some(([a,b]) => a < t && b > prev)
      ? Math.min(24, Math.ceil((t - prev) / 50)) : 1;
    return Array.from({ length: n }, (_, j) => {
      const ms = prev + (t - prev) * (j + 1) / n;
      return { ms, gain: gain(ms) };
    });
  });
}

export function envelopeGain(points: GainPoint[], ms: number): number {
  if (!points.length) return 1;
  if (ms <= points[0].ms) return points[0].gain;
  for (let i = 1; i < points.length; i++) {
    const b = points[i], a = points[i - 1];
    if (ms <= b.ms) return a.gain + (b.gain - a.gain) * (ms - a.ms) / (b.ms - a.ms);
  }
  return points[points.length - 1].gain;
}
