export type BeatDensity = 'off' | 'less' | 'more';
export type RhythmAnalysis = { hopMs: number; bands: number[] };

/** Multiband onset detection + tempo estimation + beat tracking.
 * The returned positions always correspond to measured onsets, not a fixed grid. */
export function trackMixRhythm(analysis: RhythmAnalysis, start: number, end: number, density: BeatDensity): number[] {
  const { bands, hopMs } = analysis;
  const length = Math.floor(bands.length / 3);
  if (density === 'off' || length < 3 || hopMs <= 0 || end <= start) return [];
  const flux = new Float32Array(length);
  const bass = new Float32Array(length);
  const prev = [0, 0, 0];
  for (let i = 0; i < length; i++) {
    for (let b = 0; b < 3; b++) {
      const value = Math.log1p(Math.max(0, bands[i * 3 + b]) * 35);
      const change = i ? Math.max(0, value - prev[b]) : 0;
      flux[i] += change * [0.5, 0.3, 0.2][b];
      if (b === 0) bass[i] = change;
      prev[b] = value;
    }
  }
  const sum = new Float64Array(length + 1);
  for (let i = 0; i < length; i++) sum[i + 1] = sum[i] + flux[i];
  const radius = Math.max(3, Math.round(250 / hopMs));
  const novelty = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const a = Math.max(0, i - radius), b = Math.min(length, i + radius + 1);
    novelty[i] = Math.max(0, flux[i] - (sum[b] - sum[a]) / (b - a) * 1.25);
  }
  type Candidate = { frame: number; strength: number };
  const candidates: Candidate[] = [];
  const separation = Math.max(1, Math.round(75 / hopMs));
  for (let i = 1; i < length - 1; i++) {
    if (novelty[i] < 0.035 || novelty[i] < novelty[i - 1] || novelty[i] <= novelty[i + 1]) continue;
    const item = { frame: i, strength: novelty[i] + 0.25 * bass[i] };
    const last = candidates[candidates.length - 1];
    if (last && i - last.frame < separation) { if (item.strength > last.strength) candidates[candidates.length - 1] = item; }
    else candidates.push(item);
  }
  if (candidates.length < 3) return candidates.map((item) => Math.round(item.frame * hopMs)).filter((ms) => ms >= start && ms < end);
  // Tempo is estimated on a capped, representative portion of the onset signal.
  const minLag = Math.round(300 / hopMs), maxLag = Math.round(1000 / hopMs);
  const sampleStep = Math.max(1, Math.ceil(length / 24000));
  const correlation = (lag: number) => {
    let cross = 0, xx = 0, yy = 0;
    for (let i = lag; i < length; i += sampleStep) {
      const a = novelty[i], k = i - lag;
      // One-bin tolerance prevents a half-tempo preference for fractional-frame periods.
      const b = Math.max(novelty[k], novelty[k - 1] || 0, novelty[k + 1] || 0);
      cross += a * b; xx += a * a; yy += b * b;
    }
    return xx && yy ? cross / Math.sqrt(xx * yy) : 0;
  };
  let period = minLag, best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const score = correlation(lag) + 0.35 * correlation(lag * 2);
    // Gentle preference for a conventional tactus, without fixing a BPM.
    const weighted = score * Math.exp(-0.22 * Math.abs(Math.log(lag * hopMs / 500)));
    if (weighted > best) { best = weighted; period = lag; }
  }
  const strengths = candidates.map((item) => item.strength).sort((a,b) => a-b);
  const typical = Math.max(0.035, strengths[Math.floor(strengths.length * 0.65)]);
  // Link actual onsets at a locally variable tempo. Missing pulses may be skipped;
  // we never invent a marker at a silent position.
  const scores = new Float64Array(candidates.length);
  const parents = new Int32Array(candidates.length).fill(-1);
  let terminal = 0;
  for (let i = 0; i < candidates.length; i++) {
    const reward = Math.min(2, candidates[i].strength / typical);
    scores[i] = reward;
    for (let j = i - 1; j >= 0; j--) {
      const delta = candidates[i].frame - candidates[j].frame;
      if (delta > period * 4.25) break;
      const steps = Math.max(1, Math.round(delta / period));
      const error = Math.abs(delta / (period * steps) - 1);
      if (error > 0.22) continue;
      const score = scores[j] + reward + 0.6 - error * 6 - (steps - 1) * 0.65;
      if (score > scores[i]) { scores[i] = score; parents[i] = j; }
    }
    if (scores[i] > scores[terminal]) terminal = i;
  }
  const tracked: Candidate[] = [];
  for (let i = terminal; i >= 0; i = parents[i]) tracked.push(candidates[i]);
  tracked.reverse();
  // With no convincing periodicity (e.g. speech), keep only strong transients.
  const primary = best >= 0.12 && tracked.length >= 3 ? tracked : candidates.filter((c) => c.strength >= typical);
  const primarySet = new Set(primary);
  const selected = density === 'less' ? primary : candidates.filter((c) => c.strength >= typical * 0.10 || primarySet.has(c));
  const result: number[] = [];
  for (const c of selected) {
    // Compensate only the bin's quantization, not a guessed audio latency.
    const ms = Math.round(c.frame * hopMs);
    if (ms >= start && ms < end && (!result.length || ms > result[result.length - 1])) result.push(ms);
  }
  return result.slice(0, 10000);
}

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
