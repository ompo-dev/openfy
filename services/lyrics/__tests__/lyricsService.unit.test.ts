import {
  createEstimatedLyricSegments,
  isCanonicalLyricsCandidate,
} from '../lyricsService';

describe('createEstimatedLyricSegments', () => {
  it('creates ordered segments within the original track duration', () => {
    const segments = createEstimatedLyricSegments(
      'Linha curta\nLinha com mais palavras para cantar\nÚltima linha',
      120000
    );

    expect(segments).toHaveLength(3);
    expect(segments[0].startTimeMs).toBeGreaterThanOrEqual(0);
    expect(segments[1].startTimeMs).toBeGreaterThan(segments[0].startTimeMs);
    expect(segments[2].endTimeMs).toBe(120000);
  });

  it('does not invent timestamps without a usable duration', () => {
    expect(createEstimatedLyricSegments('Uma linha\nOutra linha', 0)).toEqual(
      []
    );
  });

  it('rejects a different release when a credited title only matches by base title', () => {
    const requestedTitle =
      'ESCANOR - Lucas A.R.T. e Gabriel Rodrigues [Prod. Instinct]';

    expect(
      isCanonicalLyricsCandidate(
        {
          trackName: 'Escanor',
          artistName: '7 Minutoz',
          duration: 246,
        },
        requestedTitle,
        '7 Minutoz',
        255373
      )
    ).toBe(false);

    expect(
      isCanonicalLyricsCandidate(
        {
          trackName: 'Escanor',
          artistName: '7 Minutoz',
          duration: 255,
        },
        requestedTitle,
        '7 Minutoz',
        255373
      )
    ).toBe(true);
  });
});
