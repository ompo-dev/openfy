import { fadeGain } from './mixEffects';
// Geometry is anchored to source time, never to the moving viewport.
export const WAVE_TILE = 256;
type Point = [number, number];
const fmt = (n: number) => n.toFixed(2);
export function smoothWavePath(points: Point[], move = true): string {
  if (!points.length) return '';
  let path = (move ? 'M' : 'L') + points[0].map(fmt).join(' ');
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], mid = (a[0] + b[0]) / 2;
    // Horizontal tangents avoid overshooting the measured amplitude.
    path += `C${fmt(mid)} ${fmt(a[1])} ${fmt(mid)} ${fmt(b[1])} ${fmt(b[0])} ${fmt(b[1])}`;
  }
  return path;
}
export function waveformTileIndices(startPx: number, endPx: number, fullWidth: number): number[] {
  if (fullWidth <= 0 || endPx <= startPx) return [];
  const first = Math.max(0, Math.floor(startPx / WAVE_TILE) - 1);
  const last = Math.min(Math.ceil(fullWidth / WAVE_TILE) - 1, Math.floor(endPx / WAVE_TILE) + 1);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
}
export function waveTilePath(peaks: number[], duration: number, sourceStart: number, scale: number,
  tile: number, width: number, height: number, symmetric = false): string {
  if (!peaks.length || duration <= 0 || scale <= 0 || width <= 0) return '';
  const sample = (px: number) => {
    const index = Math.max(0, Math.min(peaks.length - 1, (sourceStart + px / scale) / duration * peaks.length - 0.5));
    const i = Math.floor(index), f = index - i;
    let value = peaks[i] * (1 - f) + peaks[Math.min(i + 1, peaks.length - 1)] * f;
    // At low zoom use a fixed source-aligned RMS neighbourhood to preserve
    // transients without aliasing as the viewport moves.
    const radius = Math.floor(1.5 / scale / duration * peaks.length);
    if (radius > 1) {
      const lo = Math.max(0, i - radius), hi = Math.min(peaks.length - 1, i + radius);
      let energy = 0;
      for (let j = lo; j <= hi; j++) energy += peaks[j] * peaks[j];
      value = Math.sqrt(energy / (hi - lo + 1));
    }
    return Math.max(0, Math.min(1, value));
  };
  const base = symmetric ? height / 2 : height;
  const top = height * 0.46;
  const xs = Array.from({ length: Math.ceil(width / 3) + 1 }, (_, i) => Math.min(width, i * 3));
  const points: Point[] = xs.map((x) => [x, base - sample(tile * WAVE_TILE + x) * top]);
  let path = smoothWavePath(points);
  if (symmetric) path += smoothWavePath(points.slice().reverse().map(([x,y]) => [x, height - y]), false);
  else path += `L${fmt(width)} ${base} L0 ${base}`;
  return path + 'Z';
}
export function fadeShadePath(tileStart: number, width: number, height: number, duration: number, scale: number, fadeIn: number, fadeOut: number): string {
  if ((!fadeIn && !fadeOut) || scale <= 0 || width <= 0) return '';
  const gain = (x: number) => {
    const ms = (tileStart + x) / scale;
    return fadeGain(ms, duration, fadeIn, fadeOut);
  };
  const boundaries = [0, width, fadeIn * scale - tileStart, (duration - fadeOut) * scale - tileStart]
    .filter((x) => x >= 0 && x <= width);
  for (let i = 1; i < 32; i++) {
    for (const x of [fadeIn * i / 32 * scale - tileStart, (duration - fadeOut * i / 32) * scale - tileStart]) {
      if (x > 0 && x < width) boundaries.push(x);
    }
  }
  const xs = [...new Set([...boundaries, ...Array.from({ length: Math.ceil(width / 5) }, (_, i) => i * 5)])].sort((a,b) => a-b);
  // Join the sampled sinusoid rather than flattening every intermediate tangent.
  return xs.map((x, i) => `${i ? 'L' : 'M'}${fmt(x)} ${fmt(height * (1 - gain(x)))}`).join('') + `L${fmt(width)} 0 L0 0Z`;
}
export const darkenWaveColor = (hex: string) => '#' + [1,3,5].map((i) => Math.round(parseInt(hex.slice(i,i+2),16) * 0.53).toString(16).padStart(2,'0')).join('');

export function visibleBeatMarkers(beats: number[], sourceStart: number, sourceEnd: number, scale: number, visibleStart: number, visibleEnd: number): number[] {
  const result: number[] = [];
  let lastPx = -Infinity;
  for (const beat of beats) {
    if (beat < sourceStart || beat >= sourceEnd) continue;
    const px = (beat - sourceStart) * scale;
    if (px < visibleStart || px > visibleEnd || px - lastPx < 5) continue;
    result.push(beat); lastPx = px;
  }
  return result;
}
