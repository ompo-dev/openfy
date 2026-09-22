const mockCreate = jest.fn();

jest.mock('youtubei.js', () => ({ Innertube: { create: mockCreate } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDownloadDiagnostics,
  startDownloadDiagnostics,
} from '../../download/downloadDiagnostics';
import {
  resolveYouTubeStream,
  reportStreamRefusal,
  CLIENT_PROFILES,
  _resetYouTubeStreamResolverForTests,
} from '../youtubeStreamResolver';

const OK_PROBE = {
  ok: true,
  status: 206,
  headers: { get: () => 'audio/mp4' },
  arrayBuffer: async () => new ArrayBuffer(16_384),
};

const FAIL_403 = {
  ok: false,
  status: 403,
  headers: { get: () => 'text/plain' },
  arrayBuffer: async () => new ArrayBuffer(0),
};

describe('resolveYouTubeStream', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockCreate.mockReset();
    _resetYouTubeStreamResolverForTests();
    // Default: both probe stages pass
    global.fetch = jest.fn().mockResolvedValue(OK_PROBE);
  });

  it('returns resolved with correct descriptor fields using ANDROID_MUSIC profile', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://rr1.googlevideo.com/stream.m4a?c=ANDROID_MUSIC',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    mockCreate.mockResolvedValue({ getStreamingData });

    const result = await resolveYouTubeStream('V1M1hYxmRvA');

    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.stream.videoId).toBe('V1M1hYxmRvA');
    expect(result.stream.url).toBe('https://rr1.googlevideo.com/stream.m4a?c=ANDROID_MUSIC');
    expect(result.stream.format).toBe('mp4');
    expect(result.stream.client).toBe('android_music');
    expect(result.stream.expiresAt).toBeGreaterThan(Date.now());
    expect(result.stream.headers).toHaveProperty('User-Agent');
    expect(result.stream.headers['User-Agent']).toContain('com.google.android.youtube');

    expect(getStreamingData).toHaveBeenCalledWith('V1M1hYxmRvA', {
      client: 'YTMUSIC_ANDROID',
      quality: 'best',
      type: 'audio',
    });
  });

  it('deduplicates concurrent in-flight requests for the same videoId', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://rr1.googlevideo.com/stream.m4a?c=ANDROID_MUSIC',
      mime_type: 'audio/mp4',
    });
    mockCreate.mockResolvedValue({ getStreamingData });

    const [r1, r2, r3] = await Promise.all([
      resolveYouTubeStream('V1M1hYxmRvA'),
      resolveYouTubeStream('V1M1hYxmRvA'),
      resolveYouTubeStream('V1M1hYxmRvA'),
    ]);

    expect(r1.status).toBe('resolved');
    expect(r2.status).toBe('resolved');
    expect(r3.status).toBe('resolved');
    expect(getStreamingData).toHaveBeenCalledTimes(1);
  });

  it('returns cached resolved result on second call without re-resolving', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://rr1.googlevideo.com/stream.m4a?c=ANDROID_MUSIC',
      mime_type: 'audio/mp4',
    });
    mockCreate.mockResolvedValue({ getStreamingData });

    await resolveYouTubeStream('V1M1hYxmRvA');
    await resolveYouTubeStream('V1M1hYxmRvA');

    expect(getStreamingData).toHaveBeenCalledTimes(1);
  });

  it('fresh: true bypasses cache and re-resolves', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://rr1.googlevideo.com/stream.m4a?c=ANDROID_MUSIC',
      mime_type: 'audio/mp4',
    });
    mockCreate.mockResolvedValue({ getStreamingData });

    await resolveYouTubeStream('V1M1hYxmRvA');
    await resolveYouTubeStream('V1M1hYxmRvA', { fresh: true });

    expect(getStreamingData).toHaveBeenCalledTimes(2);
  });

  it('returns attestation_required when second probe returns 403 (GVS enforcement)', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://rr1.googlevideo.com/stream.m4a?c=ANDROID_MUSIC',
      mime_type: 'audio/mp4',
    });
    mockCreate.mockResolvedValue({ getStreamingData });
    (global.fetch as jest.Mock)
      // first probe passes
      .mockResolvedValueOnce(OK_PROBE)
      // second probe → GVS 403
      .mockResolvedValueOnce(FAIL_403);

    const result = await resolveYouTubeStream('aj5_Cvp9je0');

    expect(result.status).toBe('attestation_required');
    if (result.status !== 'attestation_required') return;
    expect(result.videoId).toBe('aj5_Cvp9je0');
    expect(result.client).toBe('android_music');

    // Only ONE player client tried (no cascade after GVS enforcement)
    expect(getStreamingData).toHaveBeenCalledTimes(1);
  });

  it('verdict cache: second call within TTL returns attestation_required without re-resolving', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://rr1.googlevideo.com/stream.m4a?c=ANDROID_MUSIC',
      mime_type: 'audio/mp4',
    });
    mockCreate.mockResolvedValue({ getStreamingData });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(OK_PROBE)
      .mockResolvedValueOnce(FAIL_403);

    await resolveYouTubeStream('aj5_Cvp9je0');
    getStreamingData.mockClear();
    (global.fetch as jest.Mock).mockClear();

    const result = await resolveYouTubeStream('aj5_Cvp9je0');

    expect(result.status).toBe('attestation_required');
    expect(getStreamingData).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('cascades to next client on normal first-probe failure (not GVS enforcement)', async () => {
    const getStreamingData = jest
      .fn()
      .mockResolvedValueOnce({ url: 'https://rr1.googlevideo.com/am_fail.m4a?c=ANDROID_MUSIC', mime_type: 'audio/mp4' })
      .mockResolvedValueOnce({ url: 'https://rr1.googlevideo.com/mweb_ok.m4a?c=MWEB', mime_type: 'audio/mp4' });
    mockCreate.mockResolvedValue({ getStreamingData });
    (global.fetch as jest.Mock)
      // ANDROID_MUSIC first probe fails (stage first → normal failure, cascades)
      .mockResolvedValueOnce(FAIL_403)
      // MWEB both probes pass
      .mockResolvedValueOnce(OK_PROBE)
      .mockResolvedValueOnce(OK_PROBE);

    const result = await resolveYouTubeStream('V1M1hYxmRvA');

    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.stream.url).toContain('mweb_ok');
    expect(result.stream.client).toBe('mweb');
    expect(getStreamingData).toHaveBeenCalledTimes(2);
  });

  it('returns unplayable when all clients fail without GVS enforcement', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://rr1.googlevideo.com/stream.m4a',
      mime_type: 'audio/mp4',
    });
    mockCreate.mockResolvedValue({ getStreamingData });
    // All probes fail at stage first
    (global.fetch as jest.Mock).mockResolvedValue(FAIL_403);

    const result = await resolveYouTubeStream('V1M1hYxmRvA');

    expect(result.status).toBe('unplayable');
    if (result.status !== 'unplayable') return;
    expect(result.reason).toBe('all_clients_failed');
    expect(getStreamingData).toHaveBeenCalledTimes(CLIENT_PROFILES.length);
  });

  it('returns transport_error when Innertube throws', async () => {
    mockCreate.mockRejectedValue(new Error('network down'));

    const result = await resolveYouTubeStream('V1M1hYxmRvA');

    expect(result.status).toBe('transport_error');
    if (result.status !== 'transport_error') return;
    expect(result.error).toContain('network down');
  });

  it('recovers a lost connection using the same video and client', async () => {
    jest.useFakeTimers();
    try {
      const getStreamingData = jest.fn()
        .mockRejectedValueOnce(new Error('The network connection was lost.'))
        .mockResolvedValue({ url: 'https://rr1.googlevideo.com/retry.m4a', mime_type: 'audio/mp4' });
      mockCreate.mockResolvedValue({ getStreamingData });
      const pending = resolveYouTubeStream('_MyOuFWnPPY');
      await jest.runAllTimersAsync();
      expect(await pending).toMatchObject({ status: 'resolved' });
      expect(getStreamingData).toHaveBeenCalledTimes(2);
      expect(getStreamingData.mock.calls[0]).toEqual(getStreamingData.mock.calls[1]);
    } finally { jest.useRealTimers(); }
  });

  it('does not poison client health or cache a connection outage as unplayable', async () => {
    jest.useFakeTimers();
    try {
      const getStreamingData = jest.fn().mockRejectedValue(new Error('The network connection was lost.'));
      mockCreate.mockResolvedValue({ getStreamingData });
      const pending = resolveYouTubeStream('_MyOuFWnPPY');
      await jest.runAllTimersAsync();
      expect(await pending).toMatchObject({ status: 'transport_error' });
      getStreamingData.mockResolvedValue({ url: 'https://rr1.googlevideo.com/retry.m4a', mime_type: 'audio/mp4' });
      // The user can retry immediately without bypassing caches or waiting minutes.
      expect(await resolveYouTubeStream('_MyOuFWnPPY')).toMatchObject({ status: 'resolved' });
      expect(await AsyncStorage.getItem('@openfy/youtube-stream-client-health-v4'))
        .not.toContain('"consecutiveFailures":1');
    } finally { jest.useRealTimers(); }
  });

  it('does not cache exhausted network failures during initialization', async () => {
    mockCreate.mockRejectedValue(new Error('The network connection was lost.'));
    expect(await resolveYouTubeStream('_MyOuFWnPPY')).toMatchObject({ status: 'transport_error' });
    mockCreate.mockResolvedValue({ getStreamingData: jest.fn().mockResolvedValue({
      url: 'https://rr1.googlevideo.com/retry.m4a', mime_type: 'audio/mp4',
    }) });
    expect(await resolveYouTubeStream('_MyOuFWnPPY')).toMatchObject({ status: 'resolved' });
  });

  it('records initialization failures and cached verdicts in the download log', async () => {
    mockCreate.mockRejectedValue(new Error('player initialization failed'));
    const spotifyId = 'spotify_init_failure';
    await startDownloadDiagnostics({
      spotifyId, title: 'Track', artistName: 'Artist', albumName: '',
      imageURL: '', duration_ms: 0,
    });

    await resolveYouTubeStream('_MyOuFWnPPY', { spotifyId });
    await resolveYouTubeStream('_MyOuFWnPPY', { spotifyId });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const diagnostic = await getDownloadDiagnostics(spotifyId);
    const results = diagnostic?.events.filter(event =>
      event.phase === 'audio.youtube.stream.result'
    );
    expect(results).toHaveLength(2);
    expect(results?.[0].details).toMatchObject({
      videoId: '_MyOuFWnPPY', status: 'transport_error',
      error: 'player initialization failed',
    });
    expect(results?.[1].details).toEqual(results?.[0].details);
  });

  it('reinitializes the client on a fresh retry after initialization failed', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        getStreamingData: jest.fn().mockResolvedValue({
          url: 'https://rr1.googlevideo.com/retry.m4a?c=ANDROID_MUSIC',
          mime_type: 'audio/mp4',
        }),
      });

    await expect(resolveYouTubeStream('_MyOuFWnPPY'))
      .resolves.toMatchObject({ status: 'resolved' });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('does not disable all clients for the next song when one video has no streaming data', async () => {
    const getStreamingData = jest.fn().mockRejectedValue(new Error('No streaming data available'));
    mockCreate.mockResolvedValue({ getStreamingData });
    expect(await resolveYouTubeStream('_MyOuFWnPPY')).toMatchObject({ status: 'unplayable' });
    getStreamingData.mockResolvedValue({ url: 'https://rr1.googlevideo.com/next.m4a', mime_type: 'audio/mp4' });
    expect(await resolveYouTubeStream('LIXckjwbPdY')).toMatchObject({ status: 'resolved' });
  });

  it('aborts a probe whose headers arrive but whose body stalls', async () => {
    jest.useFakeTimers();
    try {
      mockCreate.mockResolvedValue({ getStreamingData: jest.fn().mockResolvedValue({
        url: 'https://rr1.googlevideo.com/stalled.m4a', mime_type: 'audio/mp4',
      }) });
      const signals: AbortSignal[] = [];
      global.fetch = jest.fn().mockImplementation(async (_url, { signal }) => {
        signals.push(signal);
        return { ...OK_PROBE, arrayBuffer: () => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }) };
      });
      const pending = resolveYouTubeStream('_MyOuFWnPPY');
      await jest.runAllTimersAsync();
      expect(await pending).toMatchObject({ status: 'transport_error' });
      expect(signals.length).toBeGreaterThan(0);
      expect(signals.every(signal => signal.aborted)).toBe(true);
    } finally { jest.useRealTimers(); }
  });

  it('does not allocate a full song when the server ignores Range', async () => {
    mockCreate.mockResolvedValue({ getStreamingData: jest.fn().mockResolvedValue({
      url: 'https://rr1.googlevideo.com/full.m4a', mime_type: 'audio/mp4',
    }) });
    const arrayBuffer = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, arrayBuffer,
      headers: { get: (name: string) => name === 'content-type' ? 'audio/mp4' : '32000000' },
    });
    expect(await resolveYouTubeStream('_MyOuFWnPPY')).toMatchObject({ status: 'unplayable' });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('reportStreamRefusal evicts cache and records failure', async () => {
    const getStreamingData = jest
      .fn()
      .mockResolvedValueOnce({ url: 'https://rr1.googlevideo.com/initial.m4a?c=ANDROID_MUSIC', mime_type: 'audio/mp4' })
      .mockResolvedValueOnce({ url: 'https://rr1.googlevideo.com/retry.m4a?c=MWEB', mime_type: 'audio/mp4' });
    mockCreate.mockResolvedValue({ getStreamingData });

    const initial = await resolveYouTubeStream('V1M1hYxmRvA');
    expect(initial.status).toBe('resolved');
    if (initial.status !== 'resolved') return;

    await reportStreamRefusal(initial.stream.url, 403);

    // Fresh resolve should use a different client (android_music is now in cooldown)
    const retry = await resolveYouTubeStream('XcJ3NZqm7bQ', { fresh: true });
    expect(retry.status).toBe('resolved');
    if (retry.status !== 'resolved') return;
    expect(retry.stream.client).toBe('mweb');
  });
});
