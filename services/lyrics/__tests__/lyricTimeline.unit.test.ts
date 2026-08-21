import {
  getLyricGapRange,
  getLyricTimelineBlocks,
  moveLyricGap,
  moveLyricSegment,
  resizeLyricGapEnd,
  resizeLyricGapStart,
  resizeLyricSegmentEnd,
  resizeLyricSegmentStart,
} from '../lyricTimeline';

const segments = [
  { index: 0, startTimeMs: 1000, endTimeMs: 2000, text: 'Primeira' },
  { index: 1, startTimeMs: 2000, endTimeMs: 3000, text: 'Segunda' },
  { index: 2, startTimeMs: 3000, endTimeMs: 4000, text: 'Terceira' },
];

describe('lyric timeline', () => {
  it('creates music-note blocks for one-second gaps, including intro and outro', () => {
    expect(
      getLyricTimelineBlocks(
        [
          { index: 0, startTimeMs: 1200, endTimeMs: 2000, text: 'Começa' },
          { index: 1, startTimeMs: 3200, endTimeMs: 4000, text: 'Volta' },
        ],
        5200
      )
    ).toMatchObject([
      { kind: 'gap', startTimeMs: 0, endTimeMs: 1200 },
      { kind: 'lyric', text: 'Começa' },
      { kind: 'gap', startTimeMs: 2000, endTimeMs: 3200 },
      { kind: 'lyric', text: 'Volta' },
      { kind: 'gap', startTimeMs: 4000, endTimeMs: 5200 },
    ]);
  });

  it('treats exactly one second as a silent music block', () => {
    expect(
      getLyricTimelineBlocks(
        [{ index: 0, startTimeMs: 1000, endTimeMs: 1500, text: 'Entra' }],
        1500
      )[0]
    ).toMatchObject({ kind: 'gap', startTimeMs: 0, endTimeMs: 1000 });
  });

  it('moves selected block and all following blocks without overlap', () => {
    expect(moveLyricSegment(segments, 1, 1000, 5000)).toMatchObject([
      { startTimeMs: 1000, endTimeMs: 2000 },
      { startTimeMs: 3000, endTimeMs: 4000 },
      { startTimeMs: 4000, endTimeMs: 5000 },
    ]);

    expect(moveLyricSegment(segments, 1, -2000, 5000)[1]).toMatchObject({
      startTimeMs: 2000,
      endTimeMs: 3000,
    });

    const cappedAtTrackEnd = moveLyricSegment(segments, 1, 9999, 5000);
    expect(moveLyricSegment(cappedAtTrackEnd, 1, -200, 5000)[1]).toMatchObject({
      startTimeMs: 2800,
      endTimeMs: 3800,
    });
  });

  it('resizes selected range and shifts its matching timeline side', () => {
    expect(resizeLyricSegmentEnd(segments, 1, 500, 5000)).toMatchObject([
      { startTimeMs: 1000, endTimeMs: 2000 },
      { startTimeMs: 2000, endTimeMs: 3500 },
      { startTimeMs: 3500, endTimeMs: 4500 },
    ]);
    expect(resizeLyricSegmentStart(segments, 1, -500)).toMatchObject([
      { startTimeMs: 500, endTimeMs: 1500 },
      { startTimeMs: 1500, endTimeMs: 3000 },
      { startTimeMs: 3000, endTimeMs: 4000 },
    ]);
  });

  it('allows editor adjustments to extend past stale track duration metadata', () => {
    expect(resizeLyricSegmentEnd(segments, 1, 3000)).toMatchObject([
      { startTimeMs: 1000, endTimeMs: 2000 },
      { startTimeMs: 2000, endTimeMs: 6000 },
      { startTimeMs: 6000, endTimeMs: 7000 },
    ]);
  });

  it('allows silent music blocks to be selected and adjusted without overlap', () => {
    const withGap = [
      { index: 0, startTimeMs: 1000, endTimeMs: 2000, text: 'Antes' },
      { index: 1, startTimeMs: 4000, endTimeMs: 5000, text: 'Depois' },
      { index: 2, startTimeMs: 5000, endTimeMs: 6000, text: 'Continua' },
    ];
    const target = { previousIndex: 0, nextIndex: 1 };

    expect(getLyricGapRange(withGap, target, 7000)).toEqual({
      startTimeMs: 2000,
      endTimeMs: 4000,
    });
    expect(moveLyricGap(withGap, target, 500, 7000)).toMatchObject([
      { endTimeMs: 2500 },
      { startTimeMs: 4500 },
      { startTimeMs: 5000, endTimeMs: 6000 },
    ]);
    expect(resizeLyricGapStart(withGap, target, 500, 7000)).toMatchObject([
      { startTimeMs: 1500, endTimeMs: 2500 },
      { startTimeMs: 4000 },
      { startTimeMs: 5000, endTimeMs: 6000 },
    ]);
    expect(resizeLyricGapEnd(withGap, target, -500, 7000)).toMatchObject([
      { endTimeMs: 2000 },
      { startTimeMs: 3500, endTimeMs: 4500 },
      { startTimeMs: 4500, endTimeMs: 5500 },
    ]);
  });

  it('extends an intro music block by moving every following verse intact', () => {
    const afterIntro = [
      { index: 0, startTimeMs: 16000, endTimeMs: 24000, text: 'Primeiro' },
      { index: 1, startTimeMs: 24000, endTimeMs: 32000, text: 'Segundo' },
    ];

    expect(
      resizeLyricGapEnd(
        afterIntro,
        { previousIndex: null, nextIndex: 0 },
        8000,
        60000
      )
    ).toMatchObject([
      { startTimeMs: 24000, endTimeMs: 32000 },
      { startTimeMs: 32000, endTimeMs: 40000 },
    ]);
  });
});
