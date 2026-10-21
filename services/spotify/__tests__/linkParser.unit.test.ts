import { findMediaLinkInText, getTrackYouTubeVideoId, parseSpotifyLink } from '../linkParser';

describe('getTrackYouTubeVideoId', () => {
  it.each([
    { youtubeVideoId: 'abcdefghijk' }, { videoId: 'abcdefghijk' }, { spotifyId: 'yt_abcdefghijk' },
    { youtubeUrl: 'https://youtu.be/abcdefghijk?t=12' },
    { youtubeUrl: 'https://music.youtube.com/watch?list=RDtest&v=abcdefghijk' },
    { youtubeUrl: 'https://m.youtube.com/watch?v=abcdefghijk' },
    { youtubeUrl: 'https://youtube.com/shorts/abcdefghijk' },
    { youtubeVideoId: 'invalid', youtubeUrl: 'https://www.youtube.com/embed/abcdefghijk' },
  ])('uses the recording reference without losing its video ID: %o', (track) => {
    expect(getTrackYouTubeVideoId(track)).toBe('abcdefghijk');
  });
  it.each([
    { spotifyId: 'abcdefghijklmnopqrstuv' }, { id: 'abcdefghijk' },
    { youtubeUrl: 'https://youtube.com/playlist?list=abcdefghijk' },
    { youtubeUrl: 'https://evil.test/watch?v=abcdefghijk' },
  ])('does not turn a different resource into a video: %o', (track) => {
    expect(getTrackYouTubeVideoId(track)).toBeUndefined();
  });
});

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
        'https://youtube.com/@artist and https://open.spotify.com/track/2faP6QUfGN94HI1FTSrpsm'
      )
    ).toContain('open.spotify.com/track/2faP6QUfGN94HI1FTSrpsm');
  });
});
