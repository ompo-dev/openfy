jest.mock('@config', () => ({
  LOCAL_AUDIO_ONLY: false,
  MUSIC_SERVER_URL: 'http://192.168.100.27:3001',
}));

jest.mock('../directYouTubeResolver', () => ({
  resolveDirectYouTubeAudio: jest.fn(),
  getDirectYouTubeMediaHeaders: jest.fn().mockReturnValue(null),
}));

import { getPlayableAudioUrl, resolveAudioUrl } from '../audioResolver';
import { resolveDirectYouTubeAudio } from '../directYouTubeResolver';
import { Platform } from 'react-native';

const directYouTubeMock = resolveDirectYouTubeAudio as jest.Mock;

describe('getPlayableAudioUrl', () => {
  it('routes provider streams through the configured backend proxy on native builds', () => {
    expect(getPlayableAudioUrl('https://r1.googlevideo.com/audio.m4a')).toBe(
      'http://192.168.100.27:3001/api/audio/proxy?url=https%3A%2F%2Fr1.googlevideo.com%2Faudio.m4a'
    );
  });

  it('rewrites an old proxy URL to the configured backend on native builds', () => {
    expect(
      getPlayableAudioUrl(
        'http://localhost:3001/api/audio/proxy?url=https%3A%2F%2Fcf-media.sndcdn.com%2Ftrack.mp3'
      )
    ).toBe(
      'http://192.168.100.27:3001/api/audio/proxy?url=https%3A%2F%2Fcf-media.sndcdn.com%2Ftrack.mp3'
    );
  });
});

describe('resolveAudioUrl', () => {
  const fetchMock = jest.fn();
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    fetchMock.mockReset();
    directYouTubeMock.mockReset();
    directYouTubeMock.mockResolvedValue(null);
    global.fetch = fetchMock;
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatform,
    });
  });

  it('uses a client-resolved stream directly before contacting a configured backend', async () => {
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a verified local stream instead of replacing it with a server URL', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          source: {
            id: 'V1M1hYxmRvA',
            streamUrl: 'https://rr1.googlevideo.com/videoplayback?itag=140',
            provider: 'youtube',
            format: 'm4a',
          },
          track: { title: 'Faixa do servidor' },
        },
      }),
    });
    directYouTubeMock.mockResolvedValueOnce({
      videoId: 'V1M1hYxmRvA',
      url: 'https://media.youtube.test/fallback.m4a',
      format: 'm4a',
    });

    await expect(
      resolveAudioUrl('Faixa do servidor', 'Artista', 'server_id', 180000)
    ).resolves.toMatchObject({
      source: 'youtube',
      url: 'https://media.youtube.test/fallback.m4a',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(directYouTubeMock).toHaveBeenCalledWith({
      artist: '',
      durationMs: 180000,
      fresh: false,
      title: 'Faixa do servidor',
      spotifyId: 'server_id',
    });
  });

  it('tries the configured backend before an exact iPhone fallback', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(
      resolveAudioUrl('Faixa canônica', 'Artista canônico', 'yt_12345678901', 180000)
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('192.168.100.27:3001'),
      expect.anything()
    );
  });

  it('keeps direct URLs local after a server resolver is unavailable', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    directYouTubeMock.mockResolvedValueOnce({
      videoId: 'abc123DEF45',
      url: 'https://media.test/direct-canonical.m4a',
      format: 'm4a',
    });

    await expect(
      resolveAudioUrl('Faixa canônica', 'Artista canônico', 'spotify_id', 180000)
    ).resolves.toMatchObject({
      source: 'youtube',
      url: 'https://media.test/direct-canonical.m4a',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call browser-only CORS fallbacks after the web backend fails', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'web',
    });
    fetchMock.mockRejectedValueOnce(new Error('backend timeout'));

    await expect(
      resolveAudioUrl('Faixa web', 'Artista web', 'web-regression', 180000)
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.100.27:3001/api/music/resolve',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.100.27:3001/api/music/resolve',
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(
      JSON.parse(fetchMock.mock.calls[0][1].body as string)
    ).toMatchObject({ includeLyrics: false });
  });
});
