import * as React from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { ActionSheetIOS, Alert, Linking, Platform, StyleSheet } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useDownloads, useLibrarySelectedCategory, usePlayer } from '@context';
import { findArtistIdByName } from '@api';
import {
  deleteDownloadedTrack,
  getCatalogMapping,
  isTrackDownloaded,
  resolveDirectYouTubeAudio,
  resolveSpotifyTrackVideoId,
  toDownloadTrackInput,
  upsertCatalogTracks,
} from '@services';
import { FullPlayer } from '../FullPlayer';

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockTrackPlaylistPicker = jest.fn(() => null);
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
  usePathname: () => '/(tabs)/library',
  useSegments: () => ['(tabs)', 'library'],
}));
jest.mock('@api', () => ({
  findArtistIdByName: jest.fn(),
  getYouTubeMusicArtistBiography: jest.fn().mockResolvedValue(''),
  getYouTubeMusicArtistImage: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../../services/metadata/spotifyMetadata', () => ({
  getSpotifyArtistImage: jest.fn().mockResolvedValue(null),
}));
jest.mock('@context', () => ({
  useDownloads: jest.fn(),
  useLibrarySelectedCategory: jest.fn(),
  usePlayer: jest.fn(),
}));
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  const createGesture = () => {
    const gesture: Record<string, unknown> = {};
    const link = (name: string) => (value?: unknown) => {
      gesture[`${name}Value`] = value;
      return gesture;
    };
    Object.assign(gesture, {
      activateAfterLongPress: link('activateAfterLongPress'),
      activeOffsetY: link('activeOffsetY'),
      blocksExternalGesture: link('blocksExternalGesture'),
      enabled: link('enabled'),
      maxDuration: link('maxDuration'),
      maxDistance: link('maxDistance'),
      onEnd: link('onEnd'),
      onFinalize: link('onFinalize'),
      onStart: link('onStart'),
      onUpdate: link('onUpdate'),
      runOnJS: link('runOnJS'),
      shouldCancelWhenOutside: link('shouldCancelWhenOutside'),
    });
    return gesture;
  };
  return {
    Gesture: {
      Native: jest.fn(createGesture),
      Pan: jest.fn(createGesture),
      Race: jest.fn((...gestures: unknown[]) => ({ gestures })),
      Tap: jest.fn(createGesture),
    },
    GestureDetector: ({ children }: React.PropsWithChildren) => children,
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
  isTrackDownloaded: jest.fn(),
  resolveSpotifyTrackVideoId: jest.fn(),
  resolveDirectYouTubeAudio: jest.fn(),
  resolveDirectYouTubeTrack: jest.fn(),
  deleteDownloadedTrack: jest.fn(),
  getCachedArtistImage: jest.fn().mockResolvedValue(''),
  toDownloadTrackInput: jest.fn((track) => track),
  upsertCatalogTracks: jest.fn(),
}));
jest.mock('../../LocalPlaylist/TrackPlaylistPickerModal', () => ({
  TrackPlaylistPickerModal: (props: unknown) => mockTrackPlaylistPicker(props),
}));
jest.mock('../SwipeableArtwork', () => ({
  SwipeableArtwork: (props: unknown) => mockSwipeableArtwork(props),
}));
jest.mock('../../native', () => {
  const { Pressable, View } = require('react-native');
  return { GlassSurface: View, LoggedPressable: Pressable };
});
jest.mock('../LyricSyncEditor', () => ({ LyricSyncEditor: () => null }));
jest.mock('@expo/ui/swift-ui', () => {
  const { View, Text } = require('react-native');
  return { Host: View, VStack: View, Text };
});
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
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-image', () => ({ Image: require('react-native').Image }));

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
  isPlayerVisible: true,
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

const makeDownloads = (overrides = {}) => ({
  downloads: [],
  activeDownloadsCount: 0,
  enqueueDownloads: jest.fn(),
  cancelDownload: jest.fn(),
  clearCompletedDownloads: jest.fn(),
  retryDownload: jest.fn(),
  refreshDownloads: jest.fn(),
  ...overrides,
});

