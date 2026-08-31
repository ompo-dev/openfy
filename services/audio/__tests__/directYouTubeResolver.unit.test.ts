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

  it('resolves an exact YouTube video through the ANDROID_MUSIC streaming client', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://rr1.googlevideo.com/mafinoso.m4a?c=ANDROID_MUSIC',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    mockCreate.mockResolvedValue({ getStreamingData });

    await expect(
      resolveDirectYouTubeAudio({ videoId: 'V1M1hYxmRvA' })
    ).resolves.toEqual({
      videoId: 'V1M1hYxmRvA',
      url: 'https://rr1.googlevideo.com/mafinoso.m4a?c=ANDROID_MUSIC',
      format: 'm4a',
    });
    expect(getStreamingData).toHaveBeenCalledWith('V1M1hYxmRvA', expect.objectContaining({
      client: 'ANDROID_MUSIC',
      quality: 'best',
      type: 'audio',
    }));
    expect(mockCreate).toHaveBeenCalledWith({
      generate_session_locally: false,
      retrieve_innertube_config: true,
      retrieve_player: true,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://rr1.googlevideo.com/mafinoso.m4a?c=ANDROID_MUSIC',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('com.google.android.apps.youtube.music'),
        }),
      })
    );
  });

  it('uses the player identity that minted a stream over the URL client hint', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://rr1.googlevideo.com/mafinoso.m4a?c=IOS',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    mockCreate.mockResolvedValue({ getStreamingData });

    const resolved = await resolveDirectYouTubeAudio({
      videoId: 'V1M1hYxmRvA',
    });

    expect(getDirectYouTubeMediaHeaders(resolved!.url)).toEqual({
      'User-Agent': expect.stringContaining('com.google.android.apps.youtube.music'),
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
      // second client — first probe passes, second probe passes
      .mockResolvedValueOnce({
        ok: true,
        status: 206,
        headers: { get: () => 'audio/mp4' },
        arrayBuffer: async () => new ArrayBuffer(16_384),
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

    expect(getStreamingData).toHaveBeenNthCalledWith(1, 'V1M1hYxmRvA', expect.objectContaining({
      client: 'ANDROID_MUSIC',
      quality: 'best',
      type: 'audio',
    }));
    expect(getStreamingData).toHaveBeenNthCalledWith(2, 'V1M1hYxmRvA', expect.objectContaining({
      client: 'MWEB',
      quality: 'best',
      type: 'audio',
    }));
    expect(global.fetch).toHaveBeenCalledWith(
      'https://media.youtube.test/working.m4a',
      expect.objectContaining({ headers: expect.objectContaining({ Range: 'bytes=0-1048575' }) })
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

    expect(getStreamingData).toHaveBeenNthCalledWith(3, 'XcJ3NZqm7bQ', expect.objectContaining({
      client: 'MWEB',
      quality: 'best',
      type: 'audio',
    }));
  });

  it('cools down a verified client when stream refusal is reported', async () => {
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

    expect(getStreamingData).toHaveBeenNthCalledWith(2, 'XcJ3NZqm7bQ', expect.objectContaining({
      client: 'MWEB',
      quality: 'best',
      type: 'audio',
    }));
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

    expect(getStreamingData).toHaveBeenNthCalledWith(3, 'XcJ3NZqm7bQ', expect.objectContaining({
      client: 'MWEB',
      quality: 'best',
      type: 'audio',
    }));
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
      client: 'android_music',
      stage: 'probe.first',
      reason: 'http_status',
      status: 403,
    });
  });

  it('detects GVS enforcement: first probe passes, second probe returns 403 → stops without trying next client', async () => {
    _resetDownloadDiagnosticsForTests();
    await startDownloadDiagnostics({
      spotifyId: 'track_gvs_enforcement',
      title: 'Minha Gang',
      artistName: 'Micael Rapper, ÉoDan',
    });

    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://media.youtube.test/gvs.m4a',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    mockCreate.mockResolvedValue({ getStreamingData });
    (global.fetch as jest.Mock)
      // first probe (bytes 0–1 MiB) → passes
      .mockResolvedValueOnce({
        ok: true,
        status: 206,
        headers: { get: () => 'audio/mp4' },
        arrayBuffer: async () => new ArrayBuffer(1_048_576),
      })
      // second probe (bytes 1 MiB–2 MiB) → GVS 403
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: { get: () => 'text/plain' },
        arrayBuffer: async () => new ArrayBuffer(0),
      });

    const result = await resolveDirectYouTubeAudio({
      videoId: 'aj5_Cvp9je0',
      spotifyId: 'track_gvs_enforcement',
    });
    expect(result).toBeNull();

    expect(getStreamingData).toHaveBeenCalledTimes(1);
    expect(getStreamingData).toHaveBeenCalledWith('aj5_Cvp9je0', expect.objectContaining({
      client: 'ANDROID_MUSIC',
      quality: 'best',
      type: 'audio',
    }));

    const diagnostics = await getDownloadDiagnostics('track_gvs_enforcement');
    const failedEvent = diagnostics?.events.find(
      (e) => e.phase === 'audio.youtube.stream.client_failed'
    );
    expect(failedEvent).toBeDefined();
    expect(failedEvent?.details).toMatchObject({
      videoId: 'aj5_Cvp9je0',
      client: 'android_music',
      stage: 'probe.second',
      reason: 'http_status',
      status: 403,
      gvsEnforcement: true,
    });
  });

  it('normal first-probe failure: cascades to next client (stage probe.first, gvsEnforcement false)', async () => {
    _resetDownloadDiagnosticsForTests();
    await startDownloadDiagnostics({
      spotifyId: 'track_normal_fail',
      title: 'Mafioso',
      artistName: 'ÉoDan',
    });

    const getStreamingData = jest
      .fn()
      .mockResolvedValueOnce({
        url: 'https://media.youtube.test/am_fail.m4a',
        mime_type: 'audio/mp4; codecs="mp4a.40.2"',
      })
      .mockResolvedValueOnce({
        url: 'https://media.youtube.test/mweb_ok.m4a',
        mime_type: 'audio/mp4; codecs="mp4a.40.2"',
      });
    mockCreate.mockResolvedValue({ getStreamingData });
    (global.fetch as jest.Mock)
      // ANDROID_MUSIC first probe → 403 on first range
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: { get: () => 'text/html' },
        arrayBuffer: async () => new ArrayBuffer(0),
      })
      // MWEB first probe → ok
      .mockResolvedValueOnce({
        ok: true,
        status: 206,
        headers: { get: () => 'audio/mp4' },
        arrayBuffer: async () => new ArrayBuffer(16_384),
      })
      // MWEB second probe → ok
      .mockResolvedValueOnce({
        ok: true,
        status: 206,
        headers: { get: () => 'audio/mp4' },
        arrayBuffer: async () => new ArrayBuffer(16_384),
      });

    const result = await resolveDirectYouTubeAudio({
      videoId: 'V1M1hYxmRvA',
      spotifyId: 'track_normal_fail',
    });
    expect(result).toMatchObject({ url: 'https://media.youtube.test/mweb_ok.m4a' });

    expect(getStreamingData).toHaveBeenCalledTimes(2);

    const diagnostics = await getDownloadDiagnostics('track_normal_fail');
    const failedEvent = diagnostics?.events.find(
      (e) => e.phase === 'audio.youtube.stream.client_failed'
    );
    expect(failedEvent?.details).toMatchObject({
      stage: 'probe.first',
      gvsEnforcement: false,
    });

    const passedEvent = diagnostics?.events.find(
      (e) => e.phase === 'audio.youtube.stream.client_probe_passed'
    );
    expect(passedEvent).toBeDefined();
    expect(passedEvent?.details).toMatchObject({ client: 'mweb' });
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
