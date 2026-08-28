const mockNativeDownload = jest.fn();
const mockNativeResolveAndDownload = jest.fn();

jest.mock('../../../modules/openfy-youtube', () => ({
  __esModule: true,
  default: {
    downloadGoogleVideoAsync: mockNativeDownload,
    resolveAndDownloadGoogleVideoAsync: mockNativeResolveAndDownload,
  },
}));

import {
  downloadYouTubeStreamNatively,
  resolveAndDownloadYouTubeVideoNatively,
} from '../nativeYouTubeTransfer';

describe('downloadYouTubeStreamNatively', () => {
  beforeEach(() => {
    mockNativeDownload.mockReset();
    mockNativeResolveAndDownload.mockReset();
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
      2 * 1024 * 1024
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
      2 * 1024 * 1024
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
});
