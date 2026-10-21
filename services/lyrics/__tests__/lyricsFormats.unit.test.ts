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
  it.each(['None', undefined])('does not jump to the last verse for an untimed LyricsPlus array (%s)', (type) => {
    expect(parseLyricsPayload({ type, lyrics: [
      { time: 0, duration: 0, text: 'First verse' },
      { time: 0, duration: 0, text: 'Second verse' },
      { time: 0, duration: 0, text: 'Last verse' },
    ] }, 158000)).toEqual({ segments: [], plainLyrics: 'First verse\nSecond verse\nLast verse' });
  });
  it('preserves actual line synchronization including a verse at time zero', () => {
    expect(parseLyricsPayload({ type: 'Line', lyrics: [
      { time: 0, text: 'First verse' }, { time: 5000, text: 'Second verse' },
      { time: 10000, duration: 3000, text: 'Last verse' },
    ] }, 158000)).toEqual({ plainLyrics: 'First verse\nSecond verse\nLast verse', segments: [
      { index: 0, text: 'First verse', startTimeMs: 0, endTimeMs: 5000 },
      { index: 1, text: 'Second verse', startTimeMs: 5000, endTimeMs: 10000 },
      { index: 2, text: 'Last verse', startTimeMs: 10000, endTimeMs: 13000 },
    ] });
  });
  it('accepts clocks and explicit time units but not invalid timing', () => {
    expect(lyricTimeMs(' 27.395 ')).toBe(27395);
    expect(lyricTimeMs('01:02.345')).toBe(62345);
    expect(lyricTimeMs('1:01:02.345')).toBe(3662345);
    expect(lyricTimeMs('500ms')).toBe(500);
    expect(lyricTimeMs(NaN)).toBeNull();
    expect(lyricTimeMs('oops')).toBeNull();
  });
  it('reads decimal TTML and innermost syllables with separate backing vocals', () => {
    const result = parseTtml('<tt><body><p begin="26.136" end="29.000">'
      + '<span begin="26.136" end="28.000"><span begin="26.136" end="26.780">Ho</span>'
      + '<span begin="26.780" end="27.441">tel</span></span> '
      + '<span begin="27.441" end="28.000">caro</span>'
      + '<span ttm:role="x-bg"><span begin="28.000" end="29.000">eco</span></span>'
      + '<span ttm:role="x-translation">translation</span></p></body></tt>');
    expect(result).toEqual([{ index: 0, text: 'Hotel caro', startTimeMs: 26136, endTimeMs: 29000,
      words: [{ text: 'Hotel', startTimeMs: 26136, endTimeMs: 27441, syllables: [
        { text: 'Ho', startTimeMs: 26136, endTimeMs: 26780 }, { text: 'tel', startTimeMs: 26780, endTimeMs: 27441 }] },
      { text: 'caro', startTimeMs: 27441, endTimeMs: 28000 }],
      background: { text: 'eco', startTimeMs: 28000, endTimeMs: 29000,
        words: [{ text: 'eco', startTimeMs: 28000, endTimeMs: 29000 }] } }]);
  });
  it('accepts escaped and JSON-quoted TTML returned by provider envelopes', () => {
    const text = '<tt><body><p begin="13.938" end="16.163"><span begin="13.938" end="16.163">Hello</span></p></body></tt>';
    const expected = parseLyricsPayload(text);
    expect(parseLyricsPayload({ ttml: text })).toEqual(expected);
    expect(parseLyricsPayload(JSON.stringify(text))).toEqual(expected);
    expect(parseLyricsPayload('```xml\n' + text + '\n```')).toEqual(expected);
    expect(parseLyricsPayload(text.replace(/</g, '&lt;').replace(/>/g, '&gt;'))).toEqual(expected);
  });
  it.each(['[1000,2000]Hel(1000,500)lo (1500,500)world(2000,1000)',
    '[1000,2000](1000,500,0)Hel(1500,500,0)lo (2000,1000,0)world'])
    ('groups QRC/YRC syllables without inventing word times: %s', (text) => {
      expect(parseLyricsPayload(text)).toMatchObject({ segments: [{ text: 'Hello world',
        startTimeMs: 1000, endTimeMs: 3000, words: [{ text: 'Hello', startTimeMs: 1000,
          endTimeMs: 2000, syllables: [{ text: 'Hel' }, { text: 'lo' }] }, { text: 'world', startTimeMs: 2000 }] }] });
    });
  it('does not turn invalid TTML begin values into a line starting at zero', () => {
    expect(parseLyricsPayload('<tt><body><p begin="invalid">Hello</p></body></tt>'))
      .toEqual({ plainLyrics: 'Hello', segments: [] });
  });
});
