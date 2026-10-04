jest.mock('../directYouTubeResolver', () => ({
  resolveDirectYouTubeAudio: jest.fn(),
  getDirectYouTubeMediaHeaders: jest.fn().mockReturnValue(null),
}));
jest.mock('../catalogResolver', () => ({
  resolveCatalogYouTubeVideoId: jest.fn(async ({ videoId }: { videoId: string }) => ({
    status: 'resolved', videoId, confidence: 100,
  })),
}));

import { getPlayableAudioUrl, resolveAudioUrl } from '../audioResolver';
import { resolveDirectYouTubeAudio } from '../directYouTubeResolver';
import { resolveCatalogYouTubeVideoId } from '../catalogResolver';

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
    jest.mocked(resolveCatalogYouTubeVideoId).mockReset().mockImplementation(async ({ videoId }) => ({
      status: 'resolved', videoId, confidence: 100,
    }));
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
      quality: 'high',
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
      quality: 'high',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('plays the corrected individual source rather than the catalog film id', async () => {
    jest.mocked(resolveCatalogYouTubeVideoId).mockResolvedValue({
      status: 'resolved', videoId: '9ld721cY0Uk', confidence: 100,
    });
    directYouTubeMock.mockResolvedValue({ videoId: '9ld721cY0Uk', url: 'https://media.test/madruga.m4a', format: 'm4a' });
    expect(await resolveAudioUrl('Tres da Madruga', 'Yago Oproprio', 'yt_9jqQYznGl-w', 150000))
      .toMatchObject({ videoId: '9ld721cY0Uk' });
    expect(directYouTubeMock).toHaveBeenCalledWith({ videoId: '9ld721cY0Uk', fresh: false, quality: 'high' });
  });

  it('does not play the film when source verification fails', async () => {
    jest.mocked(resolveCatalogYouTubeVideoId).mockResolvedValue({ status: 'not_found', reason: 'no_canonical_match' });
    expect(await resolveAudioUrl('Tres da Madruga', 'Yago Oproprio', 'yt_9jqQYznGl-w', 150001)).toBeNull();
    expect(directYouTubeMock).not.toHaveBeenCalled();
  });
});
