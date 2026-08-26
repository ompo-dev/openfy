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
  FileSystemSessionType: { BACKGROUND: 'background' },
}));

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

jest.mock('../../audio/audioResolver', () => ({
  getPlayableAudioUrl: jest.fn((url: string) => `https://api.test/audio/proxy?url=${url}`),
  resolveAudioUrl: jest.fn(),
  resolveViaSoundCloud: jest.fn(),
  resolveViaYouTubeTopic: jest.fn(),
}));

jest.mock('../../lyrics/lyricsService', () => ({
  fetchLyrics: jest.fn().mockResolvedValue(null),
  saveLyricsOffline: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getPlayableAudioUrl, resolveAudioUrl } from '../../audio/audioResolver';
import {
  downloadTrack,
  getPendingDownloads,
  isCompleteAudioDownload,
  queueDownloads,
} from '../downloadManager';

describe('isCompleteAudioDownload', () => {
  it('rejects an incomplete HTTP range response', () => {
    expect(isCompleteAudioDownload(206)).toBe(false);
    expect(isCompleteAudioDownload(200)).toBe(true);
  });
});

describe('queueDownloads', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
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
});

describe('downloadTrack', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('uses a supplied stream on iPhone and persists its completed local file', async () => {
    const suppliedUrl = 'https://r1.googlevideo.com/audio.m4a';

    const downloaded = await downloadTrack({
      spotifyId: 'home_7minutoz_aladdin',
      title: 'Aladdin',
      artistName: '7 Minutoz',
      albumName: 'Single',
      imageURL: '',
      duration_ms: 200188,
      audioUrl: suppliedUrl,
      audioFormat: 'm4a',
    });

    expect(getPlayableAudioUrl).toHaveBeenCalledWith(suppliedUrl);
    expect(FileSystem.createDownloadResumable).toHaveBeenCalledWith(
      `https://api.test/audio/proxy?url=${suppliedUrl}`,
      expect.stringContaining('track_home_7minutoz_aladdin.m4a'),
      expect.anything(),
      expect.any(Function)
    );
    expect(downloaded).toMatchObject({
      localAudioPath: 'file:///mock_dir/audio.m4a',
      audioUrl: `https://api.test/audio/proxy?url=${suppliedUrl}`,
    });
  });

  it('drops a pending item when no playable stream can be resolved', async () => {
    (resolveAudioUrl as jest.Mock).mockResolvedValue(null);

    await expect(
      downloadTrack({
        spotifyId: 'unavailable_track',
        title: 'Sem stream',
        artistName: 'Artista',
        albumName: 'Single',
        imageURL: '',
        duration_ms: 180000,
      })
    ).resolves.toBeNull();

    await expect(getPendingDownloads()).resolves.toEqual([]);
  });
});
