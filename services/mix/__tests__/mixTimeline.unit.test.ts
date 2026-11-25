import { applyMixGroupEffects, insertMixGroupCopy, moveMixGroup, slipMixGroup, trimMixGroup, clipDuration, compactMixLanes, insertMixClipCopy, mixDuration, mixTimeline, moveMixClip, placeMixClip, replaceMixClipSource, slipMixClip, splitMixClip, trimMixClip, validateMixClips, type MixClip } from '../mixTimeline';
const clips: MixClip[] = [
  { id: 'a', trackId: 'one', sourceStartMs: 5000, sourceEndMs: 35000, volume: 1 },
  { id: 'b', trackId: 'two', sourceStartMs: 10000, sourceEndMs: 20000, volume: 0.5 },
];
const tracks = [{ spotifyId: 'one', duration_ms: 60000 }, { spotifyId: 'two', duration_ms: 30000 }] as any;

it('slips and trims selected sources by a common offset limited by every source', () => {
  const ids = new Set(['a','b']);
  const durations = (id: string) => id === 'one' ? 60000 : 30000;
  const slipped = slipMixGroup(clips, ids, 'a', 25000, durations);
  expect(slipped.map(c => [c.sourceStartMs,c.sourceEndMs])).toEqual([[15000,45000],[20000,30000]]);
  expect(mixDuration(slipped)).toBe(mixDuration(clips));
  const trimmed = trimMixGroup(clips, ids, 'a', [5000,50000], durations);
  expect(trimmed.map(c => c.sourceEndMs)).toEqual([45000,30000]);
  validateMixClips(trimmed, tracks);
});

it('moves and copies a group without changing relative placement or unrelated clips', () => {
  const layered = [clips[0], { ...clips[1], lane: 1, gapBeforeMs: 5000 }, { ...clips[0], id: 'c', lane: 2 }];
  const ids = new Set(['a','b']);
  const moved = moveMixGroup(layered, ids, 'a', 0, 2000);
  expect(mixTimeline(moved).map(c => [c.id,c.lane,c.startMs])).toEqual([['a',0,2000],['b',1,7000],['c',2,0]]);
  expect(moveMixGroup(layered, ids, 'a', 1, 0)).toBe(layered);
  const copied = insertMixGroupCopy(layered, mixTimeline(layered).filter(c => ids.has(c.id)), ['d','e'], 0);
  expect(mixTimeline(copied).filter(c => ['d','e'].includes(c.id)).map(c => [c.id,c.lane,c.startMs])).toEqual([['d',0,30000],['e',1,35000]]);
  validateMixClips(copied, tracks);
});
it('clamps shared fades per clip without changing other effect values', () => {
  const result = applyMixGroupEffects([{ ...clips[0], fadeOutMs: 5000 }, clips[1]], new Set(['a','b']), { fadeInMs: 28000 });
  expect(result.map(c => c.fadeInMs)).toEqual([25000,10000]);
  expect(result[0].fadeOutMs).toBe(5000);
  validateMixClips(result, tracks);
});

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

it('slides a 30-second clip inside a 90-second source without moving any timeline boundaries or effects', () => {
  const original = [{ ...clips[0], volume: 0.6, fadeInMs: 500, fadeOutMs: 1000, duckAmount: 0.4, beatsMs: [10000, 20000, 30000] }, clips[1]];
  const result = slipMixClip(original, 'a', 25000, 90000);
  expect(mixTimeline(result)[0]).toMatchObject({ startMs: 0, endMs: 30000, sourceStartMs: 25000, sourceEndMs: 55000, volume: 0.6, fadeInMs: 500, fadeOutMs: 1000, duckAmount: 0.4, beatsMs: [30000] });
  expect(mixTimeline(result)[1]).toEqual(mixTimeline(original)[1]);
  expect(slipMixClip(original, 'a', 999999, 90000)[0]).toMatchObject({ sourceStartMs: 60000, sourceEndMs: 90000 });
  expect(slipMixClip(original, 'a', -10, 90000)[0]).toMatchObject({ sourceStartMs: 0, sourceEndMs: 30000 });
  expect(slipMixClip(original, 'a', 10000, 20000)[0]).toBe(original[0]);
});
it('replaces only the source while retaining timing and fitting effects if the new song is shorter', () => {
  const original = [{ ...clips[0], fadeInMs: 20000, fadeOutMs: 10000, beatsMs: [10000] }, clips[1]];
  const replacement = replaceMixClipSource(original, 'a', { spotifyId: 'new', duration_ms: 90000 } as any);
  expect(mixTimeline(replacement)[0]).toMatchObject({ id: 'a', trackId: 'new', startMs: 0, endMs: 30000, sourceStartMs: 0, sourceEndMs: 30000, fadeInMs: 20000, fadeOutMs: 10000 });
  expect(replacement[0].beatsMs).toBeUndefined();
  const shorter = replaceMixClipSource(original, 'a', { spotifyId: 'new', duration_ms: 15000 } as any);
  expect(shorter[0]).toMatchObject({ sourceEndMs: 15000, fadeInMs: 15000, fadeOutMs: 0 });
  expect(mixTimeline(shorter)[1].startMs).toBe(30000);
});
it('pastes at the cursor and duplicates into the next free interval, preserving effects and existing positions', () => {
  const source = { ...clips[0], fadeInMs: 2000, beatsMs: [10000] };
  const original = [source, clips[1]];
  const pasted = insertMixClipCopy(original, source, 'paste', 1, 12000);
  expect(mixTimeline(pasted).find((item) => item.id === 'paste')).toMatchObject({ lane: 1, startMs: 12000, endMs: 42000, sourceStartMs: 5000, fadeInMs: 2000, beatsMs: [10000] });
  expect(pasted.find((item) => item.id === 'paste')?.beatsMs).not.toBe(source.beatsMs);
  const duplicate = insertMixClipCopy(original, source, 'duplicate', 0, 30000, true);
  expect(mixTimeline(duplicate).find((item) => item.id === 'duplicate')).toMatchObject({ startMs: 40000, endMs: 70000 });
  expect(mixTimeline(duplicate).find((item) => item.id === 'b')?.startMs).toBe(30000);
});
