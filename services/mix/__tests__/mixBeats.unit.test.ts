import { detectMixBeats, trackMixRhythm } from '../mixBeats';
it('detects real transient positions and does not invent markers for silence', () => {
  const peaks = Array.from({ length: 1000 }, () => 0.05);
  for (const index of [100, 150, 200, 250, 300]) peaks[index] = 0.9;
  expect(detectMixBeats(peaks, 10000, 0, 10000, 'less')).toEqual([1000, 1500, 2000, 2500, 3000]);
  expect(detectMixBeats(peaks, 10000, 1500, 3000, 'more')).toEqual([1500, 2000, 2500]);
  expect(detectMixBeats(peaks, 10000, 0, 10000, 'off')).toEqual([]);
  expect(detectMixBeats(Array(1000).fill(0), 10000, 0, 10000, 'more')).toEqual([]);
});
it('allows denser percussive markers in more mode', () => {
  const peaks = Array(1000).fill(0);
  for (const index of [100, 120, 140, 160]) peaks[index] = 0.8;
  expect(detectMixBeats(peaks, 10000, 0, 10000, 'more')).toHaveLength(4);
  expect(detectMixBeats(peaks, 10000, 0, 10000, 'less')).toHaveLength(2);
});

it.each([375, 500, 750])('tracks a %i ms pulse against syncopated high-frequency distractions', (period) => {
  const bands = Array(3600 * 3).fill(0.025);
  const expected: number[] = [];
  for (let ms = 1000; ms < 30000; ms += period) {
    const frame = Math.round(ms / 10);
    expected.push(frame * 10);
    bands[frame * 3] = 0.75;
    bands[frame * 3 + 1] = 0.3;
    const off = frame + Math.round(period / 20);
    bands[off * 3 + 2] = 0.75;
  }
  const result = trackMixRhythm({ hopMs: 10, bands }, 0, 36000, 'less');
  const matched = result.filter((ms) => expected.some((beat) => Math.abs(beat - ms) <= 20)).length;
  expect(matched / expected.length).toBeGreaterThanOrEqual(0.95);
  expect(matched / result.length).toBeGreaterThanOrEqual(0.95);
  expect(trackMixRhythm({ hopMs: 10, bands }, 0, 36000, 'more').length).toBeGreaterThan(result.length);
});
it('does not generate phantom beats on steady or silent audio', () => {
  expect(trackMixRhythm({ hopMs: 10, bands: Array(3000).fill(0.4) }, 0, 10000, 'less')).toEqual([]);
  expect(trackMixRhythm({ hopMs: 10, bands: Array(3000).fill(0) }, 0, 10000, 'more')).toEqual([]);
});
