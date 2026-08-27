const mockNativeDownload = jest.fn();

jest.mock('../../../modules/openfy-youtube', () => ({
  __esModule: true,
  default: {
    downloadGoogleVideoAsync: mockNativeDownload,
  },
}));

import { downloadYouTubeStreamNatively } from '../nativeYouTubeTransfer';

describe('downloadYouTubeStreamNatively', () => {
  beforeEach(() => {
    mockNativeDownload.mockReset();
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
