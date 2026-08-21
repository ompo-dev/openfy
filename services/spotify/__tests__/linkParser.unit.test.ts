import { parseSpotifyLink } from '../linkParser';

describe('parseSpotifyLink', () => {
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
