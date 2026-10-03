const mockNativeDownload = jest.fn();
const mockNativeResolveAndDownload = jest.fn();
const mockNativePlay = jest.fn();
const mockNativeStatus = jest.fn();
const mockNativePreload = jest.fn();

jest.mock('../../../modules/openfy-youtube', () => ({
  __esModule: true,
  default: {
    downloadGoogleVideoAsync: mockNativeDownload,
    resolveAndDownloadGoogleVideoAsync: mockNativeResolveAndDownload,
    playNativeYouTubeAsync: mockNativePlay,
    playNativeYouTubeWithMetadataAsync: mockNativePlay,
    getNativePlaybackStatusAsync: mockNativeStatus,
    preloadNativeYouTubeAsync: mockNativePreload,
  },
}));

import {
  downloadYouTubeStreamNatively,
  getNativeYouTubePlaybackStatus,
  parseNativeYouTubePlaybackUri,
  playYouTubeVideoNatively,
  preloadNativeYouTubeAudio,
  resolveAndDownloadYouTubeVideoNatively,
  toNativeYouTubePlaybackUri,
} from '../nativeYouTubeTransfer';

describe('downloadYouTubeStreamNatively', () => {
  beforeEach(() => {
    mockNativeDownload.mockReset();
    mockNativeResolveAndDownload.mockReset();
    mockNativePlay.mockReset();
    mockNativeStatus.mockReset();
    mockNativePreload.mockReset();
  });

  it('delegates a fresh iOS player resolution and transfer to one native session', async () => {
    mockNativeResolveAndDownload.mockResolvedValue({
      uri: 'file:///mock_dir/openfy_downloads/track.m4a',
      status: 206,
      mimeType: 'audio/mp4',
      totalBytes: 1000,
    });

    await expect(
      resolveAndDownloadYouTubeVideoNatively(
        'V1M1hYxmRvA',
        'file:///mock_dir/openfy_downloads/track.m4a'
      )
    ).resolves.toMatchObject({
      uri: 'file:///mock_dir/openfy_downloads/track.m4a',
      status: 206,
      sourceUrl: 'https://www.youtube.com/watch?v=V1M1hYxmRvA',
    });

    expect(mockNativeResolveAndDownload).toHaveBeenCalledWith(
      'V1M1hYxmRvA',
      'file:///mock_dir/openfy_downloads/track.m4a',
      1024 * 1024
    );
  });

  it('delegates googlevideo bytes to the platform module in 2 MB ranges', async () => {
    mockNativeDownload.mockResolvedValue({
      uri: 'file:///mock_dir/openfy_downloads/track.m4a',
      status: 206,
      mimeType: 'audio/mp4',
      headers: { 'Content-Range': 'bytes 0-999/1000' },
      totalBytes: 1000,
    });

    await expect(
      downloadYouTubeStreamNatively(
        'https://rr1.googlevideo.com/videoplayback?c=IOS',
        'file:///mock_dir/openfy_downloads/track.m4a',
        { 'User-Agent': 'com.google.ios.youtube/test' }
      )
    ).resolves.toEqual({
      uri: 'file:///mock_dir/openfy_downloads/track.m4a',
      status: 206,
      mimeType: 'audio/mp4',
      headers: { 'Content-Range': 'bytes 0-999/1000' },
      totalBytes: 1000,
      sourceUrl: 'https://rr1.googlevideo.com/videoplayback?c=IOS',
    });

    expect(mockNativeDownload).toHaveBeenCalledWith(
      'https://rr1.googlevideo.com/videoplayback?c=IOS',
      'file:///mock_dir/openfy_downloads/track.m4a',
      { 'User-Agent': 'com.google.ios.youtube/test' },
      1024 * 1024
    );
  });

  it('does not trust malformed values returned across the native bridge', async () => {
    mockNativeDownload.mockResolvedValue({
      uri: 5,
      status: '206',
      headers: { server: 'googlevideo', attempts: 3 },
    });

    await expect(
      downloadYouTubeStreamNatively(
        'https://rr1.googlevideo.com/videoplayback?c=IOS',
        'file:///mock_dir/openfy_downloads/track.m4a',
        {}
      )
    ).resolves.toEqual({
      headers: { server: 'googlevideo' },
      sourceUrl: 'https://rr1.googlevideo.com/videoplayback?c=IOS',
    });
  });

  it('uses an exact virtual playback URI and forwards lock-screen metadata', async () => {
    mockNativePlay.mockResolvedValue(undefined);
    mockNativeStatus.mockResolvedValue({
      isPlaying: true,
      isLoaded: true,
      isBuffering: false,
      positionMs: 1200,
      durationMs: 180000,
    });
    const uri = toNativeYouTubePlaybackUri('V1M1hYxmRvA');

    expect(parseNativeYouTubePlaybackUri(uri)).toBe('V1M1hYxmRvA');
    expect(
      parseNativeYouTubePlaybackUri('https://youtube.com/watch?v=V1M1hYxmRvA')
    ).toBeNull();
    await expect(
      playYouTubeVideoNatively('V1M1hYxmRvA', {
        title: 'Faixa',
        artist: 'Artista',
        albumTitle: 'Álbum',
        artworkUrl: 'https://images.example/cover.jpg',
        artworkFallbackUrl: 'https://images.example/cover-fallback.jpg',
        durationMs: 180123,
      })
    ).resolves.toBe(true);
    await expect(getNativeYouTubePlaybackStatus()).resolves.toMatchObject({
      isPlaying: true,
      positionMs: 1200,
    });
    expect(mockNativePlay).toHaveBeenCalledWith('V1M1hYxmRvA', {
      title: 'Faixa',
      artist: 'Artista',
      albumTitle: 'Álbum',
      artworkUrl: 'https://images.example/cover.jpg',
      artworkFallbackUrl: 'https://images.example/cover-fallback.jpg',
      durationMs: '180123',
    });
  });

  it('preloads audio through the iOS module and rejects invalid video ids', async () => {
    mockNativePreload.mockResolvedValue({ bytes: 512 * 1024 });

    await expect(preloadNativeYouTubeAudio('V1M1hYxmRvA')).resolves.toEqual({
      bytes: 512 * 1024,
    });
    await expect(preloadNativeYouTubeAudio('invalid')).resolves.toBeNull();
    expect(mockNativePreload).toHaveBeenCalledTimes(1);
    expect(mockNativePreload).toHaveBeenCalledWith('V1M1hYxmRvA');
  });
});
