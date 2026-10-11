import {
  parseLrcToSegments,
  isCanonicalLyricsCandidate,
} from '../lyricsService';

describe('provider lyric parsing and identity', () => {
  it('preserves repeated line timestamps and supplied word timing', () => {
    expect(parseLrcToSegments('[00:01.0][00:10.50]Again\n[00:20.00]<00:20.00>Hello <00:21.00>world', 23000))
      .toMatchObject([{ startTimeMs: 1000, text: 'Again' }, { startTimeMs: 10500, text: 'Again' },
        { startTimeMs: 20000, text: 'Hello world', words: [
          { startTimeMs: 20000, endTimeMs: 21000 }, { startTimeMs: 21000, endTimeMs: 23000 }] }]);
  });

  it('does not invent timestamps without a usable duration', () => {
    expect(parseLrcToSegments('Uma linha\nOutra linha', 120000)).toEqual(
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
