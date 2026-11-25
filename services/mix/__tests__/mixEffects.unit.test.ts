import { envelopeGain, gainEnvelope } from '../mixEffects';
import { mixTimeline, snapMixPosition, splitMixClip, trimMixClipAtPosition, validateMixClips, type MixClip } from '../mixTimeline';
const base: MixClip = { id: 'a', trackId: 'a', sourceStartMs: 0, sourceEndMs: 5000, volume: 1, fadeInMs: 1000, fadeOutMs: 500, duckAmount: 0.75 };
const other: MixClip = { id: 'b', trackId: 'b', sourceStartMs: 0, sourceEndMs: 2000, volume: 1, lane: 1, gapBeforeMs: 1500 };
it('applies fades and gently ducks only while another lane overlaps', () => {
  const entries = mixTimeline([base, other]);
  const points = gainEnvelope(entries[0], entries);
  expect(envelopeGain(points, 0)).toBe(0);
  expect(envelopeGain(points, 500)).toBeCloseTo(0.5);
  expect(envelopeGain(points, 1200)).toBe(1);
  expect(envelopeGain(points, 1560)).toBeCloseTo(0.625);
  expect(envelopeGain(points, 2000)).toBeCloseTo(0.25);
  expect(envelopeGain(points, 3500)).toBeCloseTo(1);
  expect(envelopeGain(points, 4750)).toBeCloseTo(0.5);
  expect(envelopeGain(points, 5000)).toBe(0);
  expect(envelopeGain(gainEnvelope(entries[0], [entries[0]]), 2000)).toBe(1);
});
it('retains valid effects and source beat markers after trim and split', () => {
  const source = { ...base, beatsMs: [100, 1000, 3000, 4900] };
  const trimmed = trimMixClipAtPosition([source], 'a', 1000, 4000);
  expect(mixTimeline(trimmed)[0]).toMatchObject({ startMs: 1000, endMs: 4000, beatsMs: [1000, 3000] });
  const [first, last] = splitMixClip([source], 'a', 2000);
  expect(first).toMatchObject({ fadeInMs: 1000, fadeOutMs: 0, beatsMs: [100, 1000] });
  expect(last).toMatchObject({ fadeInMs: 0, fadeOutMs: 500, beatsMs: [3000, 4900] });
  expect(() => validateMixClips([{ ...source, fadeInMs: 6000 }], [{ spotifyId: 'a', duration_ms: 5000 }] as never)).toThrow();
});
it('snaps both moving edges across lanes and to the cursor, but not distant positions', () => {
  const entries = mixTimeline([base, other]);
  expect(snapMixPosition(entries, 'b', 5030, 10000, 0.1)).toEqual({ ms: 5000, guide: 5000 });
  expect(snapMixPosition(entries, 'b', 7960, 10000, 0.1)).toEqual({ ms: 8000, guide: 10000 });
  expect(snapMixPosition(entries, 'b', 7000, 10000, 0.1)).toEqual({ ms: 7000, guide: null });
  expect(snapMixPosition(entries, 'b', 5020, 10000, 0.1, 'end')).toEqual({ ms: 5000, guide: 5000 });
});
