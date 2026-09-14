jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock_dir/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 100000 }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  createDownloadResumable: jest.fn().mockReturnValue({
    downloadAsync: jest
      .fn()
      .mockResolvedValue({ uri: 'file:///mock_dir/audio.m4a' }),
  }),
  downloadAsync: jest
    .fn()
    .mockResolvedValue({ uri: 'file:///mock_dir/cover.jpg' }),
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
import { resolveDirectYouTubeAudio } from '../../audio/directYouTubeResolver';
import { resolveSpotifyTrackVideoId } from '../../audio/catalogResolver';
import { getDownloadDiagnostics } from '../downloadDiagnostics';
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

jest.mock('../../audio/directYouTubeResolver', () => ({
  ...jest.requireActual('../../audio/directYouTubeResolver'),
  resolveDirectYouTubeAudio: jest.fn(),
}));

jest.mock('../../audio/catalogResolver', () => ({
  ...jest.requireActual('../../audio/catalogResolver'),
  resolveSpotifyTrackVideoId: jest.fn(),
}));

jest.mock('../../lyrics/lyricsService', () => ({
  fetchLyrics: jest.fn().mockResolvedValue(null),
  saveLyricsOffline: jest.fn(),
}));

const resolveAudioUrlMock = resolveAudioUrl as jest.Mock;
const directAudioMock = resolveDirectYouTubeAudio as jest.Mock;
const catalogMock = resolveSpotifyTrackVideoId as jest.Mock;
const fileSystemMock = FileSystem as jest.Mocked<typeof FileSystem>;
const fetchMock = jest.fn();

