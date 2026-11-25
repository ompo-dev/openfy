import { detectMixBeats } from '../mixBeats';
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
