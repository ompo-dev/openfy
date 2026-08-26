jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@services', () => ({
  DEFAULT_STATE: {
    isPlaying: false,
    isBuffering: false,
    isLoaded: false,
    positionMs: 0,
    durationMs: 0,
  },
  loadAndPlay: jest.fn().mockResolvedValue(true),
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  seekTo: jest.fn().mockResolvedValue(undefined),
  unload: jest.fn().mockResolvedValue(undefined),
  getStatus: jest.fn(() => ({ isPlaying: false })),
  resolveAudioUrl: jest.fn(),
  getPlayableAudioUrl: jest.fn((url: string) => url),
  downloadTrack: jest.fn().mockResolvedValue(null),
  getDownloadedTrack: jest.fn().mockResolvedValue(null),
  fadeOutCurrent: jest.fn().mockResolvedValue(undefined),
  restoreCurrentVolume: jest.fn().mockResolvedValue(undefined),
  preloadAudio: jest.fn().mockResolvedValue(undefined),
  releasePreloadedAudio: jest.fn(),
  recordInteraction: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/lyrics/lyricsService', () => ({
  fetchLyrics: jest.fn().mockResolvedValue(null),
  saveLyricsOffline: jest.fn().mockResolvedValue(undefined),
}));

import {
  DEFAULT_STATE,
  downloadTrack,
  getDownloadedTrack,
  loadAndPlay,
  preloadAudio,
  releasePreloadedAudio,
  resolveAudioUrl,
} from '@services';
import { usePlayerStore, type PlayerTrack } from '../usePlayerStore';

const tracks: PlayerTrack[] = [
  {
    spotifyId: 'AAAAAAAAAAAAAAAAAAAAAA',
    title: 'Anterior',
    artistName: 'Artista',
    albumName: 'Álbum',
    imageURL: '',
    duration_ms: 180000,
  },
  {
    spotifyId: 'BBBBBBBBBBBBBBBBBBBBBB',
    title: 'Atual',
    artistName: 'Artista',
    albumName: 'Álbum',
    imageURL: '',
    duration_ms: 180000,
  },
  {
    spotifyId: 'CCCCCCCCCCCCCCCCCCCCCC',
    title: 'Próxima',
    artistName: 'Artista',
    albumName: 'Álbum',
    imageURL: '',
    duration_ms: 180000,
  },
];

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe('queue preload window', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDownloadedTrack as jest.Mock).mockResolvedValue(null);
    (loadAndPlay as jest.Mock).mockResolvedValue(true);
    (resolveAudioUrl as jest.Mock).mockImplementation((title: string) =>
      Promise.resolve({ url: `https://media.test/${title}.m4a`, format: 'm4a' })
    );
    (preloadAudio as jest.Mock).mockResolvedValue(undefined);
    usePlayerStore.setState({
      activeRequestId: 0,
      currentTrack: null,
      history: [],
      isLoadingAudio: false,
      isLoadingLyrics: false,
      lyricsData: null,
      playerState: DEFAULT_STATE,
      queue: [],
      queueIndex: 0,
      queueSourceId: null,
    });
  });

  it('warms the previous and next tracks, then releases a track that leaves the window', async () => {
    await usePlayerStore.getState().playWithQueue(tracks, 1, 'library:songs');
    await flushAsync();

    expect(preloadAudio).toHaveBeenCalledWith('https://media.test/Anterior.m4a');
    expect(preloadAudio).toHaveBeenCalledWith('https://media.test/Próxima.m4a');

    await usePlayerStore.getState().playNext();
    await flushAsync();

    expect(releasePreloadedAudio).toHaveBeenCalledWith('https://media.test/Anterior.m4a');
  });

  it('does not start a second download for a track already saved in the web library', async () => {
    const savedUrl =
      'http://localhost:3001/api/audio/proxy?url=https%3A%2F%2Fmedia.test%2FAtual.m4a';
    (getDownloadedTrack as jest.Mock).mockResolvedValue({
      ...tracks[1],
      localAudioPath: savedUrl,
    });

    await usePlayerStore.getState().playTrack(tracks[1]);

    expect(resolveAudioUrl).not.toHaveBeenCalled();
    expect(loadAndPlay).toHaveBeenCalledWith(
      savedUrl,
      expect.any(Function),
      expect.any(Object),
      2000
    );
    expect(downloadTrack).not.toHaveBeenCalled();
  });

  it('plays the saved web audioUrl from the download registry before resolving', async () => {
    const savedUrl =
      'http://localhost:3001/api/audio/proxy?url=https%3A%2F%2Fmedia.test%2FRegistry.m4a';
    (getDownloadedTrack as jest.Mock).mockResolvedValue({
      ...tracks[1],
      audioUrl: savedUrl,
    });

    await usePlayerStore.getState().playTrack(tracks[1]);

    expect(resolveAudioUrl).not.toHaveBeenCalled();
    expect(loadAndPlay).toHaveBeenCalledWith(
      savedUrl,
      expect.any(Function),
      expect.any(Object),
      2000
    );
  });

  it('plays the saved web stream before asking the resolver for another URL', async () => {
    const savedTrack: PlayerTrack = {
      ...tracks[1],
      spotifyId: 'DDDDDDDDDDDDDDDDDDDDDD',
      title: 'Salva',
      streamUrl:
        'http://localhost:3001/api/audio/proxy?url=https%3A%2F%2Fmedia.test%2FSalva.m4a',
    };

    await usePlayerStore.getState().playTrack(savedTrack);

    expect(resolveAudioUrl).not.toHaveBeenCalled();
    expect(loadAndPlay).toHaveBeenCalledWith(
      savedTrack.streamUrl,
      expect.any(Function),
      expect.any(Object),
      2000
    );
  });
});