describe('queueDownloads', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resolveAudioUrlMock.mockReset();
    directAudioMock.mockReset();
    catalogMock.mockReset();
    catalogMock.mockResolvedValue({ status: 'not_found', reason: 'no_canonical_match' });
    jest.requireMock('../../../modules/openfy-youtube').default
      .resolveAndDownloadGoogleVideoAsync = mockNativePlayerAndDownload;
    fileSystemMock.getInfoAsync.mockReset();
    fileSystemMock.getInfoAsync.mockResolvedValue({
      exists: true,
      size: 100000,
    });
    fileSystemMock.createDownloadResumable.mockReset();
    fileSystemMock.createDownloadResumable.mockReturnValue({
      downloadAsync: jest
        .fn()
        .mockResolvedValue({ uri: 'file:///mock_dir/audio.m4a' }),
    } as ReturnType<typeof FileSystem.createDownloadResumable>);
    fileSystemMock.downloadAsync.mockReset();
    fileSystemMock.downloadAsync.mockResolvedValue({
      uri: 'file:///mock_dir/cover.jpg',
    });
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

  it('BUG-R1: iPhone resolves an on-device stream before a stale supplied URL', async () => {
    directAudioMock.mockResolvedValue({
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
        audioUrl: 'https://media.test/stale-stream.m4a',
        audioFormat: 'm4a',
      })
    ).resolves.toMatchObject({
      localAudioPath: 'file:///mock_dir/audio.m4a',
    });

    expect(directAudioMock).toHaveBeenCalledWith({
      videoId: '12345678901',
      spotifyId: 'yt_12345678901',
      fresh: false,
    });
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

  it('keeps the matched YouTube videoId so iPhone can bypass stale supplied URLs', async () => {
    resolveAudioUrlMock.mockResolvedValue(null);
    mockNativePlayerAndDownload.mockResolvedValue({
      uri: 'file:///mock_dir/openfy_downloads/track_spotify_track_123.m4a',
      status: 206,
      mimeType: 'audio/mp4',
      totalBytes: 100000,
    });

    await expect(
      downloadTrack(
        {
          spotifyId: 'spotify_track_123',
          title: 'Faixa com match',
          artistName: 'Artista local',
          albumName: 'Álbum local',
          imageURL: '',
          duration_ms: 180000,
          youtubeVideoId: 'V1M1hYxmRvA',
        },
        'https://media.test/stale-stream.m4a',
        'm4a'
      )
    ).resolves.toMatchObject({
      localAudioPath:
        'file:///mock_dir/openfy_downloads/track_spotify_track_123.m4a',
    });

    expect(mockNativePlayerAndDownload).toHaveBeenCalledWith(
      'V1M1hYxmRvA',
      'file:///mock_dir/openfy_downloads/track_spotify_track_123.m4a',
      1024 * 1024
    );
  });

  it('downloads an exact YouTube track natively even when JS cannot resolve a stream URL', async () => {
    resolveAudioUrlMock.mockResolvedValue(null);
    mockNativePlayerAndDownload.mockResolvedValue({
      uri: 'file:///mock_dir/openfy_downloads/track_yt_V1M1hYxmRvA.m4a',
      status: 206,
      mimeType: 'audio/mp4',
      totalBytes: 100000,
    });

    await expect(
      downloadTrack({
        spotifyId: 'yt_V1M1hYxmRvA',
        title: 'Faixa exata',
        artistName: 'YouTube Music',
        albumName: 'YouTube Track',
        imageURL: '',
        duration_ms: 180000,
        youtubeVideoId: 'V1M1hYxmRvA',
      })
    ).resolves.toMatchObject({
      localAudioPath:
        'file:///mock_dir/openfy_downloads/track_yt_V1M1hYxmRvA.m4a',
    });

    expect(mockNativePlayerAndDownload).toHaveBeenCalledWith(
      'V1M1hYxmRvA',
      'file:///mock_dir/openfy_downloads/track_yt_V1M1hYxmRvA.m4a',
      1024 * 1024
    );
    expect(fileSystemMock.createDownloadResumable).not.toHaveBeenCalled();
    expect(fileSystemMock.downloadAsync).toHaveBeenCalledTimes(0);
  });

  it('downloads a Spotify catalog match on iPhone without requiring a JS stream URL', async () => {
    const track = {
      spotifyId: '5MzjslXCcY4XQtCmgk3eum',
      title: 'Indecisão',
      artistName: 'Sotam, Rob, Felipe Phyre, Matheus Muniz',
      albumName: 'Spotify',
      imageURL: '',
      duration_ms: 0,
    };
    catalogMock.mockResolvedValue({
      status: 'resolved', videoId: '_MyOuFWnPPY', confidence: 100,
    });
    resolveAudioUrlMock.mockResolvedValue(null);
    directAudioMock.mockResolvedValue(null);
    mockNativePlayerAndDownload.mockImplementation(async () => {
      expect(await getPendingDownloads()).toEqual(expect.arrayContaining([
        expect.objectContaining({
          track: expect.objectContaining({ youtubeVideoId: '_MyOuFWnPPY' }),
          audioFormat: 'm4a',
        }),
      ]));
      return {
        uri: 'file:///mock_dir/openfy_downloads/track_5MzjslXCcY4XQtCmgk3eum.m4a',
        status: 206, mimeType: 'audio/mp4', totalBytes: 100000,
      };
    });

    await expect(downloadTrack(track)).resolves.toMatchObject({
      spotifyId: track.spotifyId,
      localAudioPath: 'file:///mock_dir/openfy_downloads/track_5MzjslXCcY4XQtCmgk3eum.m4a',
    });

    expect(catalogMock).toHaveBeenCalledWith(
      track.spotifyId, track.title, [track.artistName], 0
    );
    expect(mockNativePlayerAndDownload).toHaveBeenCalledWith(
      '_MyOuFWnPPY',
      'file:///mock_dir/openfy_downloads/track_5MzjslXCcY4XQtCmgk3eum.m4a',
      1024 * 1024
    );
    expect(resolveAudioUrlMock).not.toHaveBeenCalled();
    expect(directAudioMock).not.toHaveBeenCalled();
    expect(fileSystemMock.createDownloadResumable).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps the matched video on native failure and records the provider refusal', async () => {
    catalogMock.mockResolvedValue({
      status: 'resolved', videoId: '_MyOuFWnPPY', confidence: 100,
    });
    mockNativePlayerAndDownload.mockResolvedValue({
      status: 200,
      mimeType: 'application/json',
      headers: {
        'X-Playability-Status': 'LOGIN_REQUIRED',
        'X-Playability-Reason': 'Sign in to confirm your age',
      },
    });
    directAudioMock.mockResolvedValue(null);

    await expect(downloadTrack({
      spotifyId: 'spotify_native_refusal', title: 'Indecisão',
      artistName: 'Sotam', albumName: 'Spotify', imageURL: '', duration_ms: 0,
    })).resolves.toBeNull();

    expect(mockNativePlayerAndDownload).toHaveBeenCalledTimes(1);
    expect(catalogMock).toHaveBeenCalledTimes(1);
    expect(directAudioMock).toHaveBeenCalledWith({
      videoId: '_MyOuFWnPPY', spotifyId: 'spotify_native_refusal', fresh: false,
    });
    expect(resolveAudioUrlMock).not.toHaveBeenCalled();
    const diagnostic = await getDownloadDiagnostics('spotify_native_refusal');
    expect(diagnostic?.events).toContainEqual(expect.objectContaining({
      phase: 'audio.response',
      details: expect.objectContaining({
        headers: {
          'X-Playability-Status': 'LOGIN_REQUIRED',
          'X-Playability-Reason': 'Sign in to confirm your age',
        },
      }),
    }));
    expect(await getPendingDownloads()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        track: expect.objectContaining({ youtubeVideoId: '_MyOuFWnPPY' }),
      }),
    ]));
  });

  it('falls back to a stream for the same video when native resolution fails', async () => {
    catalogMock.mockResolvedValue({
      status: 'resolved', videoId: '_MyOuFWnPPY', confidence: 100,
    });
    mockNativePlayerAndDownload.mockRejectedValue(new Error('native player timeout'));
    directAudioMock.mockResolvedValue({
      videoId: '_MyOuFWnPPY',
      url: 'https://rr1.googlevideo.com/local.m4a?c=IOS', format: 'm4a',
    });

    await expect(downloadTrack({
      spotifyId: 'spotify_native_fallback', title: 'Indecisão',
      artistName: 'Sotam', albumName: 'Spotify', imageURL: '', duration_ms: 0,
    })).resolves.toMatchObject({ localAudioPath: 'file:///mock_dir/audio.m4a' });

    expect(mockNativePlayerAndDownload).toHaveBeenCalledTimes(1);
    expect(resolveAudioUrlMock).not.toHaveBeenCalled();
    expect(directAudioMock).toHaveBeenCalledWith({
      videoId: '_MyOuFWnPPY', spotifyId: 'spotify_native_fallback', fresh: false,
    });
  });

  it('uses the JS fallback and reports when the installed binary lacks native downloads', async () => {
    jest.requireMock('../../../modules/openfy-youtube').default
      .resolveAndDownloadGoogleVideoAsync = undefined;
    resolveAudioUrlMock.mockResolvedValue({
      url: 'https://media.test/local.mp3', format: 'mp3', source: 'soundcloud',
    });

    await expect(downloadTrack({
      spotifyId: 'spotify_older_binary', title: 'Track',
      artistName: 'Artist', albumName: 'Spotify', imageURL: '', duration_ms: 0,
    })).resolves.toMatchObject({ localAudioPath: 'file:///mock_dir/audio.m4a' });

    expect(catalogMock).not.toHaveBeenCalled();
    expect(mockNativePlayerAndDownload).not.toHaveBeenCalled();
    const diagnostic = await getDownloadDiagnostics('spotify_older_binary');
    expect(diagnostic?.events).toContainEqual(expect.objectContaining({
      phase: 'audio.native.capability', details: { available: false },
    }));
  });

  it('BUG-R2: iPhone retries direct download in foreground when background returns an invalid file', async () => {
    directAudioMock.mockResolvedValue({
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
      .mockResolvedValueOnce({
        uri: 'file:///mock_dir/audio.m4a',
        status: 200,
      });

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
      downloadAsync: jest
        .fn()
        .mockRejectedValue(new Error('URLSession failed')),
    } as ReturnType<typeof FileSystem.createDownloadResumable>);
    fileSystemMock.downloadAsync.mockRejectedValue(
      new Error('URLSession failed')
    );
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
      1024 * 1024
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
      1024 * 1024
    );
    expect(mockNativeGoogleVideoDownload).not.toHaveBeenCalled();
    expect(fileSystemMock.createDownloadResumable).not.toHaveBeenCalled();
  });
});
