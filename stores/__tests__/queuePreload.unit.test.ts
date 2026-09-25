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
  beginTrackChange: jest.fn(),
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  seekTo: jest.fn().mockResolvedValue(undefined),
  unload: jest.fn().mockResolvedValue(undefined),
  getStatus: jest.fn(() => ({ isPlaying: false })),
  resolveAudioUrl: jest.fn(),
  getPlayableAudioUrl: jest.fn((url: string) => url),
  downloadTrack: jest.fn().mockResolvedValue(null),
  ensurePlaybackDiagnostics: jest.fn().mockResolvedValue(undefined),
  getDownloadedTrack: jest.fn().mockResolvedValue(null),
  fadeOutCurrent: jest.fn().mockResolvedValue(undefined),
  restoreCurrentVolume: jest.fn().mockResolvedValue(undefined),
  preloadAudio: jest.fn().mockResolvedValue(undefined),
  releasePreloadedAudio: jest.fn(),
  setRemotePlaybackHandlers: jest.fn(),
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
  unload,
} from '@services';
import { usePlayerStore, type PlayerTrack } from '../usePlayerStore';

const realPlayTrack = usePlayerStore.getState().playTrack;

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
      queueOriginalOrder: [],
      queueIndex: 0,
      queueSourceId: null,
      isShuffle: false,
      repeatMode: 'off',
      playTrack: realPlayTrack,
    });
  });

  it('warms the previous and next tracks, then releases a track that leaves the window', async () => {
    await usePlayerStore.getState().playWithQueue(tracks, 1, 'library:songs');
    await flushAsync();

    expect(preloadAudio).toHaveBeenCalledWith(
      'https://media.test/Anterior.m4a'
    );
    expect(preloadAudio).toHaveBeenCalledWith('https://media.test/Próxima.m4a');

    await usePlayerStore.getState().playNext();
    await flushAsync();

    expect(releasePreloadedAudio).toHaveBeenCalledWith(
      'https://media.test/Anterior.m4a'
    );
  });

  it('does not start a second download for a track already saved in the web library', async () => {
    const savedUrl = 'https://media.test/Atual.m4a';
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
      0,
      tracks[1]
    );
    expect(downloadTrack).not.toHaveBeenCalled();
  });

  it('plays the saved web audioUrl from the download registry before resolving', async () => {
    const savedUrl = 'https://media.test/Registry.m4a';
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
      0,
      tracks[1]
    );
  });

  it('plays the saved web stream before asking the resolver for another URL', async () => {
    const savedTrack: PlayerTrack = {
      ...tracks[1],
      spotifyId: 'DDDDDDDDDDDDDDDDDDDDDD',
      title: 'Salva',
      streamUrl: 'https://media.test/Salva.m4a',
    };

    await usePlayerStore.getState().playTrack(savedTrack);

    expect(resolveAudioUrl).not.toHaveBeenCalled();
    expect(loadAndPlay).toHaveBeenCalledWith(
      savedTrack.streamUrl,
      expect.any(Function),
      expect.any(Object),
      0,
      savedTrack
    );
  });

  it('streams a catalog-only YouTube track without requiring a download', async () => {
    const catalogTrack: PlayerTrack = {
      ...tracks[1],
      spotifyId: 'catalog-only-track',
      title: 'Faixa só no catálogo',
      youtubeVideoId: 'V1M1hYxmRvA',
    };
    const streamUrl = 'https://media.test/catalog-only.m4a';
    (resolveAudioUrl as jest.Mock).mockResolvedValue({
      url: streamUrl,
      format: 'm4a',
    });

    await usePlayerStore.getState().playTrack(catalogTrack);

    expect(getDownloadedTrack).toHaveBeenCalledWith(catalogTrack.spotifyId);
    expect(resolveAudioUrl).toHaveBeenCalledWith(
      catalogTrack.title,
      catalogTrack.artistName,
      `yt_${catalogTrack.youtubeVideoId}`,
      catalogTrack.duration_ms
    );
    expect(loadAndPlay).toHaveBeenCalledWith(
      streamUrl,
      expect.any(Function),
      expect.any(Object),
      0,
      catalogTrack
    );
  });

  it('never shares a warmed source between different catalog ids with matching metadata', async () => {
    const firstTrack: PlayerTrack = {
      ...tracks[1],
      spotifyId: 'yt_AAAAAAAAAAA',
      youtubeVideoId: 'AAAAAAAAAAA',
      title: 'Mesmo título',
      artistName: 'Mesmo artista',
    };
    const secondTrack: PlayerTrack = {
      ...firstTrack,
      spotifyId: 'yt_BBBBBBBBBBB',
      youtubeVideoId: 'BBBBBBBBBBB',
    };
    (resolveAudioUrl as jest.Mock).mockImplementation(
      (_title: string, _artist: string, trackId: string) =>
        Promise.resolve({ url: `https://media.test/${trackId}.m4a`, format: 'm4a' })
    );

    await usePlayerStore.getState().playTrack(firstTrack);
    await usePlayerStore.getState().playTrack(secondTrack);

    expect(resolveAudioUrl).toHaveBeenCalledWith(
      secondTrack.title,
      secondTrack.artistName,
      `yt_${secondTrack.youtubeVideoId}`,
      secondTrack.duration_ms
    );
    expect(loadAndPlay).toHaveBeenLastCalledWith(
      `https://media.test/yt_${secondTrack.youtubeVideoId}.m4a`,
      expect.any(Function),
      expect.any(Object),
      0,
      secondTrack
    );
  });

  it('fully unloads the old engine when the selected track has no valid source', async () => {
    const unresolvedTrack: PlayerTrack = {
      ...tracks[1],
      spotifyId: 'yt_CCCCCCCCCCC',
      youtubeVideoId: 'CCCCCCCCCCC',
      title: 'Sem fonte',
    };
    (resolveAudioUrl as jest.Mock).mockResolvedValue(null);

    await usePlayerStore.getState().playTrack(unresolvedTrack);

    expect(loadAndPlay).not.toHaveBeenCalled();
    expect(unload).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState().playerState.error).toBe(
      'Não foi possível carregar o áudio desta faixa.'
    );
  });

  describe('playQueueIndex', () => {
    afterEach(() => {
      usePlayerStore.setState({ playTrack: realPlayTrack });
    });

    it('ignores invalid indexes without changing queue state', async () => {
      const playTrack = jest.fn().mockResolvedValue(undefined);
      usePlayerStore.setState({
        playTrack,
        queue: tracks,
        queueIndex: 1,
        queueSourceId: 'library:songs',
      });

      await usePlayerStore.getState().playQueueIndex(-1);
      await usePlayerStore.getState().playQueueIndex(tracks.length);

      expect(playTrack).not.toHaveBeenCalled();
      expect(usePlayerStore.getState().queueIndex).toBe(1);
      expect(usePlayerStore.getState().queueSourceId).toBe('library:songs');
    });

    it('plays the exact target index and preserves the queue source', async () => {
      const playTrack = jest.fn().mockResolvedValue(undefined);
      usePlayerStore.setState({
        playTrack,
        queue: tracks,
        queueIndex: 0,
        queueSourceId: 'playlist:daily',
      });

      await usePlayerStore.getState().playQueueIndex(2);

      expect(usePlayerStore.getState().queueIndex).toBe(2);
      expect(usePlayerStore.getState().queueSourceId).toBe('playlist:daily');
      expect(playTrack).toHaveBeenCalledWith(tracks[2], { setQueue: false });
    });
  });

  describe('stable shuffle queue', () => {
    afterEach(() => {
      jest.restoreAllMocks();
      usePlayerStore.setState({ playTrack: realPlayTrack });
    });

    it('shuffles once and moves forward and backward through that exact order', async () => {
      const playTrack = jest.fn().mockResolvedValue(undefined);
      const randomSpy = jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0.5);
      usePlayerStore.setState({ playTrack });

      await usePlayerStore
        .getState()
        .playWithQueue(tracks, 0, 'playlist:shuffle', { shuffle: true });

      const shuffledQueue = [...usePlayerStore.getState().queue];
      expect(usePlayerStore.getState().isShuffle).toBe(true);
      expect(usePlayerStore.getState().queueOriginalOrder).toEqual(tracks);
      expect(shuffledQueue).toHaveLength(tracks.length);
      expect(new Set(shuffledQueue.map((track) => track.spotifyId))).toEqual(
        new Set(tracks.map((track) => track.spotifyId))
      );
      expect(randomSpy).toHaveBeenCalledTimes(tracks.length - 1);

      await usePlayerStore.getState().playNext();
      await usePlayerStore.getState().playNext();
      expect(usePlayerStore.getState().queueIndex).toBe(2);
      expect(playTrack).toHaveBeenLastCalledWith(shuffledQueue[2], {
        setQueue: false,
      });
      expect(randomSpy).toHaveBeenCalledTimes(tracks.length - 1);

      await usePlayerStore.getState().playPrevious();
      expect(usePlayerStore.getState().queueIndex).toBe(1);
      expect(playTrack).toHaveBeenLastCalledWith(shuffledQueue[1], {
        setQueue: false,
      });
      expect(randomSpy).toHaveBeenCalledTimes(tracks.length - 1);
    });

    it('keeps the current track selected when shuffle is disabled', () => {
      const shuffledQueue = [tracks[2], tracks[0], tracks[1]];
      usePlayerStore.setState({
        queue: shuffledQueue,
        queueOriginalOrder: tracks,
        queueIndex: 2,
        isShuffle: true,
      });

      usePlayerStore.getState().toggleShuffle();

      expect(usePlayerStore.getState().queue).toEqual(tracks);
      expect(usePlayerStore.getState().queueIndex).toBe(1);
      expect(usePlayerStore.getState().isShuffle).toBe(false);
    });
  });
});
