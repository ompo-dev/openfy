import { positionAtOffset, timelineScale, trimAtOffset } from '../MixTimelineEditor';

const clip = { id: 'clip', trackId: 'one', sourceStartMs: 1000, sourceEndMs: 5000, volume: 1 };
it('maps scroll offsets to a bounded playhead position at any zoom', () => {
  const scale = timelineScale(1, 60000);
  expect(positionAtOffset(2000 * scale, scale, 60000)).toBe(2000);
  expect(positionAtOffset(-5, scale, 60000)).toBe(0);
  expect(positionAtOffset(100000 * scale, scale, 60000)).toBe(60000);
  expect(timelineScale(2, 60000)).toBeCloseTo(scale * 2);
  expect(timelineScale(24, 60000)).toBeCloseTo(timelineScale(8, 60000) * 3);
  expect(timelineScale(0, 60000)).toBeCloseTo(timelineScale(0.0625, 60000) / 3);
  expect(timelineScale(8, 10000000) * 10000000).toBeLessThanOrEqual(500000);
});
it('trims either handle without crossing source boundaries or minimum clip duration', () => {
  expect(trimAtOffset(clip, 'start', 20, 0.02, 10000)).toEqual([2000, 5000]);
  expect(trimAtOffset(clip, 'start', 1000, 0.02, 10000)).toEqual([4900, 5000]);
  expect(trimAtOffset(clip, 'end', -1000, 0.02, 10000)).toEqual([1000, 1100]);
  expect(trimAtOffset(clip, 'end', 1000, 0.02, 10000)).toEqual([1000, 10000]);
  expect(trimAtOffset(clip, 'start', -1000, 0.02, 10000)).toEqual([0, 5000]);
});
