const mockCreate = jest.fn();

jest.mock('youtubei.js', () => ({
  Innertube: {
    create: mockCreate,
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDirectYouTubeMediaHeaders,
  reportDirectYouTubeStreamRefusal,
  resetDirectYouTubeResolverForTests,
  resolveDirectYouTubeAudio,
  resolveDirectYouTubeTrack,
} from '../directYouTubeResolver';
import {
  startDownloadDiagnostics,
  getDownloadDiagnostics,
  _resetDownloadDiagnosticsForTests,
} from '../../download/downloadDiagnostics';

describe('resolveDirectYouTubeAudio', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockCreate.mockReset();
    resetDirectYouTubeResolverForTests();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 206,
      headers: { get: () => 'audio/mp4' },
      arrayBuffer: async () => new ArrayBuffer(16_384),
    });
  });

  it('resolves an exact YouTube video through the iOS streaming client', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://rr1.googlevideo.com/mafinoso.m4a?c=IOS',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    mockCreate.mockResolvedValue({ getStreamingData });

    await expect(
      resolveDirectYouTubeAudio({ videoId: 'V1M1hYxmRvA' })
    ).resolves.toEqual({
      videoId: 'V1M1hYxmRvA',
      url: 'https://rr1.googlevideo.com/mafinoso.m4a?c=IOS',
      format: 'm4a',
    });
    expect(getStreamingData).toHaveBeenCalledWith('V1M1hYxmRvA', {
      client: 'IOS',
      quality: 'best',
      type: 'audio',
    });
    expect(mockCreate).toHaveBeenCalledWith({
      generate_session_locally: false,
      retrieve_innertube_config: true,
      retrieve_player: true,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://rr1.googlevideo.com/mafinoso.m4a?c=IOS',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent':
            'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)',
        }),
      })
    );
  });

  it('uses the player identity that minted a stream over the URL client hint', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://rr1.googlevideo.com/mafinoso.m4a?c=ANDROID_MUSIC',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    mockCreate.mockResolvedValue({ getStreamingData });

    const resolved = await resolveDirectYouTubeAudio({
      videoId: 'V1M1hYxmRvA',
    });

    expect(getDirectYouTubeMediaHeaders(resolved!.url)).toEqual({
      'User-Agent':
        'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)',
    });
  });

  it('tries another local player client when the first stream cannot serve audio bytes', async () => {
    const getStreamingData = jest
      .fn()
      .mockResolvedValueOnce({
        url: 'https://media.youtube.test/refused.m4a',
        mime_type: 'audio/mp4; codecs="mp4a.40.2"',
      })
      .mockResolvedValueOnce({
        url: 'https://media.youtube.test/working.m4a',
        mime_type: 'audio/mp4; codecs="mp4a.40.2"',
      });
    mockCreate.mockResolvedValue({ getStreamingData });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: { get: () => 'text/html' },
        arrayBuffer: async () => new ArrayBuffer(0),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 206,
        headers: { get: () => 'audio/mp4' },
        arrayBuffer: async () => new ArrayBuffer(16_384),
      });

    await expect(
      resolveDirectYouTubeAudio({ videoId: 'V1M1hYxmRvA' })
    ).resolves.toMatchObject({
      url: 'https://media.youtube.test/working.m4a',
      format: 'm4a',
    });

    expect(getStreamingData).toHaveBeenNthCalledWith(1, 'V1M1hYxmRvA', {
      client: 'IOS',
      quality: 'best',
      type: 'audio',
    });
    expect(getStreamingData).toHaveBeenNthCalledWith(2, 'V1M1hYxmRvA', {
      client: 'YTMUSIC_ANDROID',
      quality: 'best',
      type: 'audio',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://media.youtube.test/working.m4a',
      expect.objectContaining({ headers: { Range: 'bytes=0-1048575' } })
    );
  });

  it('learns the verified client and uses it before a recently rejected client', async () => {
    const getStreamingData = jest
      .fn()
      .mockResolvedValueOnce({
        url: 'https://media.youtube.test/refused.m4a',
        mime_type: 'audio/mp4; codecs="mp4a.40.2"',
      })
      .mockResolvedValueOnce({
        url: 'https://media.youtube.test/working.m4a',
        mime_type: 'audio/mp4; codecs="mp4a.40.2"',
      })
      .mockResolvedValueOnce({
        url: 'https://media.youtube.test/learned.m4a',
        mime_type: 'audio/mp4; codecs="mp4a.40.2"',
      });
    mockCreate.mockResolvedValue({ getStreamingData });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: { get: () => 'text/html' },
        arrayBuffer: async () => new ArrayBuffer(0),
      })
      .mockResolvedValue({
        ok: true,
        status: 206,
        headers: { get: () => 'audio/mp4' },
        arrayBuffer: async () => new ArrayBuffer(16_384),
      });

    await resolveDirectYouTubeAudio({ videoId: 'V1M1hYxmRvA' });
    await expect(
      resolveDirectYouTubeAudio({ videoId: 'XcJ3NZqm7bQ' })
    ).resolves.toMatchObject({
      url: 'https://media.youtube.test/learned.m4a',
    });

    expect(getStreamingData).toHaveBeenNthCalledWith(3, 'XcJ3NZqm7bQ', {
      client: 'YTMUSIC_ANDROID',
      quality: 'best',
      type: 'audio',
    });
  });

  it('cools down a verified client when iOS refuses its real stream transfer', async () => {
    const getStreamingData = jest
      .fn()
      .mockResolvedValueOnce({
        url: 'https://media.youtube.test/initial.m4a',
        mime_type: 'audio/mp4; codecs="mp4a.40.2"',
      })
      .mockResolvedValueOnce({
        url: 'https://media.youtube.test/retried.m4a',
        mime_type: 'audio/mp4; codecs="mp4a.40.2"',
      });
    mockCreate.mockResolvedValue({ getStreamingData });

    const initial = await resolveDirectYouTubeAudio({ videoId: 'V1M1hYxmRvA' });
    await reportDirectYouTubeStreamRefusal(initial!.url, 403);

    await expect(
      resolveDirectYouTubeAudio({ videoId: 'XcJ3NZqm7bQ', fresh: true })
    ).resolves.toMatchObject({ url: 'https://media.youtube.test/retried.m4a' });

    expect(getStreamingData).toHaveBeenNthCalledWith(2, 'XcJ3NZqm7bQ', {
      client: 'YTMUSIC_ANDROID',
      quality: 'best',
      type: 'audio',
    });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('keeps the learned client order after the resolver is recreated', async () => {
    const getStreamingData = jest
      .fn()
      .mockResolvedValueOnce({
        url: 'https://media.youtube.test/refused.m4a',
        mime_type: 'audio/mp4; codecs="mp4a.40.2"',
      })
      .mockResolvedValueOnce({
        url: 'https://media.youtube.test/working.m4a',
        mime_type: 'audio/mp4; codecs="mp4a.40.2"',
      })
      .mockResolvedValueOnce({
        url: 'https://media.youtube.test/restored.m4a',
        mime_type: 'audio/mp4; codecs="mp4a.40.2"',
      });
    mockCreate.mockResolvedValue({ getStreamingData });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: { get: () => 'text/html' },
        arrayBuffer: async () => new ArrayBuffer(0),
      })
      .mockResolvedValue({
        ok: true,
        status: 206,
        headers: { get: () => 'audio/mp4' },
        arrayBuffer: async () => new ArrayBuffer(16_384),
      });

    await resolveDirectYouTubeAudio({ videoId: 'V1M1hYxmRvA' });
    resetDirectYouTubeResolverForTests();

    await expect(
      resolveDirectYouTubeAudio({ videoId: 'XcJ3NZqm7bQ' })
    ).resolves.toMatchObject({
      url: 'https://media.youtube.test/restored.m4a',
    });

    expect(getStreamingData).toHaveBeenNthCalledWith(3, 'XcJ3NZqm7bQ', {
      client: 'YTMUSIC_ANDROID',
      quality: 'best',
      type: 'audio',
    });
  });

  it('ignores invalid persisted client health', async () => {
    await AsyncStorage.setItem(
      '@openfy/youtube-player-client-health-v1',
      JSON.stringify({
        savedAt: Date.now(),
        clients: {
          YTMUSIC_ANDROID: {
            successes: 1_000_000,
            consecutiveFailures: 0,
            averageLatencyMs: 0,
            cooldownUntil: 0,
          },
        },
      })
    );
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://media.youtube.test/mafinoso.m4a',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    mockCreate.mockResolvedValue({ getStreamingData });

    await resolveDirectYouTubeAudio({ videoId: 'V1M1hYxmRvA' });

    expect(getStreamingData).toHaveBeenCalledWith('V1M1hYxmRvA', {
      client: 'IOS',
      quality: 'best',
      type: 'audio',
    });
  });

  it('searches and accepts only a canonical title, artist, and duration match', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://media.youtube.test/mafinoso.m4a',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    const search = jest.fn().mockResolvedValue({
      videos: [
        {
          video_id: 'V1M1hYxmRvA',
          title: { toString: () => 'Mafioso' },
          author: { name: 'ÉoDan' },
          duration: { seconds: 237 },
          best_thumbnail: { url: 'https://image.youtube.test/mafinoso.jpg' },
        },
        {
          video_id: 'wrong-video',
          title: { toString: () => 'Outra Música' },
          author: { name: 'Outro Artista' },
          duration: { seconds: 237 },
        },
      ],
    });
    mockCreate.mockResolvedValue({ search, getStreamingData });

    await expect(
      resolveDirectYouTubeAudio({
        title: 'Mafioso',
        artist: 'ÉoDan',
        durationMs: 237_000,
      })
    ).resolves.toMatchObject({
      videoId: 'V1M1hYxmRvA',
      imageURL: 'https://image.youtube.test/mafinoso.jpg',
      url: 'https://media.youtube.test/mafinoso.m4a',
    });
    expect(search).toHaveBeenCalledWith('ÉoDan - Mafioso Official Audio', {
      type: 'video',
    });
  });

  it('resolves multi-artist track "Micael Rapper, ÉoDan" matching "Micael" candidate with diagnostics', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://media.youtube.test/minhagang.m4a',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    const search = jest.fn().mockResolvedValue({
      videos: [
        {
          video_id: 'aj5_Cvp9je0',
          title: { toString: () => 'Minha Gang' },
          author: { name: 'Micael' },
          duration: { seconds: 180 },
          best_thumbnail: { url: 'https://image.youtube.test/minhagang.jpg' },
        },
      ],
    });
    mockCreate.mockResolvedValue({ search, getStreamingData });

    await expect(
      resolveDirectYouTubeAudio({
        title: 'Minha Gang',
        artist: 'Micael Rapper, ÉoDan',
        durationMs: 180_000,
        spotifyId: '79UImvw2Pgrsvt8o0QnOMx',
      })
    ).resolves.toMatchObject({
      videoId: 'aj5_Cvp9je0',
      imageURL: 'https://image.youtube.test/minhagang.jpg',
      url: 'https://media.youtube.test/minhagang.m4a',
    });
  });

  it('records structured diagnostic failure when probe returns HTTP 403', async () => {
    _resetDownloadDiagnosticsForTests();
    await startDownloadDiagnostics({
      spotifyId: 'track_probe_403',
      title: 'Minha Gang',
      artistName: 'Micael Rapper, ÉoDan',
    });

    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://media.youtube.test/refused.m4a',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    mockCreate.mockResolvedValue({ getStreamingData });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => 'text/html' },
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    const result = await resolveDirectYouTubeAudio({
      videoId: 'aj5_Cvp9je0',
      spotifyId: 'track_probe_403',
    });
    expect(result).toBeNull();

    const diagnostics = await getDownloadDiagnostics('track_probe_403');
    const failedEvent = diagnostics?.events.find(
      (e) => e.phase === 'audio.youtube.stream.client_failed'
    );
    expect(failedEvent).toBeDefined();
    expect(failedEvent?.details).toMatchObject({
      videoId: 'aj5_Cvp9je0',
      client: 'IOS',
      stage: 'probe',
      reason: 'http_status',
      status: 403,
    });
  });

  it('loads exact pasted video metadata and audio on device', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://media.youtube.test/mafinoso.m4a',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    const getBasicInfo = jest.fn().mockResolvedValue({
      basic_info: {
        title: 'Mafioso',
        author: 'ÉoDan - Topic',
        duration: 236,
        thumbnail: [{ url: 'https://image.youtube.test/mafinoso.jpg' }],
      },
    });
    mockCreate.mockResolvedValue({ getBasicInfo, getStreamingData });

    await expect(resolveDirectYouTubeTrack('V1M1hYxmRvA')).resolves.toEqual({
      videoId: 'V1M1hYxmRvA',
      title: 'Mafioso',
      artistName: 'ÉoDan - Topic',
      durationMs: 236000,
      imageURL: 'https://image.youtube.test/mafinoso.jpg',
      url: 'https://media.youtube.test/mafinoso.m4a',
      format: 'm4a',
    });
  });
});
