jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock_dir/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 100000 }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  createDownloadResumable: jest.fn().mockReturnValue({
    downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///mock_dir/audio.m4a' }),
  }),
  downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///mock_dir/cover.jpg' }),
  readAsStringAsync: jest.fn().mockResolvedValue('[]'),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { Base64: 'base64' },
  FileSystemSessionType: { BACKGROUND: 'background', FOREGROUND: 'foreground' },
}));

const mockNativeGoogleVideoDownload = jest.fn();
const mockNativePlayerAndDownload = jest.fn();

jest.mock('../../../modules/openfy-youtube', () => ({
  __esModule: true,
  default: {
    downloadGoogleVideoAsync: mockNativeGoogleVideoDownload,
    resolveAndDownloadGoogleVideoAsync: mockNativePlayerAndDownload,
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { resolveAudioUrl } from '../../audio/audioResolver';
import {
  downloadAudio,
  downloadTrack,
  getPendingDownloads,
  queueDownloads,
} from '../downloadManager';

jest.mock('../../audio/audioResolver', () => ({
  getPlayableAudioUrl: jest.fn((url: string) => url),
  resolveAudioUrl: jest.fn(),
  resolveViaSoundCloud: jest.fn(),
  resolveViaYouTubeTopic: jest.fn(),
}));

jest.mock('../../lyrics/lyricsService', () => ({
  fetchLyrics: jest.fn().mockResolvedValue(null),
  saveLyricsOffline: jest.fn(),
}));

const resolveAudioUrlMock = resolveAudioUrl as jest.Mock;
const fileSystemMock = FileSystem as jest.Mocked<typeof FileSystem>;
const fetchMock = jest.fn();

describe('queueDownloads', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resolveAudioUrlMock.mockReset();
    fileSystemMock.getInfoAsync.mockReset();
    fileSystemMock.getInfoAsync.mockResolvedValue({ exists: true, size: 100000 });
    fileSystemMock.createDownloadResumable.mockReset();
    fileSystemMock.createDownloadResumable.mockReturnValue({
      downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///mock_dir/audio.m4a' }),
    } as ReturnType<typeof FileSystem.createDownloadResumable>);
    fileSystemMock.downloadAsync.mockReset();
    fileSystemMock.downloadAsync.mockResolvedValue({ uri: 'file:///mock_dir/cover.jpg' });
    mockNativeGoogleVideoDownload.mockReset();
    mockNativePlayerAndDownload.mockReset();
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('persists hydrated audio URL and format for background resume', async () => {
    await queueDownloads([
      {
        spotifyId: 'home_7minutoz_aladdin',
        title: 'Aladdin',
        artistName: '7 Minutoz',
        albumName: 'Single',
        imageURL: 'https://images.test/aladdin.webp',
        duration_ms: 200188,
        audioUrl: 'https://media.test/aladdin.m4a',
        audioFormat: 'm4a',
      },
    ]);

    await expect(getPendingDownloads()).resolves.toMatchObject([
      {
        audioUrl: 'https://media.test/aladdin.m4a',
        audioFormat: 'm4a',
        track: {
          spotifyId: 'home_7minutoz_aladdin',
          audioUrl: 'https://media.test/aladdin.m4a',
          audioFormat: 'm4a',
        },
      },
    ]);
  });

  it('BUG-R1: iPhone resolves a fresh on-device stream before a server-provided URL', async () => {
    resolveAudioUrlMock.mockResolvedValue({
      url: 'https://rr1.googlevideo.com/fresh-on-device.m4a?c=IOS',
      format: 'm4a',
      quality: 'high',
      source: 'youtube',
    });

    await expect(
      downloadTrack({
        spotifyId: 'yt_12345678901',
        title: 'Faixa local',
        artistName: 'Artista local',
        albumName: 'Álbum local',
        imageURL: '',
        duration_ms: 180000,
        audioUrl: 'https://server.test/api/audio/proxy?url=stale-server-stream',
        audioFormat: 'm4a',
      })
    ).resolves.toMatchObject({
      localAudioPath: 'file:///mock_dir/audio.m4a',
    });

    expect(resolveAudioUrlMock).toHaveBeenCalledWith(
      'Faixa local',
      'Artista local',
      'yt_12345678901',
      180000
    );
    expect(fileSystemMock.createDownloadResumable).toHaveBeenCalledWith(
      'https://rr1.googlevideo.com/fresh-on-device.m4a?c=IOS',
      expect.any(String),
      expect.objectContaining({
        sessionType: 'background',
        headers: expect.objectContaining({
          Range: 'bytes=0-',
          'User-Agent':
            'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)',
        }),
      }),
      expect.any(Function)
    );
  });

  it('BUG-R2: iPhone retries direct download in foreground when background returns an invalid file', async () => {
    resolveAudioUrlMock.mockResolvedValue({
      url: 'https://rr1.googlevideo.com/fresh-on-device.m4a?c=IOS',
      format: 'm4a',
      quality: 'high',
      source: 'youtube',
    });
    fileSystemMock.createDownloadResumable.mockReturnValueOnce({
      downloadAsync: jest.fn().mockResolvedValue({
        uri: 'file:///mock_dir/audio.m4a',
        status: 200,
      }),
    } as ReturnType<typeof FileSystem.createDownloadResumable>);
    const audioSizes = [1000, 1000, 100000];
    fileSystemMock.getInfoAsync.mockImplementation((uri) =>
      Promise.resolve(
        String(uri).includes('audio.m4a')
          ? { exists: true, size: audioSizes.shift() || 100000 }
          : { exists: true, size: 100000 }
      )
    );
    fileSystemMock.downloadAsync
      .mockResolvedValueOnce({ uri: 'file:///mock_dir/audio.m4a', status: 200 })
      .mockResolvedValueOnce({ uri: 'file:///mock_dir/audio.m4a', status: 200 });

    await expect(
      downloadTrack({
        spotifyId: 'yt_12345678902',
        title: 'Faixa foreground',
        artistName: 'Artista local',
        albumName: 'Álbum local',
        imageURL: '',
        duration_ms: 180000,
      })
    ).resolves.toMatchObject({
      localAudioPath: 'file:///mock_dir/audio.m4a',
    });

    expect(fileSystemMock.downloadAsync).toHaveBeenNthCalledWith(
      1,
      'https://rr1.googlevideo.com/fresh-on-device.m4a?c=IOS',
      expect.any(String),
      expect.objectContaining({
        sessionType: 'background',
        headers: expect.objectContaining({ Range: 'bytes=0-' }),
      })
    );
    expect(fileSystemMock.downloadAsync).toHaveBeenNthCalledWith(
      2,
      'https://rr1.googlevideo.com/fresh-on-device.m4a?c=IOS',
      expect.any(String),
      expect.objectContaining({
        sessionType: 'foreground',
        headers: expect.objectContaining({ Range: 'bytes=0-' }),
      })
    );
  });

  it('BUG-R3: iPhone saves audio through fetch when URLSession rejects a signed stream', async () => {
    fileSystemMock.createDownloadResumable.mockReturnValueOnce({
      downloadAsync: jest.fn().mockRejectedValue(new Error('URLSession failed')),
    } as ReturnType<typeof FileSystem.createDownloadResumable>);
    fileSystemMock.downloadAsync.mockRejectedValue(new Error('URLSession failed'));
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name === 'content-type'
            ? 'audio/mp4'
            : name === 'content-length'
              ? '60000'
              : name === 'content-range'
                ? 'bytes 0-59999/60000'
              : null,
      },
      arrayBuffer: async () => new Uint8Array(60000).buffer,
    });

    await expect(
      downloadAudio(
        'https://rr1.googlevideo.com/audio.m4a?c=IOS&clen=60000',
        'track_3',
        'm4a'
      )
    ).resolves.toBe('file:///mock_dir/openfy_downloads/track_3.m4a');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://rr1.googlevideo.com/audio.m4a?c=IOS&clen=60000',
      expect.objectContaining({
        headers: expect.objectContaining({
          Range: 'bytes=0-59999',
          'User-Agent':
            'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)',
        }),
      })
    );
    expect(fileSystemMock.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///mock_dir/openfy_downloads/track_3.m4a',
      expect.any(String),
      expect.objectContaining({ encoding: 'base64' })
    );
  });

  it('uses the single native range transport before Expo FileSystem for googlevideo', async () => {
    mockNativeGoogleVideoDownload.mockResolvedValue({
      uri: 'file:///mock_dir/openfy_downloads/track_native.m4a',
      status: 206,
      mimeType: 'audio/mp4',
      headers: { 'Content-Range': 'bytes 0-99999/100000' },
      totalBytes: 100000,
    });

    await expect(
      downloadAudio(
        'https://rr1.googlevideo.com/audio.m4a?c=IOS&clen=100000',
        'track_native',
        'm4a'
      )
    ).resolves.toBe('file:///mock_dir/openfy_downloads/track_native.m4a');

    expect(mockNativeGoogleVideoDownload).toHaveBeenCalledWith(
      'https://rr1.googlevideo.com/audio.m4a?c=IOS&clen=100000',
      'file:///mock_dir/openfy_downloads/track_native.m4a',
      {
        'User-Agent':
          'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)',
      },
      2 * 1024 * 1024
    );
    expect(fileSystemMock.createDownloadResumable).not.toHaveBeenCalled();
  });

  it('keeps iOS player resolution and the media transfer in the native session', async () => {
    mockNativePlayerAndDownload.mockResolvedValue({
      uri: 'file:///mock_dir/openfy_downloads/track_player.m4a',
      status: 206,
      mimeType: 'audio/mp4',
      totalBytes: 100000,
    });

    await expect(
      downloadAudio(
        'https://rr1.googlevideo.com/audio.m4a?c=IOS&clen=100000',
        'track_player',
        'm4a',
        undefined,
        'V1M1hYxmRvA'
      )
    ).resolves.toBe('file:///mock_dir/openfy_downloads/track_player.m4a');

    expect(mockNativePlayerAndDownload).toHaveBeenCalledWith(
      'V1M1hYxmRvA',
      'file:///mock_dir/openfy_downloads/track_player.m4a',
      2 * 1024 * 1024
    );
    expect(mockNativeGoogleVideoDownload).not.toHaveBeenCalled();
    expect(fileSystemMock.createDownloadResumable).not.toHaveBeenCalled();
  });
});
