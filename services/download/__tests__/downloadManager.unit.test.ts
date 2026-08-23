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

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { resolveAudioUrl } from '../../audio/audioResolver';
import {
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
      url: 'https://rr1.googlevideo.test/fresh-on-device.m4a',
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
      'https://rr1.googlevideo.test/fresh-on-device.m4a',
      expect.any(String),
      expect.objectContaining({ sessionType: 'background' }),
      expect.any(Function)
    );
  });

  it('BUG-R2: iPhone retries direct download in foreground when background returns an invalid file', async () => {
    resolveAudioUrlMock.mockResolvedValue({
      url: 'https://rr1.googlevideo.test/fresh-on-device.m4a',
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
      'https://rr1.googlevideo.test/fresh-on-device.m4a',
      expect.any(String),
      expect.objectContaining({ sessionType: 'background' })
    );
    expect(fileSystemMock.downloadAsync).toHaveBeenNthCalledWith(
      2,
      'https://rr1.googlevideo.test/fresh-on-device.m4a',
      expect.any(String),
      expect.objectContaining({ sessionType: 'foreground' })
    );
  });
});
