import { groupLyricPieces, lyricWordProgress } from '../lyricsTiming';
import { lyricsSearchIdentity } from '../lyricsQuery';
import { getLyricWordRuns } from '../lyricTimeline';

describe('word timing and recording query', () => {
  it('holds across syllable gaps, follows the supplied duration and handles seeks', () => {
    const word = groupLyricPieces([{ text: 'Ho', startTimeMs: 1000, endTimeMs: 1200 },
      { text: 'tel', startTimeMs: 1500, endTimeMs: 1800 }])[0];
    expect(lyricWordProgress(word, 1100)).toBeCloseTo(0.2);
    expect(lyricWordProgress(word, 1350)).toBeCloseTo(0.4);
    expect(lyricWordProgress(word, 1650)).toBeCloseTo(0.7);
    expect(lyricWordProgress(word, 1800)).toBe(1);
    expect(lyricWordProgress(word, 500)).toBe(0);
    expect(lyricWordProgress(word, NaN)).toBe(0);
  });
  it('preserves punctuation, repeated words and spacing in rendering runs', () => {
    expect(getLyricWordRuns('Hello,  Hello!', [{ text: 'Hello', startTimeMs: 1000, endTimeMs: 2000 },
      { text: 'Hello', startTimeMs: 2000, endTimeMs: 3000 }], 1500)).toEqual([
      { text: 'Hello', highlighted: false, progress: 0.5 }, { text: ',  ', highlighted: true, progress: 1 },
      { text: 'Hello', highlighted: false, progress: 0 }, { text: '!', highlighted: true, progress: 1 }]);
  });
  it('normalizes search packaging and primary credits without removing recording versions', () => {
    expect(lyricsSearchIdentity('Foi assim (feat. Rob) [Official Audio]', 'Sotam, Rob, Pulim'))
      .toEqual({ title: 'Foi assim', artist: 'Sotam' });
    expect(lyricsSearchIdentity('Hotel Caro (Acoustic) [Remix]', 'Baco Exu do Blues - Topic'))
      .toEqual({ title: 'Hotel Caro (Acoustic) [Remix]', artist: 'Baco Exu do Blues' });
    expect(lyricsSearchIdentity('Song', 'Simon & Garfunkel')).toEqual({ title: 'Song', artist: 'Simon & Garfunkel' });
  });
});
