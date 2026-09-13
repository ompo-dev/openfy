jest.mock('../directYouTubeResolver', () => ({
  resolveDirectYouTubeAudio: jest.fn(),
  getDirectYouTubeMediaHeaders: jest.fn().mockReturnValue(null),
}));

import { getPlayableAudioUrl, resolveAudioUrl } from '../audioResolver';
import { resolveDirectYouTubeAudio } from '../directYouTubeResolver';

const directYouTubeMock = resolveDirectYouTubeAudio as jest.Mock;

describe('getPlayableAudioUrl', () => {
  it('keeps provider streams direct on device', () => {
    expect(getPlayableAudioUrl('https://r1.googlevideo.com/audio.m4a')).toBe(
      'https://r1.googlevideo.com/audio.m4a'
    );
  });

  it('unwraps legacy saved URLs without creating a proxy request', () => {
    expect(
      getPlayableAudioUrl(
        'https://legacy.openfy.local/stream?url=https%3A%2F%2Fcf-media.sndcdn.com%2Ftrack.mp3'
      )
    ).toBe('https://cf-media.sndcdn.com/track.mp3');
  });
});

describe('resolveAudioUrl', () => {
  beforeEach(() => {
    directYouTubeMock.mockReset();
    directYouTubeMock.mockResolvedValue(null);
    global.fetch = jest.fn();
  });

  it('uses a client-resolved stream directly', async () => {
    directYouTubeMock.mockResolvedValueOnce({
      videoId: 'V1M1hYxmRvA',
      url: 'https://rr4.googlevideo.com/videoplayback?itag=140',
      format: 'm4a',
    });

    await expect(
      resolveAudioUrl('Mafioso', 'ÉoDan', 'spotify_id', 237000)
    ).resolves.toMatchObject({
      source: 'youtube',
      url: 'https://rr4.googlevideo.com/videoplayback?itag=140',
    });
    expect(directYouTubeMock).toHaveBeenCalledWith({
      artist: 'ÉoDan',
      durationMs: 237000,
      fresh: false,
      title: 'Mafioso',
      spotifyId: 'spotify_id',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not fall back to a server for an exact YouTube id', async () => {
    await expect(
      resolveAudioUrl(
        'Faixa canônica',
        'Artista canônico',
        'yt_12345678901',
        180000
      )
    ).resolves.toBeNull();

    expect(directYouTubeMock).toHaveBeenCalledWith({
      videoId: '12345678901',
      fresh: false,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
