import { parseSpotifyLink } from '../linkParser';

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
