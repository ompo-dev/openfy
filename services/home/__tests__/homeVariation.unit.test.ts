import { interleaveHomeSections, preferUnseenHomeTracks, rotateHomeCandidates, spreadHomeReleases } from '../homeVariation';

it('interleaves section families and keeps every entry', () => {
  const groups = [6, 5, 4, 3, 1, 1].map((count, kind) => ({ kind: `${kind}`,
    items: Array.from({ length: count }, (_, index) => `${kind}:${index}`) }));
  const sections = interleaveHomeSections(groups, (_kind, items) => items.join(','));
  expect(sections).toHaveLength(20);
  expect(new Set(sections).size).toBe(20);
  sections.slice(1).forEach((section, index) => expect(section[0]).not.toBe(sections[index][0]));
  expect(groups[0].items).toHaveLength(6);
});

it('consolidates a sparse tail instead of producing repeated adjacent sections', () => {
  const sections = interleaveHomeSections([{ kind: 'radio', items: ['r1', 'r2', 'r3', 'r4'] },
    { kind: 'artists', items: ['a1'] }], (_kind, items) => items.join(','));
  expect(sections).toEqual(['r1', 'a1', 'r2,r3,r4']);
  expect(interleaveHomeSections([], (_kind, items) => items.join(','))).toEqual([]);
});

it('separates visually identical release and radio rails, including an unbalanced tail', () => {
  const groups = [
    ['releases', 'large', 5], ['spotlight', 'spotlight', 3], ['radio', 'large', 5],
    ['most-played', 'rows', 1], ['discoveries', 'compact', 4], ['artists', 'portraits', 1],
  ].map(([kind, layout, count]) => ({ kind: String(kind), layout: String(layout),
    items: Array.from({ length: Number(count) }, (_, i) => ({ layout: String(layout), ids: [`${kind}:${i}`] })) }));
  const sections = interleaveHomeSections(groups, (_kind, items) => ({ layout: items[0].layout, ids: items.flatMap((item) => item.ids) }));
  sections.slice(1).forEach((section, i) => expect(section.layout).not.toBe(sections[i].layout));
  expect(sections.flatMap((section) => section.ids).sort()).toEqual(groups.flatMap((group) => group.items.flatMap((item) => item.ids)).sort());
  expect(sections.slice(0, 6).map((section) => section.ids[0])).toEqual([
    'releases:0', 'spotlight:0', 'radio:0', 'most-played:0', 'discoveries:0', 'artists:0',
  ]);
  expect(groups[0].items).toHaveLength(5);
});

it('keeps a large-only fallback in one mixed rail without losing any recommendations', () => {
  const merge = jest.fn((_kind, items: string[]) => items.join(','));
  expect(interleaveHomeSections([
    { kind: 'releases', layout: 'large', items: ['release1', 'release2'] },
    { kind: 'radio', layout: 'large', items: ['radio1', 'radio2'] },
  ], merge)).toEqual(['release1,release2,radio1,radio2']);
  expect(merge).toHaveBeenCalledWith('mixed', ['release1', 'release2', 'radio1', 'radio2']);
});

it('spreads release artists and varies older candidates without inventing release dates', () => {
  const releases = ['a', 'a', 'a', 'b', 'b', 'c'].map((artistId, index) => ({ artistId, id: `${index}` }));
  expect(spreadHomeReleases(releases).map((item) => item.id)).toEqual(['0', '3', '5', '1', '4', '2']);
  expect(spreadHomeReleases(releases, 1).map((item) => item.id)).toEqual(['0', '3', '5', '2', '4', '1']);
});

it('prioritizes unseen tracks and rotates actual candidates with a stable fallback', () => {
  const tracks = ['old', 'new', 'older'].map((spotifyId) => ({ spotifyId }));
  expect(preferUnseenHomeTracks(tracks, new Set(['old', 'older'])).map((track) => track.spotifyId)).toEqual(['new', 'old', 'older']);
  expect(rotateHomeCandidates(tracks, 1).map((track) => track.spotifyId)).toEqual(['new', 'older', 'old']);
  expect(rotateHomeCandidates([], 2)).toEqual([]);
});
