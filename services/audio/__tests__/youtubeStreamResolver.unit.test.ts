const mockCreate = jest.fn();

jest.mock('youtubei.js', () => ({ Innertube: { create: mockCreate } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
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
    expect(result.stream.headers['User-Agent']).toContain('com.google.android.apps.youtube.music');

    expect(getStreamingData).toHaveBeenCalledWith('V1M1hYxmRvA', expect.objectContaining({
      client: 'ANDROID_MUSIC',
      quality: 'best',
      type: 'audio',
    }));
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