const makeLibrary = (overrides = {}) => ({
  selectedCategory: 'songs',
  setSelectedCategory: jest.fn(),
  libraryRevision: 0,
  refreshLibrary: jest.fn(),
  ...overrides,
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
    mockTrackPlaylistPicker.mockClear();
    Platform.OS = 'android';
    jest.mocked(useDownloads).mockReturnValue(makeDownloads() as any);
    jest
      .mocked(useLibrarySelectedCategory)
      .mockReturnValue(makeLibrary() as any);
    jest.mocked(isTrackDownloaded).mockResolvedValue(false);
    jest.mocked(deleteDownloadedTrack).mockResolvedValue(true);
    jest
      .mocked(toDownloadTrackInput)
      .mockImplementation((track) => track as any);
    jest.mocked(upsertCatalogTracks).mockResolvedValue([]);
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
    expect(screen.getByTestId('player-artists-measure-content', {
      includeHiddenElements: true,
    })).toBeTruthy();
    for (const artist of sampleTrack.artists) {
      expect(screen.getByLabelText(`Abrir artista ${artist.name}`)).toBeTruthy();
    }
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

  it('shows inline lyrics, artist details, and credits in the scrollable player', async () => {
    const screen = await mountPlayer();
    const playerScroll = screen.getByTestId('player-scroll-view');

    expect(playerScroll.props.contentInsetAdjustmentBehavior).toBe('never');
    expect(playerScroll.props.contentContainerStyle[1].paddingBottom).toEqual(expect.any(Number));
    expect(screen.queryByText('Letra')).toBeNull();
    expect(screen.getByText('Sobre o artista')).toBeTruthy();
    expect(screen.getByText('Créditos')).toBeTruthy();
    expect(screen.getAllByText('Artista principal').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Participação').length).toBeGreaterThan(0);
    expect(screen.queryByText('OPENFY MUSIC')).toBeNull();
    expect(screen.getByText('A song')).toBeTruthy();
  });

  it('keeps a fixed lyric preview height and truncates the next line to one line', async () => {
    jest.mocked(usePlayer).mockReturnValue({
      ...makePlayer(),
      lyricsData: {
        segments: [
          { index: 0, startTimeMs: 0, endTimeMs: 10000, text: 'Current short line' },
          { index: 1, startTimeMs: 10000, endTimeMs: 20000, text: 'A very long next lyric that must be ellipsized rather than changing the preview height' },
        ],
      },
    } as any);
    const screen = await render(<FullPlayer visible onClose={jest.fn()} />);
    const currentLine = screen.getByTestId('player-lyric-preview-current');

    expect(screen.queryByTestId('player-lyric-preview-next')).toBeNull();
    expect(screen.getByTestId('player-lyric-preview').props.style).toMatchObject({ height: 42 });
    await fireEvent(currentLine, 'textLayout', {
      nativeEvent: { lines: [{ text: 'Current short line' }] },
    });
    expect(screen.getByTestId('player-lyric-preview-next').props).toMatchObject({
      numberOfLines: 1,
      ellipsizeMode: 'tail',
    });
    await fireEvent(
      screen.getByLabelText('Abrir letra completa'),
      'accessibilityTap'
    );
    expect(screen.getByTestId('player-synced-lyrics')).toBeTruthy();
  });

  it('captures a drag on the lyric preview and seeks through the song', async () => {
    const seekToPosition = jest.fn().mockResolvedValue(undefined);
    jest.mocked(usePlayer).mockReturnValue({
      ...makePlayer(),
      playerState: { positionMs: 10000, durationMs: 180000, isPlaying: true },
      seekToPosition,
      lyricsData: {
        segments: [
          { index: 0, startTimeMs: 0, endTimeMs: 10000, text: 'First lyric' },
          { index: 1, startTimeMs: 10000, endTimeMs: 20000, text: 'Second lyric' },
          { index: 2, startTimeMs: 20000, endTimeMs: 30000, text: 'Third lyric' },
        ],
      },
    } as any);
    const screen = await render(<FullPlayer visible onClose={jest.fn()} />);
    const pan = (Gesture.Pan as jest.Mock).mock.results.at(-1)?.value as Record<string, any>;

    expect(pan.activeOffsetYValue).toEqual([-8, 8]);
    expect(pan.blocksExternalGestureValue).toBe(
      (Gesture.Native as jest.Mock).mock.results.at(-1)?.value
    );
    expect(pan.enabledValue).toBe(true);
    expect(pan.shouldCancelWhenOutsideValue).toBe(false);
    await act(async () => {
      pan.onStartValue();
      pan.onUpdateValue({ translationY: -21 });
    });
    expect(screen.getByTestId('player-lyric-scrub-stack')).toBeTruthy();
    await act(async () => {
      pan.onUpdateValue({ translationY: 21 });
      pan.onFinalizeValue();
    });

    expect(seekToPosition.mock.calls.map(([position]) => position)).toEqual([
      20000,
      0,
    ]);
    expect(screen.queryByTestId('player-lyric-scrub-stack')).toBeNull();
  });

  it('opens the full lyrics on a short tap of the preview', async () => {
    jest.mocked(usePlayer).mockReturnValue({
      ...makePlayer(),
      lyricsData: {
        segments: [
          { index: 0, startTimeMs: 0, endTimeMs: 10000, text: 'First lyric' },
          { index: 1, startTimeMs: 10000, endTimeMs: 20000, text: 'Second lyric' },
        ],
      },
    } as any);
    const screen = await render(<FullPlayer visible onClose={jest.fn()} />);
    const tap = (Gesture.Tap as jest.Mock).mock.results.at(-1)?.value as Record<string, any>;

    await act(async () => {
      tap.onEndValue({}, true);
      await Promise.resolve();
    });

    expect(screen.getByTestId('player-synced-lyrics')).toBeTruthy();
  });

  it('shows two upcoming timed lyrics as inactive before the first line starts', async () => {
    jest.mocked(usePlayer).mockReturnValue({
      ...makePlayer(),
      lyricsData: {
        segments: [
          { index: 0, startTimeMs: 1000, endTimeMs: 10000, text: 'First upcoming line' },
          { index: 1, startTimeMs: 10000, endTimeMs: 20000, text: 'Second upcoming line' },
        ],
      },
    } as any);
    const screen = await render(<FullPlayer visible onClose={jest.fn()} />);

    expect(screen.getByTestId('player-lyric-preview-current').props.children).toBe('First upcoming line');
    expect(screen.getByTestId('player-lyric-preview-next').props.children).toBe('Second upcoming line');
    expect(screen.getByTestId('player-lyric-preview-current').props.style).not.toContainEqual(
      expect.objectContaining({ fontWeight: '700' })
    );
  });

  it('hides the next inline lyric when the current lyric wraps', async () => {
    jest.mocked(usePlayer).mockReturnValue({
      ...makePlayer(),
      lyricsData: {
        segments: [
          { index: 0, startTimeMs: 0, endTimeMs: 10000, text: 'Current lyric wraps across lines' },
          { index: 1, startTimeMs: 10000, endTimeMs: 20000, text: 'Next short line' },
        ],
      },
    } as any);
    const screen = await render(<FullPlayer visible onClose={jest.fn()} />);
    await fireEvent(screen.getByTestId('player-lyric-preview-current'), 'textLayout', {
      nativeEvent: { lines: [{ text: 'Current lyric' }, { text: 'wraps across lines' }] },
    });
    expect(screen.queryByTestId('player-lyric-preview-next')).toBeNull();
  });

  it('opens the canonical artist profile for downloaded tracks when a Spotify artist id is available', async () => {
    const spotifyArtistId = '1234567890123456789012';
    const screen = await mountPlayer({
      localAudioPath: 'file:///music/downloaded.m4a',
      artists: [{ id: spotifyArtistId, name: 'Ebony' }],
    });

    await fireEvent.press(screen.getByLabelText('Abrir artista Ebony'));

    expect(mockNavigate).toHaveBeenLastCalledWith(
      `/(tabs)/library/artist/${spotifyArtistId}`,
      { dangerouslySingular: true }
    );
  });

  it('keeps YouTube Music artist aliases on the public catalog profile', async () => {
    const screen = await mountPlayer({
      youtubeVideoId: 'aaaaaaaaaaa',
      artists: [{ id: 'ytartist_name_Ebony', name: 'Ebony' }],
    });

    await fireEvent.press(screen.getByLabelText('Abrir artista Ebony'));

    await waitFor(() => expect(mockNavigate).toHaveBeenLastCalledWith(
      '/(tabs)/library/artist/ytartist_name_Ebony',
      { dangerouslySingular: true }
    ));
    expect(findArtistIdByName).toHaveBeenCalledWith('Ebony');
  });

  it('replaces the title with a sticky mini-player after the player scrolls away', async () => {
    const screen = await mountPlayer();
    await fireEvent(screen.getByTestId('player-controls-row'), 'layout', {
      nativeEvent: { layout: { y: 900, height: 100, width: 390, x: 0 } },
    });
    await fireEvent.scroll(screen.getByTestId('player-scroll-view'), {
      nativeEvent: {
        contentOffset: { y: 200 },
        contentSize: { height: 1800, width: 390 },
        layoutMeasurement: { height: 700, width: 390 },
      },
    });
    expect(screen.queryByTestId('mini-player-content')).toBeNull();
    await fireEvent.scroll(screen.getByTestId('player-scroll-view'), {
      nativeEvent: {
        contentOffset: { y: 1000 },
        contentSize: { height: 1800, width: 390 },
        layoutMeasurement: { height: 700, width: 390 },
      },
    });

    expect(screen.getByTestId('mini-player-content')).toBeTruthy();
  });

  it('resets the sticky mini-player when the full player is reopened', async () => {
    const screen = await mountPlayer();
    await fireEvent(screen.getByTestId('player-controls-row'), 'layout', {
      nativeEvent: { layout: { y: 900, height: 100, width: 390, x: 0 } },
    });
    await fireEvent.scroll(screen.getByTestId('player-scroll-view'), {
      nativeEvent: {
        contentOffset: { y: 1000 },
        contentSize: { height: 1800, width: 390 },
        layoutMeasurement: { height: 700, width: 390 },
      },
    });
    expect(screen.getByTestId('mini-player-content')).toBeTruthy();

    await screen.rerender(<FullPlayer visible={false} onClose={jest.fn()} />);
    await screen.rerender(<FullPlayer visible onClose={jest.fn()} />);

    expect(screen.queryByTestId('mini-player-content')).toBeNull();
  });

  it('keeps the artist-only pill when lyrics are open', async () => {
    const screen = await mountPlayer({ youtubeVideoId: 'aaaaaaaaaaa' });
    await fireEvent.press(screen.getByTestId('player-lyrics-toggle'));
    expect(screen.getAllByTestId('player-artists')).toHaveLength(1);
    expect(screen.getByTestId('player-artists-measure-content', {
      includeHiddenElements: true,
    })).toBeTruthy();
  });

  it('keeps one media area and places artist details after the controls in both modes', async () => {
    const screen = await mountPlayer();
    const mediaStyle = StyleSheet.flatten(screen.getByTestId('player-media-section').props.style);
    const verifyOrder = () => {
      const scroll = screen.getByTestId('player-scroll-view');
      expect(within(scroll).getByTestId('player-controls-row')).toBeTruthy();
      expect(within(scroll).getByTestId('player-artist-details')).toBeTruthy();
      const tree = JSON.stringify(screen.toJSON());
      expect(tree.indexOf('player-controls-row')).toBeLessThan(tree.indexOf('player-artist-details'));
      expect(screen.getAllByTestId('player-controls-row')).toHaveLength(1);
      expect(StyleSheet.flatten(screen.getByTestId('player-media-section').props.style).height).toBe(mediaStyle.height);
    };
    verifyOrder();
    await fireEvent.press(screen.getByTestId('player-lyrics-toggle'));
    verifyOrder();
    expect(screen.getByText('Créditos')).toBeTruthy();
    const pillStyle = StyleSheet.flatten(screen.getByTestId('player-artists-pill').props.style);
    const artworkStyle = StyleSheet.flatten(screen.getByLabelText('Fechar letras sincronizadas').props.style);
    expect(pillStyle.paddingHorizontal).toBeGreaterThan(artworkStyle.left + artworkStyle.width);
    expect(artworkStyle.position).toBe('absolute');
    expect(pillStyle.paddingLeft).toBeUndefined();
    expect(pillStyle.paddingRight).toBeUndefined();
    await fireEvent.press(screen.getByLabelText('Fechar letras sincronizadas'));
    verifyOrder();
  });

  it('unblurs inactive lyrics while scrolling and restores the blur after idle', async () => {
    jest.useFakeTimers();
    try {
      jest.mocked(usePlayer).mockReturnValue({
        ...makePlayer(),
        playerState: { positionMs: 1000, durationMs: 20000, isPlaying: true },
        lyricsData: {
          segments: [
            { index: 0, startTimeMs: 0, endTimeMs: 10000, text: 'Current line' },
            { index: 1, startTimeMs: 10000, endTimeMs: 20000, text: 'Next line' },
          ],
        },
      } as any);
      const screen = await render(<FullPlayer visible onClose={jest.fn()} />);
      await fireEvent.press(screen.getByTestId('player-lyrics-toggle'));
      const blurRadii = () => ['Current line', 'Next line'].map((text) =>
        screen.getByText(text).props.modifiers.find((modifier: { $type: string }) => modifier.$type === 'blur').radius
      );
      expect(blurRadii()).toEqual([0, 3]);
      await fireEvent(screen.getByTestId('player-synced-lyrics'), 'scrollBeginDrag');
      expect(blurRadii()).toEqual([0, 0]);
      await fireEvent(screen.getByTestId('player-synced-lyrics'), 'scrollEndDrag', {
        nativeEvent: { velocity: { y: 0 } },
      });
      await act(async () => { jest.advanceTimersByTime(2501); });
      expect(blurRadii()).toEqual([0, 3]);
      await screen.unmount();
    } finally {
      jest.useRealTimers();
    }
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

  it('queues the current streaming track for download', async () => {
    const enqueueDownloads = jest.fn();
    jest
      .mocked(useDownloads)
      .mockReturnValue(makeDownloads({ enqueueDownloads }) as any);
    const screen = await mountPlayer();

    await act(async () => {});
    await fireEvent.press(screen.getByLabelText('Baixar música'));

    expect(toDownloadTrackInput).toHaveBeenCalledWith(
      expect.objectContaining({ spotifyId: sampleTrack.spotifyId })
    );
    expect(enqueueDownloads).toHaveBeenCalledWith([
      expect.objectContaining({ spotifyId: sampleTrack.spotifyId }),
    ]);
    expect(upsertCatalogTracks).toHaveBeenCalledWith([
      expect.objectContaining({ spotifyId: sampleTrack.spotifyId }),
    ]);
  });

  it('shows live download progress in the player control', async () => {
    jest.mocked(useDownloads).mockReturnValue(
      makeDownloads({
        downloads: [
          {
            spotifyId: sampleTrack.spotifyId,
            status: 'downloading',
            progress: 0.42,
          },
        ],
      }) as any
    );

    const screen = await mountPlayer();

    expect(screen.getByLabelText('Baixando 42%')).toBeTruthy();
    expect(screen.getByText('42%')).toBeTruthy();
  });

  it('removes an existing download after confirmation', async () => {
    const clearCompletedDownloads = jest.fn();
    const refreshLibrary = jest.fn();
    jest.mocked(isTrackDownloaded).mockResolvedValue(true);
    jest.mocked(useDownloads).mockReturnValue(
      makeDownloads({ clearCompletedDownloads }) as any
    );
    jest.mocked(useLibrarySelectedCategory).mockReturnValue(
      makeLibrary({ refreshLibrary }) as any
    );
    const screen = await mountPlayer();

    await waitFor(() =>
      expect(screen.getByLabelText('Excluir download')).toBeTruthy()
    );
    await fireEvent.press(screen.getByLabelText('Excluir download'));
    const confirmation = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    await act(async () => {
      confirmation?.find((button) => button.text === 'Excluir')?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(deleteDownloadedTrack).toHaveBeenCalledWith(sampleTrack.spotifyId)
    );
    expect(clearCompletedDownloads).toHaveBeenCalled();
    expect(refreshLibrary).toHaveBeenCalled();
  });

  it('opens the playlist picker for the current track', async () => {
    const screen = await mountPlayer();

    await fireEvent.press(
      screen.getByLabelText('Adicionar música a playlists')
    );

    expect(mockTrackPlaylistPicker).toHaveBeenLastCalledWith(
      expect.objectContaining({
        track: expect.objectContaining({
          spotifyId: sampleTrack.spotifyId,
          title: sampleTrack.title,
        }),
        visible: true,
      })
    );
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

  it('keeps the cover visible while playback is buffering', async () => {
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

    expect(getLastArtworkProps().loading).toBe(false);
  });

  it('keeps pause controls and artwork responsive when audio is playing during a buffer report', async () => {
    jest.mocked(usePlayer).mockReturnValue({
      ...makePlayer(),
      playerState: {
        positionMs: 12_000,
        durationMs: 180_000,
        isPlaying: true,
        isBuffering: true,
      },
    } as any);

    const screen = await render(<FullPlayer visible onClose={jest.fn()} />);

    expect(screen.getByLabelText('Pausar')).toBeTruthy();
    expect(getLastArtworkProps().loading).toBe(false);
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

  it('uses the next item from the already shuffled queue for preview and swipe', async () => {
    const playQueueIndex = jest.fn().mockResolvedValue(undefined);
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
  });
});
