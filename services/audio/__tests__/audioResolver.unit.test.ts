jest.mock('@config', () => ({
  MUSIC_SERVER_URL: 'http://192.168.100.27:3001',
}));

jest.mock('../directYouTubeResolver', () => ({
  resolveDirectYouTubeAudio: jest.fn(),
}));

import { getPlayableAudioUrl, resolveAudioUrl } from '../audioResolver';
import { resolveDirectYouTubeAudio } from '../directYouTubeResolver';

const directYouTubeMock = resolveDirectYouTubeAudio as jest.Mock;

describe('getPlayableAudioUrl', () => {
  it('keeps provider streams direct on native builds', () => {
    expect(getPlayableAudioUrl('https://r1.googlevideo.com/audio.m4a')).toBe(
      'https://r1.googlevideo.com/audio.m4a'
    );
  });

  it('unwraps old proxy URLs on native builds', () => {
    expect(
      getPlayableAudioUrl(
        'http://localhost:3001/api/audio/proxy?url=https%3A%2F%2Fcf-media.sndcdn.com%2Ftrack.mp3'
      )
    ).toBe(
      'https://cf-media.sndcdn.com/track.mp3'
    );
  });
});

describe('resolveAudioUrl', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    directYouTubeMock.mockReset();
    directYouTubeMock.mockResolvedValue(null);
    global.fetch = fetchMock;
  });

  it('keeps a client-resolved iOS stream direct instead of sending it back through a proxy', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    directYouTubeMock.mockResolvedValueOnce({
      videoId: 'V1M1hYxmRvA',
      url: 'https://media.youtube.test/mafinoso.m4a',
      format: 'm4a',
    });

    await expect(
      resolveAudioUrl('Mafioso', 'ÉoDan', 'spotify_id', 237000)
    ).resolves.toMatchObject({
      source: 'youtube',
      url: 'https://media.youtube.test/mafinoso.m4a',
    });
    expect(directYouTubeMock).toHaveBeenCalledWith({
      artist: 'ÉoDan',
      durationMs: 237000,
      title: 'Mafioso',
    });
  });

  it('falls back to the strict canonical lookup when an exact YouTube stream expires', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          source: {
            streamUrl: 'https://media.test/canonical.m4a',
            provider: 'youtube',
          },
          track: { title: 'Faixa canônica' },
        }),
      });

    await expect(
      resolveAudioUrl('Faixa canônica', 'Artista canônico', 'yt_12345678901', 180000)
    ).resolves.toMatchObject({
      source: 'youtube',
      url: 'https://media.test/canonical.m4a',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://192.168.100.27:3001/api/music/resolve',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('keeps iPhone on strict direct fallback when backend resolve fails', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            videoId: 'abc123DEF45',
            title: 'Faixa canônica (Official Audio)',
            author: 'Artista canônico - Topic',
            lengthSeconds: 180,
            viewCount: 1_000_000,
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          adaptiveFormats: [
            {
              url: 'https://media.test/direct-canonical.m4a',
              type: 'audio/mp4',
              bitrate: 128000,
            },
          ],
        }),
      });

    await expect(
      resolveAudioUrl('Faixa canônica', 'Artista canônico', 'spotify_id', 180000)
    ).resolves.toMatchObject({
      source: 'youtube',
      url: 'https://media.test/direct-canonical.m4a',
    });
  });
});
