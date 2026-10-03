import { findMediaLinkInText, parseSpotifyLink } from '../linkParser';

describe('parseSpotifyLink', () => {
  it('accepts a regional Spotify track URL', () => {
    expect(
      parseSpotifyLink(
        'https://open.spotify.com/intl-pt/track/5b8WiNjA6ihEvaeB9J3eyQ?si=c5e7d143b19048cf'
      )
    ).toEqual({
      platform: 'spotify',
      type: 'track',
      id: '5b8WiNjA6ihEvaeB9J3eyQ',
    });
  });

  it('keeps the exact video from a YouTube share URL with extra parameters', () => {
    expect(
      parseSpotifyLink(
        'https://www.youtube.com/watch?si=share-token&v=4NRXx6U8ABQ&list=RD4NRXx6U8ABQ'
      )
    ).toEqual({
      platform: 'youtube',
      type: 'track',
      id: '4NRXx6U8ABQ',
    });
  });
});

describe('findMediaLinkInText', () => {
  it.each([
    'Check this out: https://open.spotify.com/track/2faP6QUfGN94HI1FTSrpsm?si=abc',
    'https://music.youtube.com/watch?v=abcdefghijk&list=RDabc',
    'https://youtu.be/abcdefghijk?t=12',
  ])('extracts a supported copied link from surrounding text', (text) => {
    expect(findMediaLinkInText(text)).not.toBeNull();
  });

  it('ignores unrelated clipboard contents', () => {
    expect(findMediaLinkInText('hello, no link here')).toBeNull();
  });

  it('continues past unsupported links in copied text', () => {
    expect(
      findMediaLinkInText(
        'https://youtube.com/shorts/abcdefghijk and https://open.spotify.com/track/2faP6QUfGN94HI1FTSrpsm'
      )
    ).toContain('open.spotify.com/track/2faP6QUfGN94HI1FTSrpsm');
  });
});
