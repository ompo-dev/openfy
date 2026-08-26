jest.mock('@config', () => ({
  MUSIC_SERVER_URL: 'http://192.168.100.27:3001',
}));

jest.mock('../directYouTubeResolver', () => ({
  resolveDirectYouTubeAudio: jest.fn(),
}));

import { getPlayableAudioUrl, resolveAudioUrl } from '../audioResolver';
import { resolveDirectYouTubeAudio } from '../directYouTubeResolver';
import { Platform } from 'react-native';

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
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.100.27:3001/api/music/resolve',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('uses the configured backend before invoking the native fallback', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          source: {
            streamUrl: 'https://music.test/api/audio/youtube?videoId=12345678901',
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
      url: 'https://music.test/api/audio/youtube?videoId=12345678901',
    });
    expect(directYouTubeMock).not.toHaveBeenCalled();
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

  it('keeps iPhone on a strict direct fallback when the backend is unavailable', async () => {
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
