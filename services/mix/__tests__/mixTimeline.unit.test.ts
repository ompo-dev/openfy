import { clipDuration, compactMixLanes, mixDuration, mixTimeline, moveMixClip, placeMixClip, splitMixClip, trimMixClip, validateMixClips, type MixClip } from '../mixTimeline';
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

it('overlaps lanes while concatenating cuts within each lane, including legacy clips', () => {
  const layered = [...clips, { ...clips[0], id: 'layer', lane: 1 }];
  expect(mixTimeline(layered).map(({ lane, startMs, endMs }) => [lane, startMs, endMs]))
    .toEqual([[0, 0, 30000], [0, 30000, 40000], [1, 0, 30000]]);
  expect(mixDuration(layered)).toBe(40000);
  expect(mixTimeline(trimMixClip(layered, 'a', 5000, 15000))[2].startMs).toBe(0);
  expect(() => validateMixClips([{ ...clips[0], lane: 8 }], tracks)).toThrow();
});

it('moves a clip freely in time and to another lane without moving other clips or losing source cuts', () => {
  const moved = placeMixClip(clips, 'a', 1, 12000);
  expect(mixTimeline(moved).find((clip) => clip.id === 'a')).toMatchObject({
    lane: 1, startMs: 12000, endMs: 42000, sourceStartMs: 5000, sourceEndMs: 35000, volume: 1,
  });
  expect(mixTimeline(moved).find((clip) => clip.id === 'b')).toMatchObject({ lane: 0, startMs: 30000, endMs: 40000 });
  const again = placeMixClip(moved, 'a', 0, 50000);
  expect(mixTimeline(again).find((clip) => clip.id === 'a')).toMatchObject({ startMs: 50000, endMs: 80000, lane: 0 });
  expect(mixDuration(again)).toBe(80000);
  expect(() => validateMixClips(again, tracks)).not.toThrow();
});

it('snaps overlapping drops to the nearest free interval and preserves gaps during splitting', () => {
  const moved = placeMixClip(clips, 'b', 0, 15000);
  expect(mixTimeline(moved).find((clip) => clip.id === 'b')?.startMs).toBe(30000);
  const gapped = placeMixClip(clips, 'b', 0, 40000);
  expect(mixTimeline(gapped)[1].startMs).toBe(40000);
  const split = splitMixClip(gapped, 'b', 45000);
  expect(mixTimeline(split).map((clip) => [clip.startMs, clip.endMs])).toEqual([[0, 30000], [40000, 45000], [45000, 50000]]);
  expect(() => validateMixClips([{ ...clips[0], gapBeforeMs: -1 }], tracks)).toThrow();
});

it('compacts empty lanes while retaining timing, including placement beyond the former audio end', () => {
  const moved = placeMixClip(clips, 'a', 5, 90000);
  const compact = compactMixLanes(moved);
  expect(mixTimeline(compact).find((clip) => clip.id === 'a')).toMatchObject({ lane: 1, startMs: 90000, endMs: 120000 });
  expect(mixTimeline(compact).find((clip) => clip.id === 'b')).toMatchObject({ lane: 0, startMs: 30000, endMs: 40000 });
  expect(mixDuration(compact)).toBe(120000);
});
