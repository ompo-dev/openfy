import { darkenWaveColor, fadeShadePath, smoothWavePath, waveformTileIndices, waveTilePath } from '../mixWaveformGeometry';

it('uses stable overlapping tiles with identical geometry across viewport shifts', () => {
  const first = waveformTileIndices(256, 580, 2000);
  const second = waveformTileIndices(260, 584, 2000);
  expect(first).toEqual(second);
  const peaks = [0.2, 0.8, 0.4, 0.1, 0.9];
  const path = waveTilePath(peaks, 10000, 0, 0.2, 1, 256, 42);
  expect(path).toEqual(waveTilePath(peaks, 10000, 0, 0.2, 1, 256, 42));
  expect(path).toContain('C');
  expect(path).toMatch(/L256\.00 42 L0 42Z$/);
  expect(path).not.toMatch(/NaN|Infinity/);
});
it('uses curved filled lower waveforms and a matching symmetric beat waveform', () => {
  expect(smoothWavePath([[0,10],[3,5]])).toBe('M0.00 10.00C1.50 10.00 1.50 5.00 3.00 5.00');
  const path = waveTilePath([1,1], 1000, 0, 0.1, 0, 100, 42);
  expect(path).toContain('22.68');
  expect(waveTilePath([0.5,0.5], 1000, 0, 0.1, 0, 100, 100, true)).toContain('L100.00 73.00');
  expect(darkenWaveColor('#C000A4')).toBe('#660057');
});
it('draws fade-in and fade-out over the correct ends of the actual trimmed clip', () => {
  const first = fadeShadePath(0, 100, 42, 10000, 0.1, 1000, 1000);
  const last = fadeShadePath(900, 100, 42, 10000, 0.1, 1000, 1000);
  expect(first).toMatch(/^M0\.00 42\.00/);
  expect(first).toContain('L25.00 35.85');
  expect(first).toContain('L75.00 6.15');
  expect(last).toMatch(/^M0\.00 0\.00/);
  expect(last).toContain('100.00 42.00');
  expect(fadeShadePath(0, 100, 42, 10000, 0.1, 0, 0)).toBe('');
});
