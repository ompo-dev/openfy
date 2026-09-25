import * as React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';
import { usePlayer } from '@context';
import {
  getCatalogMapping,
  resolveDirectYouTubeAudio,
  resolveSpotifyTrackVideoId,
} from '@services';
import { FullPlayer } from '../FullPlayer';

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockSwipeableArtwork = jest.fn((props) => {
  const React = require('react');
  const { Image, View } = require('react-native');
  const source = props.artworkUri
    ? { uri: props.artworkUri }
    : props.fallbackSource;

  return (
    <View testID={props.testID}>
      <Image
        testID={`${props.testID}-current`}
        source={source}
        onError={props.onError}
      />
    </View>
  );
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, replace: mockReplace }),
  useSegments: () => ['(tabs)', 'library'],
}));
jest.mock('@api', () => ({ findArtistIdByName: jest.fn() }));
jest.mock('@context', () => ({ usePlayer: jest.fn() }));
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: ({
      children,
      style,
    }: React.PropsWithChildren<{ style?: unknown }>) => (
      <View style={style}>{children}</View>
    ),
  };
});
jest.mock('@services', () => ({
  ...jest.requireActual('../../../services/lyrics/lyricTimeline'),
  ...jest.requireActual('../../../services/spotify/linkParser'),
  getCatalogMapping: jest.fn(),
  resolveSpotifyTrackVideoId: jest.fn(),
  resolveDirectYouTubeAudio: jest.fn(),
  resolveDirectYouTubeTrack: jest.fn(),
}));
jest.mock('../SwipeableArtwork', () => ({
  SwipeableArtwork: (props: unknown) => mockSwipeableArtwork(props),
}));
jest.mock('../../native', () => {
  const { Pressable, View } = require('react-native');
  return { GlassSurface: View, LoggedPressable: Pressable };
});
jest.mock('../LyricSyncEditor', () => ({ LyricSyncEditor: () => null }));
jest.mock('@react-native-masked-view/masked-view', () => {
  return require('react-native').View;
});
jest.mock('@react-native-community/slider', () => {
  return require('react-native').View;
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => () => null);

const sampleTrack = {
  spotifyId: 'AAAAAAAAAAAAAAAAAAAAAA',
  title: 'A song',
  artistName: 'First Artist, Second Artist, Third Artist',
  artists: [
    { id: 'first', name: 'First Artist' },
    { id: 'second', name: 'Second Artist' },
    { id: 'third', name: 'Third Artist' },
  ],
  albumName: 'An album',
  duration_ms: 180000,
  imageURL: 'https://images.example/cover-640.jpg',
  localImagePath: 'file:///covers/cover-64.jpg',
};

const makePlayer = (track = {}) => ({
  currentTrack: { ...sampleTrack, ...track },
  playerState: { positionMs: 0, durationMs: 180000, isPlaying: false },
  playTrack: jest.fn().mockResolvedValue(undefined),
  togglePlayPause: jest.fn().mockResolvedValue(undefined),
  seekToPosition: jest.fn().mockResolvedValue(undefined),
  playQueueIndex: jest.fn().mockResolvedValue(undefined),
  playNext: jest.fn().mockResolvedValue(undefined),
  playPrevious: jest.fn().mockResolvedValue(undefined),
  queue: [],
  queueIndex: 0,
  lyricsData: null,
  isLoadingLyrics: false,
  isShuffle: false,
  repeatMode: 'off',
});

const makePlayerWithoutTrack = () => ({
  ...makePlayer(),
  currentTrack: null,
});

const mountPlayer = async (track = {}) => {
  jest.mocked(usePlayer).mockReturnValue(makePlayer(track) as any);
  return render(<FullPlayer visible onClose={jest.fn()} />);
};

const openSource = async (screen: Awaited<ReturnType<typeof render>>) => {
  await fireEvent.press(screen.getByLabelText('Opções do YouTube'));
  await fireEvent.press(screen.getByText('Ir para o vídeo do YouTube'));
};

const getLastArtworkProps = () =>
  mockSwipeableArtwork.mock.calls.at(-1)?.[0] as Record<string, any>;

describe('FullPlayer artist row and YouTube source', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSwipeableArtwork.mockClear();
    Platform.OS = 'android';
    jest.mocked(getCatalogMapping).mockReset().mockResolvedValue(null);
    jest.mocked(resolveSpotifyTrackVideoId).mockReset().mockResolvedValue({
      status: 'not_found',
      reason: 'no_canonical_match',
    });
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
    jest.restoreAllMocks();
  });

  it('can render with no track, rerender with a track, and return to no track', async () => {
    jest.mocked(usePlayer).mockReturnValue(makePlayerWithoutTrack() as any);
    const screen = await render(<FullPlayer visible onClose={jest.fn()} />);

    expect(screen.queryByTestId('player-artwork')).toBeNull();

    jest.mocked(usePlayer).mockReturnValue(makePlayer() as any);
    await screen.rerender(<FullPlayer visible onClose={jest.fn()} />);
    expect(screen.getByTestId('player-artwork')).toBeTruthy();

    jest.mocked(usePlayer).mockReturnValue(makePlayerWithoutTrack() as any);
    await screen.rerender(<FullPlayer visible onClose={jest.fn()} />);
    expect(screen.queryByTestId('player-artwork')).toBeNull();
  });

  it('keeps all artist links in one marquee and opens each artist', async () => {
    const screen = await mountPlayer({ youtubeVideoId: 'aaaaaaaaaaa' });
    expect(screen.getAllByTestId('player-artists')).toHaveLength(1);
    expect(screen.getByTestId('player-artists-text').props.numberOfLines).toBe(
      1
    );
    expect(
      screen.getByTestId('player-artists-measure-text', {
        includeHiddenElements: true,
      }).props.children
    ).toBe('First Artist · Second Artist · Third Artist');
    expect(
      screen.getByText('First Artist · Second Artist · Third Artist')
    ).toBeTruthy();
    for (const artist of sampleTrack.artists) {
      await fireEvent.press(
        screen.getByLabelText(`Abrir artista ${artist.name}`)
      );
      expect(mockNavigate).toHaveBeenLastCalledWith(
        `/(tabs)/library/artist/${artist.id}`,
        { dangerouslySingular: true }
      );
    }
  });

  it('keeps the artist-only pill when lyrics are open', async () => {
    const screen = await mountPlayer({ youtubeVideoId: 'aaaaaaaaaaa' });
    await fireEvent.press(screen.getByTestId('player-lyrics-toggle'));
    expect(screen.getAllByTestId('player-artists')).toHaveLength(1);
    expect(
      screen.getByTestId('player-artists-measure-text', {
        includeHiddenElements: true,
      }).props.children
    ).toBe('First Artist · Second Artist · Third Artist');
  });

  it('keeps synced lyrics visible across playback updates on a bounded native list', async () => {
    Platform.OS = 'ios';
    const state = {
      ...makePlayer(),
      lyricsData: {
        segments: [
          {
            index: 0,
            startTimeMs: 0,
            endTimeMs: 10000,
            text: 'First lyric line',
          },
          {
            index: 1,
            startTimeMs: 10000,
            endTimeMs: 20000,
            text: 'Second lyric line',
          },
        ],
      },
    };
    jest.mocked(usePlayer).mockReturnValue(state as any);
    const screen = await render(<FullPlayer visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('player-lyrics-toggle'));
    expect(screen.getByTestId('player-lyrics-viewport')).toBeTruthy();
    expect(
      screen.getByTestId('player-synced-lyrics').props.removeClippedSubviews
    ).toBe(false);
    expect(screen.getByText('First lyric line')).toBeTruthy();
    jest.mocked(usePlayer).mockReturnValue({
      ...state,
      playerState: { ...state.playerState, positionMs: 12000, isPlaying: true },
    } as any);
    await screen.rerender(<FullPlayer visible onClose={jest.fn()} />);
    expect(screen.getByText('Second lyric line')).toBeTruthy();
    expect(screen.getByLabelText('Fechar letras sincronizadas')).toBeTruthy();
  });

  it('shows plain lyrics instead of treating an empty synced list as an instrumental gap', async () => {
    jest.mocked(usePlayer).mockReturnValue({
      ...makePlayer(),
      lyricsData: {
        segments: [],
        plainLyrics: 'Plain first line\nPlain second line',
      },
    } as any);
    const screen = await render(<FullPlayer visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('player-lyrics-toggle'));
    expect(screen.getByTestId('player-plain-lyrics')).toBeTruthy();
    expect(screen.getByText('Plain first line')).toBeTruthy();
    expect(screen.queryByTestId('player-synced-lyrics')).toBeNull();
  });

  it('replaces the loading state when lyrics arrive without closing the lyrics view', async () => {
    jest
      .mocked(usePlayer)
      .mockReturnValue({ ...makePlayer(), isLoadingLyrics: true } as any);
    const screen = await render(<FullPlayer visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('player-lyrics-toggle'));
    expect(screen.queryByTestId('player-synced-lyrics')).toBeNull();
    jest.mocked(usePlayer).mockReturnValue({
      ...makePlayer(),
      lyricsData: { segments: [], plainLyrics: 'Newly loaded lyrics' },
    } as any);
    await screen.rerender(<FullPlayer visible onClose={jest.fn()} />);
    expect(screen.getByText('Newly loaded lyrics')).toBeTruthy();
    expect(screen.getByLabelText('Fechar letras sincronizadas')).toBeTruthy();
  });

  it.each([
    [
      {
        youtubeVideoId: 'aaaaaaaaaaa',
        youtubeUrl: 'https://youtu.be/bbbbbbbbbbb',
      },
      'aaaaaaaaaaa',
    ],
    [
      {
        youtubeUrl: 'https://music.youtube.com/watch?v=bbbbbbbbbbb&list=album',
      },
      'bbbbbbbbbbb',
    ],
    [{ spotifyId: 'yt_ccccccccccc' }, 'ccccccccccc'],
    [
      { youtubeVideoId: 'invalid', youtubeUrl: 'https://youtu.be/bbbbbbbbbbb' },
      'bbbbbbbbbbb',
    ],
  ])(
    'opens the exact saved source %j without a catalog or stream lookup',
    async (track, videoId) => {
      const screen = await mountPlayer(track);
      await openSource(screen);
      expect(Linking.openURL).toHaveBeenCalledWith(
        `https://www.youtube.com/watch?v=${videoId}`
      );
      expect(getCatalogMapping).not.toHaveBeenCalled();
      expect(resolveSpotifyTrackVideoId).not.toHaveBeenCalled();
      expect(resolveDirectYouTubeAudio).not.toHaveBeenCalled();
    }
  );

  it('opens the cached matched source without resolving a stream', async () => {
    jest.mocked(getCatalogMapping).mockResolvedValue({
      videoId: 'ddddddddddd',
      confidence: 98,
      confirmedAt: Date.now(),
      source: 'youtube_search',
    });
    const screen = await mountPlayer();
    await openSource(screen);
    expect(getCatalogMapping).toHaveBeenCalledWith(sampleTrack.spotifyId);
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=ddddddddddd'
    );
    expect(resolveSpotifyTrackVideoId).not.toHaveBeenCalled();
    expect(resolveDirectYouTubeAudio).not.toHaveBeenCalled();
  });

  it.each(['android', 'web'] as const)(
    'finds a source on %s using catalog metadata alone',
    async (platform) => {
      Platform.OS = platform;
      jest.mocked(resolveSpotifyTrackVideoId).mockResolvedValue({
        status: 'resolved',
        videoId: 'eeeeeeeeeee',
        confidence: 97,
      });
      const screen = await mountPlayer();
      await openSource(screen);
      expect(resolveSpotifyTrackVideoId).toHaveBeenCalledWith(
        sampleTrack.spotifyId,
        sampleTrack.title,
        sampleTrack.artists.map((artist) => artist.name),
        sampleTrack.duration_ms
      );
      expect(Linking.openURL).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=eeeeeeeeeee'
      );
      expect(resolveDirectYouTubeAudio).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    }
  );

  it('uses parsed artist names when structured artists are missing', async () => {
    await mountPlayer({ artists: undefined });
    expect(resolveSpotifyTrackVideoId).toHaveBeenCalledWith(
      sampleTrack.spotifyId,
      sampleTrack.title,
      ['First Artist', 'Second Artist', 'Third Artist'],
      sampleTrack.duration_ms
    );
  });

  it('falls back to catalog search after a cache read fails', async () => {
    jest
      .mocked(getCatalogMapping)
      .mockRejectedValue(new Error('Storage unavailable'));
    jest.mocked(resolveSpotifyTrackVideoId).mockResolvedValue({
      status: 'resolved',
      videoId: 'eeeeeeeeeee',
      confidence: 97,
    });
    const screen = await mountPlayer();
    await openSource(screen);
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=eeeeeeeeeee'
    );
  });

  it.each(['no match', 'search error'])(
    'handles %s without inventing an official video link',
    async (failure) => {
      if (failure === 'search error') {
        jest
          .mocked(resolveSpotifyTrackVideoId)
          .mockRejectedValue(new Error('Offline'));
      }
      const screen = await mountPlayer();
      await openSource(screen);
      expect(Linking.openURL).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        'Vídeo indisponível',
        'Ainda não foi possível encontrar a fonte desta música no YouTube.'
      );
    }
  );

  it('ignores a late match from the previous track', async () => {
    let finishLookup!: (result: any) => void;
    jest.mocked(resolveSpotifyTrackVideoId).mockReturnValueOnce(
      new Promise((resolve) => {
        finishLookup = resolve;
      })
    );
    const screen = await mountPlayer();
    jest.mocked(usePlayer).mockReturnValue(
      makePlayer({
        spotifyId: 'BBBBBBBBBBBBBBBBBBBBBB',
        youtubeVideoId: 'bbbbbbbbbbb',
      }) as any
    );
    await screen.rerender(<FullPlayer visible onClose={jest.fn()} />);
    await act(async () => {
      finishLookup({
        status: 'resolved',
        videoId: 'aaaaaaaaaaa',
        confidence: 99,
      });
    });
    await openSource(screen);
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=bbbbbbbbbbb'
    );
  });

  it('reads a newly resolved source from an already-open iOS action sheet', async () => {
    Platform.OS = 'ios';
    let finishLookup!: (result: any) => void;
    jest.mocked(resolveSpotifyTrackVideoId).mockReturnValueOnce(
      new Promise((resolve) => {
        finishLookup = resolve;
      })
    );
    const actionSheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => {});
    const screen = await mountPlayer();
    await fireEvent.press(screen.getByLabelText('Opções do YouTube'));
    expect(actionSheet.mock.calls[0][0].message).toBe(
      'Fonte de áudio correspondente no YouTube'
    );
    await act(async () => {
      finishLookup({
        status: 'resolved',
        videoId: 'aaaaaaaaaaa',
        confidence: 99,
      });
    });
    await act(async () => {
      actionSheet.mock.calls[0][1](1);
    });
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=aaaaaaaaaaa'
    );
  });

  it('passes high-quality artwork with the local cover as image fallback', async () => {
    await mountPlayer();
    const artworkProps = getLastArtworkProps();
    expect(artworkProps.artworkUri).toBe(sampleTrack.imageURL);
    expect(artworkProps.fallbackSource).toEqual({
      uri: sampleTrack.localImagePath,
    });
  });

  it.each(['file:///covers/migrated-hq.jpg', ''])(
    'uses migrated or fallback local artwork: %s',
    async (imageURL) => {
      await mountPlayer({ imageURL });
      expect(getLastArtworkProps().artworkUri).toBe(
        imageURL || sampleTrack.localImagePath
      );
    }
  );

  it('passes queue neighbors, movement flags, and a stable non-artwork track key to the swipe artwork', async () => {
    const previousTrack = {
      ...sampleTrack,
      spotifyId: 'previous-id',
      title: 'Previous song',
      imageURL: 'https://images.example/previous.jpg',
      localImagePath: 'file:///covers/previous.jpg',
    };
    const currentTrack = {
      ...sampleTrack,
      spotifyId: 'current-id',
      title: 'Current song',
      imageURL: 'https://images.example/shared.jpg',
      localImagePath: 'file:///covers/current.jpg',
    };
    const nextTrack = {
      ...sampleTrack,
      spotifyId: 'next-id',
      title: 'Next song',
      imageURL: 'https://images.example/shared.jpg',
      localImagePath: 'file:///covers/next.jpg',
    };
    jest.mocked(usePlayer).mockReturnValue({
      ...makePlayer(currentTrack),
      currentTrack,
      queue: [previousTrack, currentTrack, nextTrack],
      queueIndex: 1,
    } as any);

    await render(<FullPlayer visible onClose={jest.fn()} />);

    const artworkProps = getLastArtworkProps();
    expect(artworkProps.trackKey).toBe(
      'current-id|Current song|First Artist, Second Artist, Third Artist|180000'
    );
    expect(artworkProps.trackKey).not.toContain('shared.jpg');
    expect(artworkProps.previousArtworkUri).toBe(previousTrack.imageURL);
    expect(artworkProps.nextArtworkUri).toBe(nextTrack.imageURL);
    expect(artworkProps.previousFallbackSource).toEqual({
      uri: previousTrack.localImagePath,
    });
    expect(artworkProps.nextFallbackSource).toEqual({
      uri: nextTrack.localImagePath,
    });
    expect(artworkProps.canGoPrevious).toBe(true);
    expect(artworkProps.canGoNext).toBe(true);
  });

  it('changes the swipe track key when different tracks share the same artwork URL', async () => {
    const firstTrack = {
      ...sampleTrack,
      spotifyId: 'first-shared-cover',
      title: 'First shared cover song',
      imageURL: 'https://images.example/shared.jpg',
    };
    const secondTrack = {
      ...sampleTrack,
      spotifyId: 'second-shared-cover',
      title: 'Second shared cover song',
      imageURL: 'https://images.example/shared.jpg',
    };
    const screen = await mountPlayer(firstTrack);
    const firstKey = getLastArtworkProps().trackKey;

    jest.mocked(usePlayer).mockReturnValue(makePlayer(secondTrack) as any);
    await screen.rerender(<FullPlayer visible onClose={jest.fn()} />);

    expect(getLastArtworkProps().artworkUri).toBe(firstTrack.imageURL);
    expect(getLastArtworkProps().trackKey).not.toBe(firstKey);
    expect(getLastArtworkProps().trackKey).toContain('second-shared-cover');
  });

  it('blocks artwork swipes while playback is buffering', async () => {
    jest.mocked(usePlayer).mockReturnValue({
      ...makePlayer(),
      playerState: {
        positionMs: 0,
        durationMs: 180000,
        isPlaying: false,
        isBuffering: true,
      },
      queue: [sampleTrack, { ...sampleTrack, spotifyId: 'next-id' }],
      queueIndex: 0,
    } as any);

    await render(<FullPlayer visible onClose={jest.fn()} />);

    expect(getLastArtworkProps().loading).toBe(true);
  });

  it('uses the shown previous artwork index for swipes even after the restart window', async () => {
    const playQueueIndex = jest.fn().mockResolvedValue(undefined);
    const previousTrack = {
      ...sampleTrack,
      spotifyId: 'previous-id',
      title: 'Previous song',
      imageURL: 'https://images.example/previous.jpg',
    };
    const currentTrack = {
      ...sampleTrack,
      spotifyId: 'current-id',
      title: 'Current song',
      imageURL: 'https://images.example/current.jpg',
    };
    jest.mocked(usePlayer).mockReturnValue({
      ...makePlayer(currentTrack),
      currentTrack,
      playerState: {
        positionMs: 4500,
        durationMs: 180000,
        isPlaying: true,
      },
      queue: [previousTrack, currentTrack],
      queueIndex: 1,
      playQueueIndex,
    } as any);

    await render(<FullPlayer visible onClose={jest.fn()} />);
    await act(async () => {
      await getLastArtworkProps().onPrevious();
    });

    expect(getLastArtworkProps().previousArtworkUri).toBe(
      previousTrack.imageURL
    );
    expect(playQueueIndex).toHaveBeenCalledWith(0);
  });

  it('wraps repeat-all artwork previews to the track that swipe will play', async () => {
    const playQueueIndex = jest.fn().mockResolvedValue(undefined);
    const firstTrack = {
      ...sampleTrack,
      spotifyId: 'first-id',
      title: 'First song',
      imageURL: 'https://images.example/first.jpg',
    };
    const lastTrack = {
      ...sampleTrack,
      spotifyId: 'last-id',
      title: 'Last song',
      imageURL: 'https://images.example/last.jpg',
    };
    jest.mocked(usePlayer).mockReturnValue({
      ...makePlayer(lastTrack),
      currentTrack: lastTrack,
      queue: [firstTrack, lastTrack],
      queueIndex: 1,
      repeatMode: 'all',
      playQueueIndex,
    } as any);

    await render(<FullPlayer visible onClose={jest.fn()} />);
    await act(async () => {
      await getLastArtworkProps().onNext();
    });

    expect(getLastArtworkProps().nextArtworkUri).toBe(firstTrack.imageURL);
    expect(playQueueIndex).toHaveBeenCalledWith(0);
  });

  it('keeps a stable shuffle preview and swipes to that exact random target', async () => {
    const playQueueIndex = jest.fn().mockResolvedValue(undefined);
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.8);
    const queue = [
      { ...sampleTrack, spotifyId: 'first-id', title: 'First song' },
      {
        ...sampleTrack,
        spotifyId: 'current-id',
        title: 'Current song',
        imageURL: 'https://images.example/current.jpg',
      },
      {
        ...sampleTrack,
        spotifyId: 'random-target-id',
        title: 'Random target',
        imageURL: 'https://images.example/random-target.jpg',
      },
    ];
    jest.mocked(usePlayer).mockReturnValue({
      ...makePlayer(queue[1]),
      currentTrack: queue[1],
      queue,
      queueIndex: 1,
      isShuffle: true,
      playQueueIndex,
    } as any);
    const screen = await render(<FullPlayer visible onClose={jest.fn()} />);
    const firstPreview = getLastArtworkProps().nextArtworkUri;

    await screen.rerender(<FullPlayer visible onClose={jest.fn()} />);
    await act(async () => {
      await getLastArtworkProps().onNext();
    });

    expect(firstPreview).toBe(queue[2].imageURL);
    expect(getLastArtworkProps().nextArtworkUri).toBe(firstPreview);
    expect(playQueueIndex).toHaveBeenCalledWith(2);
    expect(randomSpy).toHaveBeenCalledTimes(1);
  });
});
