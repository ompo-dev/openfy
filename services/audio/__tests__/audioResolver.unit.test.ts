jest.mock('@config', () => ({
  MUSIC_SERVER_URL: 'http://192.168.100.27:3001',
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

import { getPlayableAudioUrl, resolveAudioUrl } from '../audioResolver';

describe('getPlayableAudioUrl', () => {
  it('routes provider streams through the configured backend proxy', () => {
    expect(getPlayableAudioUrl('https://r1.googlevideo.com/audio.m4a')).toBe(
      'http://192.168.100.27:3001/api/audio/proxy?url=https%3A%2F%2Fr1.googlevideo.com%2Faudio.m4a'
    );
  });

  it('rewrites an old proxy URL instead of proxying it twice', () => {
    expect(
      getPlayableAudioUrl(
        'http://localhost:3001/api/audio/proxy?url=https%3A%2F%2Fcf-media.sndcdn.com%2Ftrack.mp3'
      )
    ).toBe(
      'http://192.168.100.27:3001/api/audio/proxy?url=https%3A%2F%2Fcf-media.sndcdn.com%2Ftrack.mp3'
    );
  });

  it('routes known YouTube videos through the stable backend audio endpoint', () => {
    expect(
      getPlayableAudioUrl('https://r1.googlevideo.com/audio.m4a', 'm1a_GqJf02M')
    ).toBe('http://192.168.100.27:3001/api/audio/youtube?videoId=m1a_GqJf02M');
  });
});

describe('resolveAudioUrl', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
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
            id: 'm1a_GqJf02M',
          },
          track: { title: 'Faixa canônica' },
        }),
      });

    await expect(
      resolveAudioUrl('Faixa canônica', 'Artista canônico', 'yt_12345678901', 180000)
    ).resolves.toMatchObject({
      source: 'youtube',
      url: 'http://192.168.100.27:3001/api/audio/youtube?videoId=m1a_GqJf02M',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://192.168.100.27:3001/api/music/resolve',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('accepts the Next API response envelope for backend streams', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          source: {
            id: 'm1a_GqJf02M',
            streamUrl: 'https://media.test/canonical.m4a',
            provider: 'youtube',
          },
          track: { title: 'Gods Plan' },
        },
      }),
    });

    await expect(
      resolveAudioUrl("God's Plan", 'Drake', '5b8WiNjA6ihEvaeB9J3eyQ', 198973)
    ).resolves.toMatchObject({
      source: 'youtube',
      url: 'http://192.168.100.27:3001/api/audio/youtube?videoId=m1a_GqJf02M',
    });
  });

  it('does not call CORS-prone browser providers after a backend miss on web', async () => {
    fetchMock.mockResolvedValue({ ok: false });

    await expect(
      resolveAudioUrl('Pique Narutão', 'Sidney Scaccio', '5b8WiNjA6ihEvaeB9J3eyQ', 181834)
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.100.27:3001/api/music/resolve',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
