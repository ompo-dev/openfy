import { clipDuration, mixDuration, mixTimeline, moveMixClip, splitMixClip, trimMixClip, validateMixClips, type MixClip } from '../mixTimeline';
const clips: MixClip[] = [
  { id: 'a', trackId: 'one', sourceStartMs: 5000, sourceEndMs: 35000, volume: 1 },
  { id: 'b', trackId: 'two', sourceStartMs: 10000, sourceEndMs: 20000, volume: 0.5 },
];
const tracks = [{ spotifyId: 'one', duration_ms: 60000 }, { spotifyId: 'two', duration_ms: 30000 }] as any;

it('joins cuts without carrying removed source time into the composition', () => {
  expect(mixDuration(clips)).toBe(40000);
  expect(mixTimeline(clips).map(({ startMs, endMs }) => [startMs, endMs])).toEqual([[0, 30000], [30000, 40000]]);
  const trimmed = trimMixClip(clips, 'a', 10000, 25000);
  expect(mixTimeline(trimmed)[1].startMs).toBe(15000);
  expect(clips[0].sourceStartMs).toBe(5000);
});
it('splits using the composition cursor, preserving exact source ranges and duration', () => {
  const result = splitMixClip(clips, 'b', 34000);
  expect(result.slice(1).map((clip) => [clip.sourceStartMs, clip.sourceEndMs])).toEqual([[10000, 14000], [14000, 20000]]);
  expect(new Set(result.map((clip) => clip.id)).size).toBe(3);
  expect(mixDuration(result)).toBe(mixDuration(clips));
  expect(splitMixClip(clips, 'a', 50)).toBe(clips);
  expect(splitMixClip(clips, 'b', 40000)).toBe(clips);
});
it('reorders clips without changing sources or durations', () => {
  expect(moveMixClip(clips, 0, 1)).toEqual([clips[1], clips[0]]);
  expect(clipDuration(moveMixClip(clips, 0, 1)[0])).toBe(10000);
  expect(moveMixClip(clips, 0, -1)).toBe(clips);
});
it.each([
  { sourceStartMs: -1 }, { sourceEndMs: 60001 }, { sourceEndMs: 5001 }, { volume: NaN }, { volume: 1.1 }, { trackId: 'absent' },
])('rejects invalid ranges, gains and orphan sources: %o', (update) => {
  expect(() => validateMixClips([{ ...clips[0], ...update }], tracks)).toThrow();
});
it('rejects duplicate clip identities while allowing multiple cuts from a source', () => {
  expect(() => validateMixClips([clips[0], clips[0]], tracks)).toThrow();
  expect(() => validateMixClips([clips[0], { ...clips[0], id: 'copy' }], tracks)).not.toThrow();
});
