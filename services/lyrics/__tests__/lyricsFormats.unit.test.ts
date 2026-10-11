import { lyricTimeMs, parseLyricsPayload, parseTtml } from '../lyricsFormats';

describe('lyric provider formats', () => {
  it('preserves actual TTML line and word times, text and entities', () => {
    expect(parseTtml('<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1s" end="3s"><span begin="1s" end="2s">Hello</span> <span begin="2s" end="3s">world &amp; you</span></p></div></body></tt>'))
      .toEqual([{ index: 0, text: 'Hello world & you', startTimeMs: 1000, endTimeMs: 3000, words: [
        { text: 'Hello', startTimeMs: 1000, endTimeMs: 2000 }, { text: 'world & you', startTimeMs: 2000, endTimeMs: 3000 }] }]);
  });
  it('does not invent times for plain text or untimed TTML', () => {
    expect(parseLyricsPayload('First line\nSecond line', 180000)).toEqual({ plainLyrics: 'First line\nSecond line', segments: [] });
    expect(parseLyricsPayload('<tt><body><p>Hello world</p></body></tt>')).toEqual({ plainLyrics: 'Hello world', segments: [] });
    expect(parseLyricsPayload('<tt><body><p>First</p><p>Second</p></body></tt>')).toEqual({ plainLyrics: 'First\nSecond', segments: [] });
  });
  it('accepts LRC metadata before timestamps and JSON arrays of plain lines', () => {
    expect(parseLyricsPayload('[ar:Artist]\n[offset:500]\n[00:01.00]Hello', 3000))
      .toMatchObject({ segments: [{ text: 'Hello', startTimeMs: 1500 }] });
    expect(parseLyricsPayload('["First", "Second"]')).toEqual({ plainLyrics: 'First\nSecond', segments: [] });
    expect(parseLyricsPayload('[Chorus]\nPlain line')).toEqual({ plainLyrics: '[Chorus]\nPlain line', segments: [] });
    expect(parseLyricsPayload('[ar:Artist]\n[ti:Title]')).toBeNull();
  });
  it('rejects provider errors and unsafe XML documents', () => {
    expect(parseLyricsPayload('<html><body>502</body></html>')).toBeNull();
    expect(parseLyricsPayload({ isError: true, lyrics: 'Error content' })).toBeNull();
    expect(parseLyricsPayload('<!DOCTYPE tt [<!ENTITY x SYSTEM "file:///secret">]><tt><p>&x;</p></tt>')).toBeNull();
    expect(parseLyricsPayload({ data: { response: { result: { lrc: '[00:01.0]Hello' } } } })).toMatchObject({ segments: [{ text: 'Hello' }] });
  });
  it('reads LyricsPlus millisecond syllable stamps without estimating duration', () => {
    expect(parseLyricsPayload({ lyrics: [{ time: 1000, duration: 2000, syllabus: [
      { time: 1000, duration: 500, text: 'Hello ' }, { time: 1500, duration: 1500, text: 'world' }] }] }))
      .toMatchObject({ segments: [{ text: 'Hello world', startTimeMs: 1000, endTimeMs: 3000,
        words: [{ startTimeMs: 1000, endTimeMs: 1500 }, { startTimeMs: 1500, endTimeMs: 3000 }] }] });
  });
  it('accepts clocks and explicit time units but not invalid timing', () => {
    expect(lyricTimeMs('01:02.345')).toBe(62345);
    expect(lyricTimeMs('1:01:02.345')).toBe(3662345);
    expect(lyricTimeMs('500ms')).toBe(500);
    expect(lyricTimeMs(NaN)).toBeNull();
    expect(lyricTimeMs('oops')).toBeNull();
  });
});
