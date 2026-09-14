import * as React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ActionSheetIOS, Alert, Image, Linking, Platform } from 'react-native';
import { usePlayer } from '@context';
import {
  getCatalogMapping,
  resolveDirectYouTubeAudio,
  resolveSpotifyTrackVideoId,
} from '@services';
import { FullPlayer } from '../FullPlayer';
import { MarqueeText } from '../../common/MarqueeText';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useSegments: () => ['(tabs)', 'library'],
}));
jest.mock('@api', () => ({ findArtistIdByName: jest.fn() }));
jest.mock('@context', () => ({ usePlayer: jest.fn() }));
jest.mock('@services', () => ({
  ...jest.requireActual('../../../services/lyrics/lyricTimeline'),
  ...jest.requireActual('../../../services/spotify/linkParser'),
  getCatalogMapping: jest.fn(),
  resolveSpotifyTrackVideoId: jest.fn(),
  resolveDirectYouTubeAudio: jest.fn(),
  resolveDirectYouTubeTrack: jest.fn(),
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
  queue: [],
  queueIndex: 0,
  lyricsData: null,
  isLoadingLyrics: false,
  isShuffle: false,
  repeatMode: 'off',
});

const mountPlayer = async (track = {}) => {
  jest.mocked(usePlayer).mockReturnValue(makePlayer(track) as any);
  return render(<FullPlayer visible onClose={jest.fn()} />);
};

const openSource = async (screen: Awaited<ReturnType<typeof render>>) => {
  await fireEvent.press(screen.getByLabelText('Opções do YouTube'));
  await fireEvent.press(screen.getByText('Ir para o vídeo do YouTube'));
};

describe('FullPlayer artist row and YouTube source', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('keeps all artist links in one marquee and opens each artist', async () => {
    const screen = await mountPlayer({ youtubeVideoId: 'aaaaaaaaaaa' });
    const marquees = screen.UNSAFE_getAllByType(MarqueeText);
    const artists = marquees.filter((item) => item.props.text.includes('Artist'));
    expect(artists).toHaveLength(1);
    expect(artists[0].props.text).toBe(
      'First Artist · Second Artist · Third Artist'
    );
    for (const artist of sampleTrack.artists) {
      await fireEvent.press(screen.getByLabelText(`Abrir artista ${artist.name}`));
      expect(mockPush).toHaveBeenLastCalledWith(
        `/(tabs)/library/artist/${artist.id}`
      );
    }
  });

  it.each([
    [{ youtubeVideoId: 'aaaaaaaaaaa', youtubeUrl: 'https://youtu.be/bbbbbbbbbbb' }, 'aaaaaaaaaaa'],
    [{ youtubeUrl: 'https://music.youtube.com/watch?v=bbbbbbbbbbb&list=album' }, 'bbbbbbbbbbb'],
    [{ spotifyId: 'yt_ccccccccccc' }, 'ccccccccccc'],
    [{ youtubeVideoId: 'invalid', youtubeUrl: 'https://youtu.be/bbbbbbbbbbb' }, 'bbbbbbbbbbb'],
  ])('opens the exact saved source %j without a catalog or stream lookup', async (track, videoId) => {
    const screen = await mountPlayer(track);
    await openSource(screen);
    expect(Linking.openURL).toHaveBeenCalledWith(
      `https://www.youtube.com/watch?v=${videoId}`
    );
    expect(getCatalogMapping).not.toHaveBeenCalled();
    expect(resolveSpotifyTrackVideoId).not.toHaveBeenCalled();
    expect(resolveDirectYouTubeAudio).not.toHaveBeenCalled();
  });

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

  it.each(['android', 'web'] as const)('finds a source on %s using catalog metadata alone', async (platform) => {
    Platform.OS = platform;
    jest.mocked(resolveSpotifyTrackVideoId).mockResolvedValue({
      status: 'resolved', videoId: 'eeeeeeeeeee', confidence: 97,
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
  });

  it('uses parsed artist names when structured artists are missing', async () => {
    await mountPlayer({ artists: undefined });
    expect(resolveSpotifyTrackVideoId).toHaveBeenCalledWith(
      sampleTrack.spotifyId, sampleTrack.title,
      ['First Artist', 'Second Artist', 'Third Artist'], sampleTrack.duration_ms
    );
  });

  it('falls back to catalog search after a cache read fails', async () => {
    jest.mocked(getCatalogMapping).mockRejectedValue(new Error('Storage unavailable'));
    jest.mocked(resolveSpotifyTrackVideoId).mockResolvedValue({
      status: 'resolved', videoId: 'eeeeeeeeeee', confidence: 97,
    });
    const screen = await mountPlayer();
    await openSource(screen);
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=eeeeeeeeeee'
    );
  });

  it.each(['no match', 'search error'])('handles %s without inventing an official video link', async (failure) => {
    if (failure === 'search error') {
      jest.mocked(resolveSpotifyTrackVideoId).mockRejectedValue(new Error('Offline'));
    }
    const screen = await mountPlayer();
    await openSource(screen);
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Vídeo indisponível',
      'Ainda não foi possível encontrar a fonte desta música no YouTube.'
    );
  });

  it('ignores a late match from the previous track', async () => {
    let finishLookup!: (result: any) => void;
    jest.mocked(resolveSpotifyTrackVideoId).mockReturnValueOnce(
      new Promise((resolve) => { finishLookup = resolve; })
    );
    const screen = await mountPlayer();
    jest.mocked(usePlayer).mockReturnValue(makePlayer({
      spotifyId: 'BBBBBBBBBBBBBBBBBBBBBB',
      youtubeVideoId: 'bbbbbbbbbbb',
    }) as any);
    await screen.rerender(<FullPlayer visible onClose={jest.fn()} />);
    await act(async () => {
      finishLookup({ status: 'resolved', videoId: 'aaaaaaaaaaa', confidence: 99 });
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
      new Promise((resolve) => { finishLookup = resolve; })
    );
    const actionSheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => {});
    const screen = await mountPlayer();
    await fireEvent.press(screen.getByLabelText('Opções do YouTube'));
    expect(actionSheet.mock.calls[0][0].message).toBe(
      'Fonte de áudio correspondente no YouTube'
    );
    await act(async () => {
      finishLookup({ status: 'resolved', videoId: 'aaaaaaaaaaa', confidence: 99 });
    });
    await act(async () => { actionSheet.mock.calls[0][1](1); });
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=aaaaaaaaaaa'
    );
  });

  it('prefers the high-quality artwork and falls back to the local cover on failure', async () => {
    const screen = await mountPlayer();
    const cover = screen.UNSAFE_getAllByType(Image).find((item) => item.props.onError)!;
    expect(cover.props.source.uri).toBe(sampleTrack.imageURL);
    await fireEvent(cover, 'error', { nativeEvent: { error: 'Offline' } });
    expect(screen.UNSAFE_getAllByType(Image).every(
      (item) => item.props.source.uri === sampleTrack.localImagePath
    )).toBe(true);
  });

  it.each(['file:///covers/migrated-hq.jpg', ''])('uses migrated or fallback local artwork: %s', async (imageURL) => {
    const screen = await mountPlayer({ imageURL });
    const cover = screen.UNSAFE_getAllByType(Image).find((item) => item.props.onError)!;
    expect(cover.props.source.uri).toBe(imageURL || sampleTrack.localImagePath);
  });
});
