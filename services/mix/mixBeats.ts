export type BeatDensity = 'off' | 'less' | 'more';

/** Detect transient onsets from real decoded amplitude; not a synthetic BPM grid. */
export function detectMixBeats(peaks: number[], duration: number, start: number, end: number, density: BeatDensity): number[] {
  if (density === 'off' || peaks.length < 3 || duration <= 0) return [];
  // Work with a roughly 10 ms energy envelope, rather than reacting to individual PCM oscillations.
  const stride = Math.max(1, Math.ceil(10 / (duration / peaks.length)));
  const signal = stride === 1 ? peaks : Array.from({ length: Math.ceil(peaks.length / stride) }, (_, i) => {
    const samples = peaks.slice(i * stride, (i + 1) * stride);
    return Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
  });
  const hop = duration / peaks.length * stride;
  const minDistance = density === 'less' ? 300 : 145;
  const radius = Math.max(2, Math.round(180 / hop));
  const flux = signal.map((v, i) => i ? Math.max(0, v - signal[i - 1]) : 0);
  const sum = [0];
  for (const v of flux) sum.push(sum[sum.length - 1] + v);
  const candidates: { ms: number; strength: number }[] = [];
  for (let i = 1; i < flux.length - 1; i++) {
    const ms = Math.round(i * hop);
    if (ms < start || ms >= end) continue;
    const a = Math.max(0, i - radius), b = Math.min(flux.length, i + radius + 1);
    const avg = (sum[b] - sum[a]) / (b - a);
    const strength = flux[i];
    if (strength >= Math.max(density === 'less' ? 0.045 : 0.02, avg * (density === 'less' ? 2.1 : 1.35)) &&
      strength >= flux[i - 1] && strength > flux[i + 1]) candidates.push({ ms, strength });
  }
  const accepted: typeof candidates = [];
  for (const item of candidates) {
    const prev = accepted[accepted.length - 1];
    if (prev && item.ms - prev.ms < minDistance) { if (item.strength > prev.strength) accepted[accepted.length - 1] = item; }
    else accepted.push(item);
  }
  return accepted.slice(0, 10000).map(({ ms }) => ms);
}
