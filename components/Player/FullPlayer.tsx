/**
 * FullPlayer Component — Apple Music & Liquid Glass Design System
 * Matches the official iOS Apple Music player and synced lyrics experience.
 * Includes Dolby Atmos spatial audio badge, glass action pills,
 * glowing karaoke synced lyrics, and native haptic feedback.
 */

import * as React from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  findArtistIdByName,
  getYouTubeMusicArtistBiography,
  getYouTubeMusicArtistImage,
} from '@api';
import { useDownloads, useLibrarySelectedCategory, usePlayer } from '@context';
import { useDetailNavigation } from '@hooks';
import {
  deleteDownloadedTrack,
  getCatalogMapping,
  getLyricGapRange,
  getLyricTimelineBlocks,
  isTrackDownloaded,
  LyricGapTarget,
  LyricSegment,
  LyricTimelineBlock,
  moveLyricGap,
  moveLyricSegment,
  parseSpotifyLink,
  resolveDirectYouTubeTrack,
  resolveSpotifyTrackVideoId,
  getCachedArtistImage,
  resizeLyricGapEnd,
  resizeLyricGapStart,
  resizeLyricSegmentEnd,
  resizeLyricSegmentStart,
  toDownloadTrackInput,
  upsertCatalogTracks,
} from '@services';
import { getSpotifyArtistImage } from '../../services/metadata/spotifyMetadata';
import { GlassSurface, LoggedPressable } from '../native';
import { TrackPlaylistPickerModal } from '../LocalPlaylist/TrackPlaylistPickerModal';
import { LyricSyncEditor } from './LyricSyncEditor';
import { MarqueeText } from '../common/MarqueeText';
import { SwipeableArtwork } from './SwipeableArtwork';
import { MiniPlayer } from './MiniPlayer';
import { SkeletonImage } from '../common/SkeletonImage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_SIZE = Math.min(SCREEN_WIDTH - 64, 340);

type FullPlayerProps = {
  visible: boolean;
  onClose: () => void;
};

const LyricsViewport = ({ children }: React.PropsWithChildren) => {
  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          styles.lyricsMainContainer,
          {
            maskImage:
              'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,1) 14%, rgba(0,0,0,1) 86%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,1) 14%, rgba(0,0,0,1) 86%, transparent 100%)',
          } as any,
        ]}
      >
        {children}
      </View>
    );
  }

  // A composited native mask can disappear when Fabric updates the scrolling
  // lyrics. Keep the list on a normal, bounded native surface instead.
  return (
    <View testID="player-lyrics-viewport" style={styles.lyricsMainContainer}>
      {children}
    </View>
  );
};

const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const getLastSegmentEndMs = (segments: LyricSegment[]) =>
  segments.reduce(
    (lastEndMs, segment) => Math.max(lastEndMs, segment.endTimeMs),
    0
  );

const getTrackKey = (
  track: {
    spotifyId: string;
    title: string;
    artistName: string;
    duration_ms: number;
  } | null
) =>
  track
    ? [track.spotifyId, track.title, track.artistName, track.duration_ms].join(
        '|'
      )
    : '';

const getTrackArtworkUri = (
  track: { imageURL?: string | null; localImagePath?: string | null } | null
) => track?.imageURL || track?.localImagePath || '';

const getLocalArtworkFallback = (
  track: { imageURL?: string | null; localImagePath?: string | null } | null
) => track?.localImagePath && track.localImagePath !== track.imageURL
  ? { uri: track.localImagePath }
  : undefined;

type LyricEditorTarget =
  { kind: 'lyric'; index: number } | { kind: 'gap'; target: LyricGapTarget };

const getGapTarget = (
  timeline: LyricTimelineBlock[],
  gapIndex: number
): LyricGapTarget => {
  let previousIndex: number | null = null;
  let nextIndex: number | null = null;

  for (let index = gapIndex - 1; index >= 0; index -= 1) {
    const block = timeline[index];
    if (block?.kind === 'lyric') {
      previousIndex = block.index;
      break;
    }
  }
  for (let index = gapIndex + 1; index < timeline.length; index += 1) {
    const block = timeline[index];
    if (block?.kind === 'lyric') {
      nextIndex = block.index;
      break;
    }
  }
  return { previousIndex, nextIndex };
};

const getExactYouTubeUrl = (input?: string): string => {
  const parsed = parseSpotifyLink(input || '');
  return parsed?.platform === 'youtube' && parsed.type === 'track'
    ? `https://www.youtube.com/watch?v=${parsed.id}`
    : '';
};

const getTrackYouTubeUrl = (
  track: {
    spotifyId: string;
    youtubeVideoId?: string;
    youtubeUrl?: string;
  } | null
): string => {
  if (
    track?.youtubeVideoId &&
    /^[A-Za-z0-9_-]{11}$/.test(track.youtubeVideoId)
  ) {
    return `https://www.youtube.com/watch?v=${track.youtubeVideoId}`;
  }
  const explicitUrl = getExactYouTubeUrl(track?.youtubeUrl);
  if (explicitUrl) return explicitUrl;

  const directVideoId = track?.spotifyId?.match(
    /^yt_([A-Za-z0-9_-]{11})$/
  )?.[1];
  return directVideoId
    ? `https://www.youtube.com/watch?v=${directVideoId}`
    : '';
};

const YOUTUBE_STREAM_UNAVAILABLE_ERROR = 'YOUTUBE_STREAM_UNAVAILABLE';
const YOUTUBE_STREAM_UNAVAILABLE_MESSAGE =
  'YouTube bloqueou o stream de áudio desse vídeo no servidor. Tente outro link.';

type PlayerGlassButtonProps = {
  accessibilityLabel: string;
  children: React.ReactNode;
  disabled?: boolean;
  glass?: 'regular' | 'clear' | 'thick';
  onPress?: () => void;
  style?: any;
  surfaceStyle?: any;
  testID?: string;
  tintColor?: string;
};

function PlayerGlassButton({
  accessibilityLabel,
  children,
  disabled = false,
  glass = 'regular',
  onPress,
  style,
  surfaceStyle,
  testID,
  tintColor,
}: PlayerGlassButtonProps) {
  return (
    <LoggedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[style, disabled && styles.glassButtonDisabled]}
      testID={testID}
    >
      <GlassSurface
        glass={glass}
        tintColor={tintColor}
        isInteractive={!!onPress && !disabled}
        style={[styles.glassButtonSurface, surfaceStyle]}
      >
        {children}
      </GlassSurface>
    </LoggedPressable>
  );
}

export const FullPlayer = ({ visible, onClose }: FullPlayerProps) => {
  const insets = useSafeAreaInsets();
  const { openDetail } = useDetailNavigation();
  const { clearCompletedDownloads, downloads, enqueueDownloads } =
    useDownloads();
  const { libraryRevision, refreshLibrary } = useLibrarySelectedCategory();
  const {
    currentTrack,
    playerState,
    playTrack,
    togglePlayPause,
    seekToPosition,
    playQueueIndex,
    playNext,
    playPrevious,
    queue,
    queueIndex,
    lyricsData,
    isLoadingLyrics,
    repeatMode,
    updateLyricsSegments,
  } = usePlayer();

  const [seeking, setSeeking] = React.useState(false);
  const [seekValue, setSeekValue] = React.useState(0);
  const [showLyricsFull, setShowLyricsFull] = React.useState(false);
  const [isLyricsEditing, setIsLyricsEditing] = React.useState(false);
  const [draftLyricSegments, setDraftLyricSegments] = React.useState<
    LyricSegment[]
  >([]);
  const [selectedLyricTarget, setSelectedLyricTarget] =
    React.useState<LyricEditorTarget>({ kind: 'lyric', index: 0 });

  // YouTube action sheet and custom link edit state
  const [isActionModalVisible, setIsActionModalVisible] = React.useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = React.useState(false);
  const [customLinkInput, setCustomLinkInput] = React.useState('');
  const [isUpdatingAudio, setIsUpdatingAudio] = React.useState(false);
  const [isArtworkNavigationPending, setIsArtworkNavigationPending] =
    React.useState(false);
  const [isDownloadMutationPending, setIsDownloadMutationPending] =
    React.useState(false);
  const [isCurrentTrackDownloaded, setIsCurrentTrackDownloaded] =
    React.useState(false);
  const [isPlaylistPickerVisible, setIsPlaylistPickerVisible] =
    React.useState(false);
  const [isPlayerScrolled, setIsPlayerScrolled] = React.useState(false);
  const [controlsBottomOffset, setControlsBottomOffset] = React.useState<number | null>(null);
  const [primaryArtistImage, setPrimaryArtistImage] = React.useState('');
  const [artistImages, setArtistImages] = React.useState<Record<string, string>>({});
  const [primaryArtistBiography, setPrimaryArtistBiography] = React.useState('');
  const [isBiographyExpanded, setIsBiographyExpanded] = React.useState(false);

  const lyricsListRef = React.useRef<FlatList>(null);
  const playerScrollRef = React.useRef<ScrollView>(null);
  const lyricScrollRetriedRef = React.useRef(false);
  const shouldScrollLyricsOnOpenRef = React.useRef(false);
  const currentTrackRef = React.useRef(currentTrack);
  const youtubeLinkRef = React.useRef({ trackKey: '', url: '' });
  const draftLyricSegmentsRef = React.useRef<LyricSegment[]>([]);
  const resumeAfterLyricEditRef = React.useRef(false);
  const currentTrackKey = getTrackKey(currentTrack);
  const currentDownloadJob = React.useMemo(
    () => downloads.find((job) => job.spotifyId === currentTrack?.spotifyId),
    [currentTrack?.spotifyId, downloads]
  );
  const currentTrackInput = React.useMemo(
    () => (currentTrack ? toDownloadTrackInput(currentTrack) : null),
    [currentTrack]
  );
  const isCurrentTrackDownloading =
    currentDownloadJob?.status === 'queued' ||
    currentDownloadJob?.status === 'resolving' ||
    currentDownloadJob?.status === 'downloading';
  const currentDownloadProgress = Math.max(
    0,
    Math.min(100, Math.round((currentDownloadJob?.progress || 0) * 100))
  );
  const artworkUrl = getTrackArtworkUri(currentTrack);
  const queueHasMultipleTracks = queue.length > 1;
  const previousQueueIndex =
    queueIndex > 0
      ? queueIndex - 1
      : repeatMode === 'all'
        ? queue.length - 1
        : -1;
  const nextQueueIndex =
    queueIndex < queue.length - 1
      ? queueIndex + 1
      : repeatMode === 'all'
        ? 0
        : -1;
  const previousTrack =
    queueHasMultipleTracks && previousQueueIndex >= 0
      ? queue[previousQueueIndex]
      : null;
  const nextTrack =
    queueHasMultipleTracks && nextQueueIndex >= 0
      ? queue[nextQueueIndex]
      : null;
  const canGoPrevious = !!previousTrack;
  const canGoNext = !!nextTrack;
  const artworkIsLoading =
    (!!playerState.isBuffering && !playerState.isPlaying) ||
    isArtworkNavigationPending;

  const artistLinks = React.useMemo(() => {
    if (!currentTrack) return [];
    if (currentTrack.artists?.length) return currentTrack.artists;
    return currentTrack.artistName
      .split(/\s*(?:,|&| feat\.?)\s*/i)
      .filter(Boolean)
      .map((name) => ({ id: '', name: name.trim() }));
  }, [currentTrack]);
  const primaryArtist = artistLinks[0];

  React.useEffect(() => {
    let active = true;
    setPrimaryArtistImage('');
    setArtistImages({});
    if (!primaryArtist) return;
    const key = primaryArtist.name;
    void (async () => {
      const spotifyId = /^[A-Za-z0-9]{22}$/.test(primaryArtist.id) ? primaryArtist.id : '';
      const imageURL = await getCachedArtistImage(key, () => spotifyId
        ? getSpotifyArtistImage(spotifyId)
        : primaryArtist.id.startsWith('ytartist_')
          ? getYouTubeMusicArtistImage(primaryArtist.id)
          : getYouTubeMusicArtistImage(`ytartist_name_${encodeURIComponent(primaryArtist.name)}`),
      [primaryArtist.id]);
      if (active) setPrimaryArtistImage(imageURL);
    })().catch(() => {});
    return () => { active = false; };
  }, [currentTrackKey, primaryArtist, primaryArtist?.id, primaryArtist?.name]);

  const primaryArtistId = primaryArtist?.id || '';
  const primaryArtistName = primaryArtist?.name || '';

  React.useEffect(() => {
    let active = true;
    setPrimaryArtistBiography('');
    setIsBiographyExpanded(false);
    if (!visible || !primaryArtistName) return;
    const routeId = primaryArtistId.startsWith('ytartist_')
      ? primaryArtistId
      : `ytartist_name_${encodeURIComponent(primaryArtistName)}`;
    void getYouTubeMusicArtistBiography(routeId).then((description) => {
      if (active) setPrimaryArtistBiography(description);
    }).catch(() => {});
    return () => { active = false; };
  }, [currentTrackKey, primaryArtistId, primaryArtistName, visible]);

  React.useEffect(() => {
    let active = true;
    if (!visible) return () => { active = false; };
    const loadImages = async () => {
      await Promise.all(artistLinks.map(async (artist) => {
        const key = artist.name;
        const spotifyId = /^[A-Za-z0-9]{22}$/.test(artist.id) ? artist.id : '';
        const imageURL = await getCachedArtistImage(key, () => spotifyId
          ? getSpotifyArtistImage(spotifyId)
          : artist.id.startsWith('ytartist_')
            ? getYouTubeMusicArtistImage(artist.id)
            : getYouTubeMusicArtistImage(`ytartist_name_${encodeURIComponent(artist.name)}`),
        [artist.id]);
        if (active && imageURL) {
          setArtistImages((current) => ({ ...current, [key]: imageURL }));
        }
      }));
    };
    void loadImages().catch(() => {});
    return () => { active = false; };
  }, [currentTrackKey, artistLinks, visible]);

  const handleArtistPress = React.useCallback(
    async (artistId: string, artistName: string) => {
      const isYouTubeTrack = currentTrack?.spotifyId.startsWith('yt_') ||
        Boolean(currentTrack?.youtubeVideoId);
      const targetArtistId = artistId.startsWith('ytartist_')
        ? artistId
        : currentTrack?.localAudioPath
          ? `local_artist_${encodeURIComponent(artistId ? `spotify:${artistId}` : artistName)}`
          : artistId ||
            (isYouTubeTrack
              ? `ytartist_name_${encodeURIComponent(artistName)}`
              : (await findArtistIdByName(artistName)) ||
                `local_artist_${encodeURIComponent(artistName)}`);
      openDetail('artist', targetArtistId);
      requestAnimationFrame(onClose);
    },
    [
      currentTrack?.localAudioPath,
      currentTrack?.spotifyId,
      currentTrack?.youtubeVideoId,
      onClose,
      openDetail,
    ]
  );

  const renderArtistPill = () => (
    <GlassSurface glass="regular" isInteractive style={styles.lyricsTrackPill}>
      <MarqueeText
        testID="player-artists"
        text={artistLinks.map((artist) => artist.name).join(' · ')}
        style={styles.lyricsTrackPillText}
        containerStyle={styles.lyricsTrackPillMarquee}
        align="center"
        fadeWidth={14}
        scrollMode="left"
        active={visible}
      >
        {artistLinks.map((artist, index) => (
          <React.Fragment key={`${artist.id}-${artist.name}-${index}`}>
            {index > 0 ? ' · ' : null}
            <Text
              accessibilityRole="link"
              accessibilityLabel={`Abrir artista ${artist.name}`}
              onPress={() => void handleArtistPress(artist.id, artist.name)}
            >
              {artist.name}
            </Text>
          </React.Fragment>
        ))}
      </MarqueeText>
    </GlassSurface>
  );

  React.useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  React.useEffect(() => {
    let active = true;
    const spotifyId = currentTrack?.spotifyId;
    if (!spotifyId) {
      setIsCurrentTrackDownloaded(false);
      return;
    }
    if (currentDownloadJob?.status === 'completed') {
      setIsCurrentTrackDownloaded(true);
      return;
    }
    void isTrackDownloaded(spotifyId).then((downloaded) => {
      if (active) setIsCurrentTrackDownloaded(downloaded);
    });
    return () => {
      active = false;
    };
  }, [currentDownloadJob?.status, currentTrack?.spotifyId, libraryRevision]);

  // Reset first so an old link can never open while next track resolves.
  React.useEffect(() => {
    youtubeLinkRef.current = { trackKey: currentTrackKey, url: '' };
    if (!currentTrack) {
      return;
    }

    const exactTrackUrl = getTrackYouTubeUrl(currentTrack);
    if (exactTrackUrl) {
      youtubeLinkRef.current.url = exactTrackUrl;
      return;
    }

    let isMounted = true;
    const resolveYoutubeUrl = async () => {
      try {
        const cached = await getCatalogMapping(currentTrack.spotifyId).catch(
          () => null
        );
        if (!isMounted) return;

        let url = getTrackYouTubeUrl({
          spotifyId: '',
          youtubeVideoId: cached?.videoId,
        });
        if (!url) {
          const result = await resolveSpotifyTrackVideoId(
            currentTrack.spotifyId,
            currentTrack.title,
            artistLinks.map((artist) => artist.name),
            currentTrack.duration_ms
          );
          if (result.status === 'resolved') {
            url = getTrackYouTubeUrl({
              spotifyId: '',
              youtubeVideoId: result.videoId,
            });
          }
        }
        if (isMounted) {
          youtubeLinkRef.current = { trackKey: currentTrackKey, url };
        }
      } catch {
        // A missing catalog match must not interrupt playback.
      }
    };
    void resolveYoutubeUrl();

    return () => {
      isMounted = false;
    };
  }, [artistLinks, currentTrack, currentTrackKey]);

  const lyricDurationMs =
    playerState.durationMs > 0
      ? playerState.durationMs
      : currentTrack?.duration_ms || 0;
  const displayedLyricSegments = React.useMemo(
    () => isLyricsEditing ? draftLyricSegments : lyricsData?.segments || [],
    [draftLyricSegments, isLyricsEditing, lyricsData?.segments]
  );
  const lyricTimelineDurationMs = Math.max(
    lyricDurationMs,
    getLastSegmentEndMs(displayedLyricSegments)
  );
  const lyricTimeline = React.useMemo(
    () =>
      displayedLyricSegments.length > 0
        ? getLyricTimelineBlocks(
            displayedLyricSegments,
            lyricTimelineDurationMs
          )
        : [],
    [displayedLyricSegments, lyricTimelineDurationMs]
  );
  React.useEffect(() => {
    draftLyricSegmentsRef.current = draftLyricSegments;
  }, [draftLyricSegments]);

  React.useEffect(() => {
    setIsLyricsEditing(false);
    setDraftLyricSegments([]);
    draftLyricSegmentsRef.current = [];
    setSelectedLyricTarget({ kind: 'lyric', index: 0 });
  }, [currentTrackKey]);

  React.useEffect(() => {
    playerScrollRef.current?.scrollTo({ y: 0, animated: false });
    setIsPlayerScrolled(false);
  }, [currentTrackKey]);

  React.useLayoutEffect(() => {
    if (!visible) return;
    playerScrollRef.current?.scrollTo({ y: 0, animated: false });
    setIsPlayerScrolled(false);
  }, [visible]);

  // This includes silent parts as music-note blocks, so gaps never inherit
  // the previous lyric as their active line.
  const activeLineIndex = React.useMemo(() => {
    if (lyricTimeline.length === 0) return -1;
    const currentMs = playerState.positionMs;
    const activeIndex = lyricTimeline.findIndex(
      (block) => currentMs >= block.startTimeMs && currentMs < block.endTimeMs
    );
    if (activeIndex >= 0) return activeIndex;

    const lastIndex = lyricTimeline.length - 1;
    return currentMs >= lyricTimeline[lastIndex].startTimeMs ? lastIndex : 0;
  }, [lyricTimeline, playerState.positionMs]);

  const lyricPreview = React.useMemo(() => {
    if (lyricTimeline.length) {
      const currentMs = playerState.positionMs;
      let start = lyricTimeline.findIndex((line) =>
        line.kind === 'lyric' && currentMs >= line.startTimeMs && currentMs < line.endTimeMs
      );
      if (start < 0) {
        start = lyricTimeline.findIndex((line) => line.kind === 'lyric' && line.endTimeMs > currentMs);
      }
      if (start < 0) start = lyricTimeline.findIndex((line) => line.kind === 'lyric');
      return lyricTimeline
        .slice(Math.max(0, start))
        .flatMap((line, offset) => line.kind === 'lyric'
          ? [{ text: line.text, active: Math.max(0, start) + offset === activeLineIndex }]
          : [])
        .slice(0, 2);
    }
    return (lyricsData?.plainLyrics || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .map((text, index) => ({ text, active: index === 0 }));
  }, [activeLineIndex, lyricTimeline, lyricsData?.plainLyrics, playerState.positionMs]);

  React.useEffect(() => {
    if (!isLyricsEditing || !playerState.isPlaying || activeLineIndex < 0) {
      return;
    }
    const activeBlock = lyricTimeline[activeLineIndex];
    if (!activeBlock) return;
    setSelectedLyricTarget(
      activeBlock.kind === 'lyric'
        ? { kind: 'lyric', index: activeBlock.index }
        : { kind: 'gap', target: getGapTarget(lyricTimeline, activeLineIndex) }
    );
  }, [activeLineIndex, isLyricsEditing, lyricTimeline, playerState.isPlaying]);

  const scrollLyricsToActive = React.useCallback(
    (animated: boolean) => {
      if (
        !showLyricsFull ||
        !shouldScrollLyricsOnOpenRef.current ||
        activeLineIndex < 0 ||
        !lyricsListRef.current ||
        isLyricsEditing ||
        activeLineIndex >= lyricTimeline.length
      ) {
        return;
      }

      lyricsListRef.current.scrollToIndex({
        index: activeLineIndex,
        animated,
        viewPosition: 0.35,
      });
    },
    [activeLineIndex, isLyricsEditing, lyricTimeline.length, showLyricsFull]
  );

  React.useEffect(() => {
    if (showLyricsFull) return;
    lyricScrollRetriedRef.current = false;
    shouldScrollLyricsOnOpenRef.current = false;
  }, [showLyricsFull]);

  // The active line is centered once when lyrics open. From then on the listener
  // owns the scroll position, even if playback continues.
  React.useEffect(() => {
    if (
      !showLyricsFull ||
      isLyricsEditing ||
      activeLineIndex < 0 ||
      !shouldScrollLyricsOnOpenRef.current
    ) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      scrollLyricsToActive(true);
      shouldScrollLyricsOnOpenRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [activeLineIndex, isLyricsEditing, scrollLyricsToActive, showLyricsFull]);

  const openLyricsView = () => {
    lyricScrollRetriedRef.current = false;
    shouldScrollLyricsOnOpenRef.current = true;
    setShowLyricsFull(true);
  };

  const toggleLyricsView = () => {
    if (showLyricsFull) {
      shouldScrollLyricsOnOpenRef.current = false;
      setShowLyricsFull(false);
      return;
    }
    openLyricsView();
  };

  const handleOpenYoutubeMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            'Cancelar',
            'Ir para o vídeo do YouTube',
            'Editar link do YouTube',
          ],
          cancelButtonIndex: 0,
          title: currentTrack?.title || 'YouTube',
          message: 'Fonte de áudio correspondente no YouTube',
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            handleGoToYoutube();
          } else if (buttonIndex === 2) {
            handleOpenEditLinkModal();
          }
        }
      );
    } else {
      setIsActionModalVisible(true);
    }
  };

  const handleGoToYoutube = () => {
    Haptics.selectionAsync().catch(() => {});
    setIsActionModalVisible(false);
    const activeTrack = currentTrackRef.current;
    const activeYoutubeUrl =
      getTrackYouTubeUrl(activeTrack) ||
      (youtubeLinkRef.current.trackKey === getTrackKey(activeTrack)
        ? youtubeLinkRef.current.url
        : '');
    if (!getExactYouTubeUrl(activeYoutubeUrl)) {
      Alert.alert(
        'Vídeo indisponível',
        'Ainda não foi possível encontrar a fonte desta música no YouTube.'
      );
      return;
    }
    Linking.openURL(activeYoutubeUrl).catch(() => {});
  };

  const handleOpenEditLinkModal = () => {
    Haptics.selectionAsync().catch(() => {});
    setIsActionModalVisible(false);
    const activeTrack = currentTrackRef.current;
    const activeYoutubeUrl =
      getTrackYouTubeUrl(activeTrack) ||
      (youtubeLinkRef.current.trackKey === getTrackKey(activeTrack)
        ? youtubeLinkRef.current.url
        : '');
    setCustomLinkInput(getExactYouTubeUrl(activeYoutubeUrl));
    setIsEditModalVisible(true);
  };

  const handleConfirmEditLink = async () => {
    if (!customLinkInput.trim() || !currentTrack) return;
    const newUrl = customLinkInput.trim();
    const parsedLink = parseSpotifyLink(newUrl);
    if (
      !parsedLink ||
      parsedLink.platform !== 'youtube' ||
      parsedLink.type !== 'track'
    ) {
      Alert.alert('Link inválido', 'Informe link de um vídeo do YouTube.');
      return;
    }

    const trackBeingEdited = currentTrack;
    setIsUpdatingAudio(true);

    try {
      const directTrack =
        Platform.OS !== 'web'
          ? await resolveDirectYouTubeTrack(parsedLink.id)
          : null;
      if (!directTrack) throw new Error('Could not resolve YouTube track');

      const track = {
        videoId: directTrack.videoId,
        youtubeUrl: `https://www.youtube.com/watch?v=${directTrack.videoId}`,
        streamUrl: directTrack.url,
        title: directTrack.title,
        artistName: directTrack.artistName,
        albumName: 'YouTube Track',
        imageURL: directTrack.imageURL || '',
        duration_ms: directTrack.durationMs,
        format: directTrack.format,
      };
      if (!track?.streamUrl || currentTrackRef.current !== trackBeingEdited)
        return;

      const nextTrack = {
        spotifyId: `yt_${track.videoId}`,
        title: track.title,
        artistName: track.artistName,
        albumName: track.albumName,
        imageURL: track.imageURL || trackBeingEdited.imageURL,
        duration_ms: track.duration_ms || trackBeingEdited.duration_ms,
        streamUrl: track.streamUrl,
        youtubeVideoId: track.videoId,
        youtubeUrl: track.youtubeUrl,
      };
      youtubeLinkRef.current = {
        trackKey: getTrackKey(nextTrack),
        url: track.youtubeUrl,
      };
      await playTrack(nextTrack, { setQueue: false });
      setIsEditModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {}
      );
    } catch (error) {
      Alert.alert(
        'Não foi possível atualizar',
        error instanceof Error &&
          error.message === YOUTUBE_STREAM_UNAVAILABLE_ERROR
          ? YOUTUBE_STREAM_UNAVAILABLE_MESSAGE
          : 'Verifique o link e tente novamente.'
      );
    } finally {
      setIsUpdatingAudio(false);
    }
  };

  if (!currentTrack) return null;

  const totalDurationMs =
    playerState.durationMs > 0
      ? playerState.durationMs
      : currentTrack.duration_ms || 0;
  const editorDurationMs = Math.max(
    totalDurationMs,
    getLastSegmentEndMs(draftLyricSegments)
  );

  const progress =
    !seeking && totalDurationMs > 0
      ? playerState.positionMs / totalDurationMs
      : seekValue;

  const handleDownloadAction = () => {
    if (!currentTrack || isCurrentTrackDownloading || isDownloadMutationPending)
      return;

    if (!isCurrentTrackDownloaded && currentTrackInput) {
      enqueueDownloads([currentTrackInput]);
      void upsertCatalogTracks([currentTrackInput])
        .then(() => refreshLibrary())
        .catch(() => {});
      Haptics.selectionAsync().catch(() => {});
      return;
    }

    Alert.alert(
      'Excluir download?',
      'A música continuará na biblioteca e poderá ser ouvida por streaming.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            setIsDownloadMutationPending(true);
            void deleteDownloadedTrack(currentTrack.spotifyId)
              .then((deleted) => {
                if (!deleted) throw new Error('download_not_found');
                clearCompletedDownloads();
                setIsCurrentTrackDownloaded(false);
                refreshLibrary();
                return Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success
                );
              })
              .catch(() => {
                Alert.alert(
                  'Não foi possível excluir',
                  'Feche outros players e tente novamente.'
                );
              })
              .finally(() => setIsDownloadMutationPending(false));
          },
        },
      ]
    );
  };

  const beginLyricsEditing = () => {
    if (!lyricsData?.segments.length) return;

    const nextDraft = lyricsData.segments.map((segment) => ({ ...segment }));
    const editTimeline = getLyricTimelineBlocks(nextDraft, totalDurationMs);
    const activeTimelineIndex = editTimeline.findIndex(
      (block) =>
        playerState.positionMs >= block.startTimeMs &&
        playerState.positionMs < block.endTimeMs
    );
    const activeBlock = editTimeline[activeTimelineIndex];
    const followingSegmentIndex = lyricsData.segments.findIndex(
      (segment) => segment.startTimeMs >= playerState.positionMs
    );
    if (playerState.isPlaying) void togglePlayPause();
    draftLyricSegmentsRef.current = nextDraft;
    setDraftLyricSegments(nextDraft);
    setSelectedLyricTarget(
      activeBlock?.kind === 'gap'
        ? {
            kind: 'gap',
            target: getGapTarget(editTimeline, activeTimelineIndex),
          }
        : {
            kind: 'lyric',
            index:
              activeBlock?.kind === 'lyric'
                ? activeBlock.index
                : followingSegmentIndex >= 0
                  ? followingSegmentIndex
                  : lyricsData.segments.length - 1,
          }
    );
    setIsLyricsEditing(true);
    Haptics.selectionAsync().catch(() => {});
  };

  const cancelLyricsEditing = () => {
    setIsLyricsEditing(false);
    setDraftLyricSegments([]);
    draftLyricSegmentsRef.current = [];
    Haptics.selectionAsync().catch(() => {});
  };

  const confirmLyricsEditing = async () => {
    const nextSegments = draftLyricSegmentsRef.current;
    if (!nextSegments.length) return cancelLyricsEditing();

    const wasSaved = await updateLyricsSegments(nextSegments);
    if (!wasSaved) {
      Alert.alert(
        'Não foi possível salvar',
        'A sincronização não foi alterada. Tente novamente.'
      );
      return;
    }
    setIsLyricsEditing(false);
    setDraftLyricSegments([]);
    draftLyricSegmentsRef.current = [];
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {}
    );
  };

  const updateDraftSegments = (
    update: (segments: LyricSegment[]) => LyricSegment[]
  ) => {
    const next = update(draftLyricSegmentsRef.current);
    draftLyricSegmentsRef.current = next;
    setDraftLyricSegments(next);
    return next;
  };

  const getEditorRange = (segments: LyricSegment[]) =>
    selectedLyricTarget.kind === 'lyric'
      ? segments[selectedLyricTarget.index] || null
      : {
          index: -1,
          text: '♪ ♪ ♪',
          ...getLyricGapRange(
            segments,
            selectedLyricTarget.target,
            Math.max(totalDurationMs, getLastSegmentEndMs(segments))
          ),
        };
  const selectedEditorRange = getEditorRange(draftLyricSegments);

  const moveSelectedEditorRange = (deltaMs: number) => {
    const previous = getEditorRange(draftLyricSegmentsRef.current);
    const next = updateDraftSegments((segments) =>
      selectedLyricTarget.kind === 'lyric'
        ? moveLyricSegment(segments, selectedLyricTarget.index, deltaMs)
        : moveLyricGap(segments, selectedLyricTarget.target, deltaMs)
    );
    const nextRange = getEditorRange(next);
    return previous && nextRange
      ? nextRange.startTimeMs - previous.startTimeMs
      : 0;
  };

  const resizeSelectedEditorRangeStart = (deltaMs: number) => {
    const previous = getEditorRange(draftLyricSegmentsRef.current);
    const next = updateDraftSegments((segments) =>
      selectedLyricTarget.kind === 'lyric'
        ? resizeLyricSegmentStart(segments, selectedLyricTarget.index, deltaMs)
        : resizeLyricGapStart(
            segments,
            selectedLyricTarget.target,
            deltaMs,
            editorDurationMs
          )
    );
    const nextRange = getEditorRange(next);
    return previous && nextRange
      ? nextRange.startTimeMs - previous.startTimeMs
      : 0;
  };

  const resizeSelectedEditorRangeEnd = (deltaMs: number) => {
    const previous = getEditorRange(draftLyricSegmentsRef.current);
    const next = updateDraftSegments((segments) =>
      selectedLyricTarget.kind === 'lyric'
        ? resizeLyricSegmentEnd(segments, selectedLyricTarget.index, deltaMs)
        : resizeLyricGapEnd(segments, selectedLyricTarget.target, deltaMs)
    );
    const nextRange = getEditorRange(next);
    return previous && nextRange ? nextRange.endTimeMs - previous.endTimeMs : 0;
  };

  const handleEditorScrubStart = () => {
    resumeAfterLyricEditRef.current = playerState.isPlaying;
    if (resumeAfterLyricEditRef.current) void togglePlayPause();
  };

  const handleEditorScrubEnd = (positionMs?: number) => {
    const selected = getEditorRange(draftLyricSegmentsRef.current);
    if (selected) void seekToPosition(positionMs ?? selected.startTimeMs);
    if (resumeAfterLyricEditRef.current) void togglePlayPause();
    resumeAfterLyricEditRef.current = false;
  };

  const handleEditorTogglePlayPause = async () => {
    if (playerState.isPlaying) {
      await togglePlayPause();
      return;
    }
    const selected = getEditorRange(draftLyricSegmentsRef.current);
    if (
      selected &&
      (playerState.positionMs < selected.startTimeMs ||
        playerState.positionMs >= selected.endTimeMs)
    ) {
      await seekToPosition(selected.startTimeMs);
    }
    await togglePlayPause();
  };

  const handleLyricPress = async (segment: LyricSegment, index: number) => {
    if (isLyricsEditing) setSelectedLyricTarget({ kind: 'lyric', index });
    await seekToPosition(segment.startTimeMs);
  };

  const handleGapPress = async (
    target: LyricGapTarget,
    startTimeMs: number
  ) => {
    if (isLyricsEditing) setSelectedLyricTarget({ kind: 'gap', target });
    await seekToPosition(startTimeMs);
  };

  const handleArtworkPrevious = async () => {
    if (artworkIsLoading || !canGoPrevious) return;

    setIsArtworkNavigationPending(true);
    try {
      await playQueueIndex(previousQueueIndex);
    } finally {
      setIsArtworkNavigationPending(false);
    }
  };

  const handleArtworkNext = async () => {
    if (artworkIsLoading || !canGoNext) return;

    setIsArtworkNavigationPending(true);
    try {
      await playQueueIndex(nextQueueIndex);
    } finally {
      setIsArtworkNavigationPending(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.container}>
          {artworkUrl ? (
            <Image
              cachePolicy="memory-disk"
              source={{ uri: artworkUrl }}
              style={styles.backgroundCover}
              blurRadius={28}
              contentFit="cover"
            />
          ) : null}
          <View style={[styles.backgroundScrim, { pointerEvents: 'none' }]} />
          {/* Grab Handle Header */}
          <View style={styles.topGrabRow}>
            <View style={styles.grabBar} />
          </View>

          {/* Top Navigation Bar */}
          <View style={styles.header}>
            <PlayerGlassButton
              accessibilityLabel={
                isLyricsEditing ? 'Cancelar edição da letra' : 'Fechar player'
              }
              onPress={isLyricsEditing ? cancelLyricsEditing : onClose}
              style={styles.headerIconButton}
            >
              <Ionicons
                name={isLyricsEditing ? 'close' : 'chevron-down'}
                size={26}
                color="#FFFFFF"
              />
            </PlayerGlassButton>
            <View style={styles.headerInfo}>
              {isPlayerScrolled && !showLyricsFull ? (
                <MiniPlayer
                  onPress={() => playerScrollRef.current?.scrollTo({ y: 0, animated: true })}
                  style={styles.scrolledMiniPlayer}
                />
              ) : (
                <Text style={styles.headerContext} numberOfLines={1}>
                  {currentTrack.title || 'Reproduzindo'}
                </Text>
              )}
            </View>
            <PlayerGlassButton
              accessibilityLabel={
                isLyricsEditing
                  ? 'Confirmar sincronização da letra'
                  : showLyricsFull
                    ? 'Editar sincronização da letra'
                    : 'Abrir letras sincronizadas'
              }
              onPress={
                isLyricsEditing
                  ? () => void confirmLyricsEditing()
                  : showLyricsFull
                    ? beginLyricsEditing
                    : openLyricsView
              }
              style={styles.headerIconButton}
              tintColor={
                isLyricsEditing || showLyricsFull
                  ? 'rgba(255,255,255,0.28)'
                  : undefined
              }
            >
              <Ionicons
                name={
                  isLyricsEditing
                    ? 'checkmark'
                    : showLyricsFull
                      ? 'pencil-outline'
                      : 'chatbubble-ellipses-outline'
                }
                size={22}
                color={
                  isLyricsEditing || showLyricsFull
                    ? '#FFFFFF'
                    : 'rgba(255,255,255,0.7)'
                }
              />
            </PlayerGlassButton>
          </View>

          {showLyricsFull ? (
            /* =========================================================
             * FULL SCREEN APPLE MUSIC SYNCED LYRICS VIEW
             * ========================================================= */
            <LyricsViewport>
              {lyricTimeline.length > 0 ? (
                <FlatList
                  testID="player-synced-lyrics"
                  style={styles.lyricsList}
                  removeClippedSubviews={false}
                  ref={lyricsListRef}
                  data={lyricTimeline}
                  extraData={`${activeLineIndex}:${isLyricsEditing}:${JSON.stringify(selectedLyricTarget)}`}
                  keyExtractor={(item) =>
                    item.kind === 'gap'
                      ? item.id
                      : `lyric_${item.startTimeMs}_${item.index}`
                  }
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.lyricsScrollContent}
                  onLayout={() => scrollLyricsToActive(false)}
                  onContentSizeChange={() => scrollLyricsToActive(false)}
                  onScrollToIndexFailed={({ averageItemLength }) => {
                    if (lyricScrollRetriedRef.current) return;
                    lyricScrollRetriedRef.current = true;
                    lyricsListRef.current?.scrollToOffset({
                      offset: Math.max(
                        0,
                        (activeLineIndex - 2) * averageItemLength
                      ),
                      animated: false,
                    });
                    requestAnimationFrame(() => scrollLyricsToActive(false));
                  }}
                  renderItem={({ item, index }) => {
                    const isActive = index === activeLineIndex;
                    const gapTarget =
                      item.kind === 'gap'
                        ? getGapTarget(lyricTimeline, index)
                        : null;
                    return (
                      <Pressable
                        onPress={() => {
                          if (item.kind === 'lyric') {
                            void handleLyricPress(item, item.index);
                          } else {
                            void handleGapPress(
                              gapTarget || getGapTarget(lyricTimeline, index),
                              item.startTimeMs
                            );
                          }
                        }}
                        style={[
                          styles.lyricLineButton,
                          isLyricsEditing && styles.lyricEditorLine,
                          isActive &&
                            !isLyricsEditing &&
                            styles.lyricLineActiveButton,
                        ]}
                      >
                        {isLyricsEditing ? (
                          <Text style={styles.lyricTiming}>
                            {formatTime(item.startTimeMs)}
                            {'\n'}
                            {formatTime(item.endTimeMs)}
                          </Text>
                        ) : null}
                        <Text
                          style={[
                            styles.lyricText,
                            item.kind === 'gap'
                              ? styles.lyricGapText
                              : isActive
                                ? styles.lyricTextActive
                                : styles.lyricTextInactive,
                            isLyricsEditing && styles.lyricEditorText,
                          ]}
                        >
                          {item.text}
                        </Text>
                      </Pressable>
                    );
                  }}
                />
              ) : lyricsData && lyricsData.plainLyrics ? (
                <FlatList
                  testID="player-plain-lyrics"
                  style={styles.lyricsList}
                  removeClippedSubviews={false}
                  data={lyricsData.plainLyrics
                    .split('\n')
                    .filter((l) => l.trim().length > 0)}
                  keyExtractor={(_, i) => String(i)}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.lyricsScrollContent}
                  renderItem={({ item }) => (
                    <View style={styles.plainLyricRow}>
                      <Text style={styles.plainLyricText}>{item}</Text>
                    </View>
                  )}
                />
              ) : (
                <View style={styles.noLyricsContainer}>
                  <MaterialCommunityIcons
                    name="microphone-outline"
                    size={52}
                    color="rgba(255,255,255,0.3)"
                  />
                  <Text style={styles.noLyricsText}>
                    {isLoadingLyrics
                      ? 'Carregando letra...'
                      : 'Letra não disponível para esta faixa.'}
                  </Text>
                </View>
              )}
            </LyricsViewport>
          ) : (
            <ScrollView
              ref={playerScrollRef}
              testID="player-scroll-view"
              style={styles.playerScroll}
              contentContainerStyle={[
                styles.playerScrollContent,
                { paddingBottom: Math.max(24, insets.bottom + 20) },
              ]}
              contentInsetAdjustmentBehavior="never"
              keyboardShouldPersistTaps="handled"
              onScroll={(event) => {
                const canShowMiniPlayer = controlsBottomOffset !== null &&
                  event.nativeEvent.contentOffset.y >= controlsBottomOffset;
                setIsPlayerScrolled(canShowMiniPlayer);
              }}
              scrollEventThrottle={100}
              showsVerticalScrollIndicator={false}
            >
            <View style={styles.mainPlayerSection}>
              {/* Floating Cover Art */}
              <SwipeableArtwork
                key={currentTrackKey}
                trackKey={currentTrackKey}
                artworkUri={artworkUrl}
                previousArtworkUri={getTrackArtworkUri(previousTrack)}
                nextArtworkUri={getTrackArtworkUri(nextTrack)}
                size={COVER_SIZE}
                canGoPrevious={canGoPrevious}
                canGoNext={canGoNext}
                onPrevious={handleArtworkPrevious}
                onNext={handleArtworkNext}
                loading={artworkIsLoading}
                fallbackSource={
                  getLocalArtworkFallback(currentTrack)
                }
                previousFallbackSource={
                  getLocalArtworkFallback(previousTrack)
                }
                nextFallbackSource={
                  getLocalArtworkFallback(nextTrack)
                }
                style={styles.coverContainer}
                testID="player-artwork"
              />

              <View style={styles.lyricPreview}>
                {lyricPreview.length ? lyricPreview.map((line, index) => (
                  <Text
                    key={`${currentTrackKey}-preview-${index}`}
                    numberOfLines={2}
                    style={[styles.lyricPreviewText, line.active && styles.lyricPreviewActive]}
                  >{line.text}</Text>
                )) : (
                  <Text style={styles.lyricPreviewPlaceholder}>
                    {isLoadingLyrics ? 'Carregando letra…' : 'Letra não disponível para esta faixa.'}
                  </Text>
                )}
              </View>
            </View>
            {isLyricsEditing ? (
              <LyricSyncEditor
                currentPositionMs={playerState.positionMs}
                selectedRange={selectedEditorRange}
                totalDurationMs={editorDurationMs}
                onMove={moveSelectedEditorRange}
                onResizeStart={resizeSelectedEditorRangeStart}
                onResizeEnd={resizeSelectedEditorRangeEnd}
                onScrubStart={handleEditorScrubStart}
                onScrubEnd={handleEditorScrubEnd}
                isPlaying={playerState.isPlaying}
                onTogglePlayPause={() => void handleEditorTogglePlayPause()}
                waveformSeed={currentTrack.title}
              />
            ) : (
              <>
                <View style={styles.actionPillRow}>
                  <PlayerGlassButton
                    accessibilityLabel={showLyricsFull ? 'Fechar letras sincronizadas' : 'Abrir letras sincronizadas'}
                    onPress={toggleLyricsView}
                    style={styles.circleActionBtn}
                    testID="player-lyrics-toggle"
                    tintColor={showLyricsFull ? 'rgba(255,255,255,0.28)' : undefined}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color={showLyricsFull ? '#FFFFFF' : 'rgba(255,255,255,0.75)'} />
                  </PlayerGlassButton>
                  {renderArtistPill()}
                  <PlayerGlassButton accessibilityLabel="Opções do YouTube" onPress={handleOpenYoutubeMenu} style={styles.circleActionBtn}>
                    <Ionicons name="logo-youtube" size={20} color="rgba(255,255,255,0.85)" />
                  </PlayerGlassButton>
                </View>
                <View style={styles.progressContainer}>
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={1}
                    value={progress}
                    minimumTrackTintColor="#FFFFFF"
                    maximumTrackTintColor="rgba(255,255,255,0.22)"
                    thumbTintColor="#FFFFFF"
                    onSlidingStart={(value) => { setSeeking(true); setSeekValue(value); }}
                    onValueChange={(value) => setSeekValue(value)}
                    onSlidingComplete={async (value) => {
                      setSeeking(false);
                      await seekToPosition(value * totalDurationMs);
                    }}
                  />
                  <View style={styles.timeRow}>
                    <Text style={styles.timeText}>{formatTime(seeking ? seekValue * totalDurationMs : playerState.positionMs)}</Text>
                    <Text style={styles.timeText}>{formatTime(totalDurationMs)}</Text>
                  </View>
                </View>
              </>
            )}

            {!isLyricsEditing ? (
              <View
                testID="player-controls-row"
                style={styles.controlsRow}
                onLayout={(event) => {
                  const { y, height } = event.nativeEvent.layout;
                  setControlsBottomOffset(y + height);
                }}
              >
                <PlayerGlassButton
                  accessibilityLabel={isCurrentTrackDownloading ? `Baixando ${currentDownloadProgress}%` : isCurrentTrackDownloaded ? 'Excluir download' : 'Baixar música'}
                  disabled={isCurrentTrackDownloading || isDownloadMutationPending}
                  onPress={handleDownloadAction}
                  style={styles.sideControlBtn}
                >
                  {isCurrentTrackDownloading ? <Text style={styles.downloadProgressText}>{currentDownloadProgress}%</Text> : isDownloadMutationPending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name={isCurrentTrackDownloaded ? 'trash-outline' : 'download-outline'} size={23} color="rgba(255,255,255,0.82)" />}
                </PlayerGlassButton>
                <PlayerGlassButton accessibilityLabel="Faixa anterior" disabled={!canGoPrevious} onPress={playPrevious} style={styles.seekControlBtn}>
                  <Ionicons name="play-back" size={32} color={canGoPrevious ? '#FFFFFF' : 'rgba(255,255,255,0.42)'} />
                </PlayerGlassButton>
                <PlayerGlassButton accessibilityLabel={playerState.isPlaying ? 'Pausar' : 'Tocar'} glass="thick" onPress={togglePlayPause} style={styles.playPauseCircle} tintColor="rgba(255,255,255,0.92)">
                  {playerState.isBuffering && !playerState.isPlaying ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name={playerState.isPlaying ? 'pause' : 'play'} size={34} color="#FFFFFF" style={!playerState.isPlaying ? { marginLeft: 3 } : undefined} />}
                </PlayerGlassButton>
                <PlayerGlassButton accessibilityLabel="Próxima faixa" disabled={!canGoNext} onPress={playNext} style={styles.seekControlBtn}>
                  <Ionicons name="play-forward" size={32} color={canGoNext ? '#FFFFFF' : 'rgba(255,255,255,0.42)'} />
                </PlayerGlassButton>
                <PlayerGlassButton accessibilityLabel="Adicionar música a playlists" onPress={() => setIsPlaylistPickerVisible(true)} style={styles.sideControlBtn}>
                  <MaterialCommunityIcons name="playlist-plus" size={24} color="rgba(255,255,255,0.82)" />
                </PlayerGlassButton>
              </View>
            ) : null}

            <View style={styles.artistDetailsSection}>
              <Text style={styles.artistDetailsHeading}>Sobre o artista</Text>
              <LoggedPressable
                accessibilityLabel={`Abrir perfil de ${primaryArtist?.name || 'artista principal'}`}
                disabled={!primaryArtist}
                onPress={() => primaryArtist && void handleArtistPress(primaryArtist.id, primaryArtist.name)}
                style={styles.primaryArtistCard}
              >
                {primaryArtistImage ? <SkeletonImage source={{ uri: primaryArtistImage }} cachePolicy="memory-disk" contentFit="cover" style={styles.primaryArtistImage} /> : <View style={[styles.primaryArtistImage, styles.primaryArtistFallback]}><Ionicons name="person" size={24} color="#DDD" /></View>}
                <View style={styles.primaryArtistCopy}>
                  <Text style={styles.artistRole}>Artista principal</Text>
                  <Text numberOfLines={1} style={styles.primaryArtistName}>{primaryArtist?.name || 'Artista não identificado'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
              </LoggedPressable>
              {primaryArtistBiography ? (
                <View style={styles.artistBiography}>
                  <Text numberOfLines={isBiographyExpanded ? undefined : 4} style={styles.artistBiographyText}>
                    {primaryArtistBiography}
                  </Text>
                  {primaryArtistBiography.length > 120 ? (
                    <LoggedPressable
                      accessibilityRole="button"
                      accessibilityLabel={isBiographyExpanded ? 'Mostrar menos sobre o artista' : 'Mostrar mais sobre o artista'}
                      onPress={() => setIsBiographyExpanded((expanded) => !expanded)}
                      style={styles.biographyToggle}
                    >
                      <Text style={styles.biographyToggleText}>{isBiographyExpanded ? 'Mostrar menos' : 'Mostrar mais'}</Text>
                    </LoggedPressable>
                  ) : null}
                </View>
              ) : null}

              <Text style={[styles.artistDetailsHeading, styles.creditsHeading]}>Créditos</Text>
              {artistLinks.map((artist, index) => (
                <LoggedPressable
                  key={`${artist.id}-${artist.name}-${index}`}
                  accessibilityLabel={`Abrir perfil de ${artist.name}`}
                  onPress={() => void handleArtistPress(artist.id, artist.name)}
                  style={styles.creditRow}
                >
                  {artistImages[artist.name] ? (
                    <SkeletonImage
                      source={{ uri: artistImages[artist.name] }}
                      cachePolicy="memory-disk"
                      contentFit="cover"
                      style={styles.creditAvatar}
                    />
                  ) : (
                    <View style={[styles.creditAvatar, styles.primaryArtistFallback]}>
                      <Ionicons name="person" size={17} color="#DDD" />
                    </View>
                  )}
                  <View style={styles.creditCopy}>
                    <Text numberOfLines={1} style={styles.creditName}>{artist.name}</Text>
                    <Text style={styles.creditRole}>{index === 0 ? 'Artista principal' : 'Participação'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.55)" />
                </LoggedPressable>
              ))}
            </View>
            </ScrollView>
          )}

          {showLyricsFull ? (
            isLyricsEditing ? (
              <LyricSyncEditor
                currentPositionMs={playerState.positionMs}
                selectedRange={selectedEditorRange}
                totalDurationMs={editorDurationMs}
                onMove={moveSelectedEditorRange}
                onResizeStart={resizeSelectedEditorRangeStart}
                onResizeEnd={resizeSelectedEditorRangeEnd}
                onScrubStart={handleEditorScrubStart}
                onScrubEnd={handleEditorScrubEnd}
                isPlaying={playerState.isPlaying}
                onTogglePlayPause={() => void handleEditorTogglePlayPause()}
                waveformSeed={currentTrack.title}
              />
            ) : (
              <View style={styles.lyricsPlaybackBar}>
                <View style={styles.actionPillRow}>
                  <PlayerGlassButton
                    accessibilityLabel="Fechar letras sincronizadas"
                    onPress={toggleLyricsView}
                    style={styles.circleActionBtn}
                    testID="player-lyrics-toggle"
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color="#FFFFFF" />
                  </PlayerGlassButton>
                  {renderArtistPill()}
                  <PlayerGlassButton accessibilityLabel="Opções do YouTube" onPress={handleOpenYoutubeMenu} style={styles.circleActionBtn}>
                    <Ionicons name="logo-youtube" size={20} color="rgba(255,255,255,0.85)" />
                  </PlayerGlassButton>
                </View>
                <View style={styles.progressContainer}>
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={1}
                    value={progress}
                    minimumTrackTintColor="#FFFFFF"
                    maximumTrackTintColor="rgba(255,255,255,0.22)"
                    thumbTintColor="#FFFFFF"
                    onSlidingStart={(value) => { setSeeking(true); setSeekValue(value); }}
                    onValueChange={setSeekValue}
                    onSlidingComplete={async (value) => {
                      setSeeking(false);
                      await seekToPosition(value * totalDurationMs);
                    }}
                  />
                  <View style={styles.timeRow}>
                    <Text style={styles.timeText}>{formatTime(playerState.positionMs)}</Text>
                    <Text style={styles.timeText}>{formatTime(totalDurationMs)}</Text>
                  </View>
                </View>
                <View style={styles.controlsRow}>
                  <PlayerGlassButton accessibilityLabel={isCurrentTrackDownloaded ? 'Excluir download' : 'Baixar música'} disabled={isCurrentTrackDownloading || isDownloadMutationPending} onPress={handleDownloadAction} style={styles.sideControlBtn}>
                    {isCurrentTrackDownloading ? <Text style={styles.downloadProgressText}>{currentDownloadProgress}%</Text> : <Ionicons name={isCurrentTrackDownloaded ? 'trash-outline' : 'download-outline'} size={23} color="rgba(255,255,255,0.82)" />}
                  </PlayerGlassButton>
                  <PlayerGlassButton accessibilityLabel="Faixa anterior" disabled={!canGoPrevious} onPress={playPrevious} style={styles.seekControlBtn}><Ionicons name="play-back" size={32} color={canGoPrevious ? '#FFFFFF' : 'rgba(255,255,255,0.42)'} /></PlayerGlassButton>
                  <PlayerGlassButton accessibilityLabel={playerState.isPlaying ? 'Pausar' : 'Tocar'} glass="thick" onPress={togglePlayPause} style={styles.playPauseCircle} tintColor="rgba(255,255,255,0.92)"><Ionicons name={playerState.isPlaying ? 'pause' : 'play'} size={34} color="#FFFFFF" /></PlayerGlassButton>
                  <PlayerGlassButton accessibilityLabel="Próxima faixa" disabled={!canGoNext} onPress={playNext} style={styles.seekControlBtn}><Ionicons name="play-forward" size={32} color={canGoNext ? '#FFFFFF' : 'rgba(255,255,255,0.42)'} /></PlayerGlassButton>
                  <PlayerGlassButton accessibilityLabel="Adicionar música a playlists" onPress={() => setIsPlaylistPickerVisible(true)} style={styles.sideControlBtn}><MaterialCommunityIcons name="playlist-plus" size={24} color="rgba(255,255,255,0.82)" /></PlayerGlassButton>
                </View>
              </View>
            )
          ) : null}

          <TrackPlaylistPickerModal
            onAdded={() => {
              refreshLibrary();
              void Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success
              );
            }}
            onClose={() => setIsPlaylistPickerVisible(false)}
            track={currentTrackInput!}
            visible={isPlaylistPickerVisible}
          />

          {/* =========================================================
           * YOUTUBE ACTIONS PICKER SHEET MODAL (Web & Cross-Platform)
           * ========================================================= */}
          <Modal
            visible={isActionModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setIsActionModalVisible(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setIsActionModalVisible(false)}
            >
              <View style={styles.actionSheetWrapper}>
                <GlassSurface glass="thick" style={styles.actionSheetContainer}>
                  <View style={styles.actionSheetHeader}>
                    <View style={styles.youtubeCircleBadge}>
                      <Ionicons name="logo-youtube" size={26} color="#FF0000" />
                    </View>
                    <Text style={styles.actionSheetTitle} numberOfLines={1}>
                      {currentTrack.title}
                    </Text>
                    <Text style={styles.actionSheetSubtitle}>
                      Fonte de áudio correspondente no YouTube
                    </Text>
                  </View>

                  <View style={styles.actionSheetDivider} />

                  <LoggedPressable
                    style={styles.actionSheetItem}
                    onPress={handleGoToYoutube}
                  >
                    <Ionicons name="open-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.actionSheetItemText}>
                      Ir para o vídeo do YouTube
                    </Text>
                  </LoggedPressable>

                  <View style={styles.actionSheetDivider} />

                  <LoggedPressable
                    style={styles.actionSheetItem}
                    onPress={handleOpenEditLinkModal}
                  >
                    <Ionicons name="create-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.actionSheetItemText}>
                      Editar link do YouTube
                    </Text>
                  </LoggedPressable>

                  <View style={styles.actionSheetDivider} />

                  <LoggedPressable
                    style={[
                      styles.actionSheetItem,
                      styles.actionSheetCancelItem,
                    ]}
                    onPress={() => setIsActionModalVisible(false)}
                  >
                    <Text style={styles.actionSheetCancelText}>Cancelar</Text>
                  </LoggedPressable>
                </GlassSurface>
              </View>
            </Pressable>
          </Modal>

          {/* =========================================================
           * EDIT YOUTUBE LINK MODAL (SwiftUI Glass Style)
           * ========================================================= */}
          <Modal
            visible={isEditModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setIsEditModalVisible(false)}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
              style={styles.editKeyboardAvoidingView}
            >
              <Pressable
                style={[styles.modalOverlay, styles.editModalOverlay]}
                onPress={() => setIsEditModalVisible(false)}
              >
                <Pressable
                  style={styles.editModalContainer}
                  onPress={(e) => e.stopPropagation()}
                >
                  <GlassSurface glass="thick" style={styles.editModalCard}>
                    <View style={styles.editModalHeader}>
                      <View style={styles.youtubeCircleBadge}>
                        <Ionicons name="logo-youtube" size={28} color="#FF0000" />
                      </View>
                      <Text style={styles.editModalTitle}>
                        Editar Link do YouTube
                      </Text>
                      <Text style={styles.editModalSubtitle}>
                        Altere o link do vídeo para atualizar instantaneamente o
                        áudio e a reprodução desta música.
                      </Text>
                    </View>

                    <View style={styles.inputWrapper}>
                      <Ionicons
                        name="link"
                        size={18}
                        color="rgba(255,255,255,0.6)"
                        style={styles.inputIcon}
                      />
                      <TextInput
                        value={customLinkInput}
                        onChangeText={setCustomLinkInput}
                        placeholder="https://www.youtube.com/watch?v=..."
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        style={styles.textInput}
                        autoCapitalize="none"
                        autoCorrect={false}
                        selectTextOnFocus
                        returnKeyType="done"
                      />
                    </View>

                    <View style={styles.modalButtonRow}>
                      <LoggedPressable
                        style={styles.modalCancelBtn}
                        onPress={() => setIsEditModalVisible(false)}
                      >
                        <Text style={styles.modalCancelBtnText}>Cancelar</Text>
                      </LoggedPressable>

                      <LoggedPressable
                        style={styles.modalConfirmBtn}
                        onPress={handleConfirmEditLink}
                        disabled={isUpdatingAudio}
                      >
                        {isUpdatingAudio ? (
                          <ActivityIndicator size="small" color="#000000" />
                        ) : (
                          <Text style={styles.modalConfirmBtnText}>
                            Atualizar Áudio
                          </Text>
                        )}
                      </LoggedPressable>
                    </View>
                  </GlassSurface>
                </Pressable>
              </Pressable>
            </KeyboardAvoidingView>
          </Modal>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  container: {
    backgroundColor: '#101116',
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 12 : 20,
    paddingBottom: 0,
    justifyContent: 'flex-start',
  },
  backgroundCover: {
    ...(StyleSheet.absoluteFill as any),
    opacity: 0.64,
    transform: [{ scale: 1.1 }],
  },
  backgroundScrim: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: 'rgba(8, 10, 16, 0.60)',
  },
  topGrabRow: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  grabBar: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 12,
  },
  headerFrom: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  headerContext: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 0,
  },
  scrolledMiniPlayer: {
    bottom: undefined,
    elevation: 0,
    left: undefined,
    position: 'relative',
    right: undefined,
    shadowOpacity: 0,
    top: undefined,
    width: '100%',
    zIndex: 1,
  },
  playerScroll: { flex: 1, minHeight: 0 },
  playerScrollContent: { paddingBottom: Platform.OS === 'ios' ? 136 : 96 },
  lyricsPlaybackBar: { paddingBottom: Platform.OS === 'ios' ? 24 : 14 },
  mainPlayerSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  coverContainer: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 16,
    marginBottom: 18,
  },
  cover: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  coverFallback: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackInfoSection: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 16,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  trackTitleMarquee: { maxWidth: '100%' },
  lyricPreview: { alignSelf: 'stretch', paddingHorizontal: 8, width: '100%' },
  lyricPreviewText: { color: 'rgba(255,255,255,0.58)', fontSize: 15, lineHeight: 21, textAlign: 'left' },
  lyricPreviewActive: { color: '#FFFFFF', fontWeight: '700' },
  lyricPreviewPlaceholder: { color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 20 },
  artistDetailsSection: { paddingHorizontal: 4, paddingTop: 18 },
  artistDetailsHeading: { color: '#FFFFFF', fontSize: 21, fontWeight: '700', marginBottom: 12 },
  primaryArtistCard: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.11)', borderRadius: 16, flexDirection: 'row', gap: 12, minHeight: 78, padding: 12 },
  primaryArtistImage: { borderRadius: 12, height: 54, width: 54 },
  primaryArtistFallback: { alignItems: 'center', backgroundColor: '#3A3A3A', justifyContent: 'center' },
  primaryArtistCopy: { flex: 1, gap: 4 },
  artistRole: { color: 'rgba(255,255,255,0.58)', fontSize: 12 },
  primaryArtistName: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  artistBiography: { paddingHorizontal: 12, paddingTop: 12 },
  artistBiographyText: { color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 20 },
  biographyToggle: { alignSelf: 'flex-start', paddingTop: 6 },
  biographyToggleText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  creditsHeading: { marginBottom: 4, marginTop: 22 },
  creditRow: { alignItems: 'center', borderBottomColor: 'rgba(255,255,255,0.1)', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 11, minHeight: 58, paddingHorizontal: 4 },
  creditAvatar: { alignItems: 'center', backgroundColor: '#3A3A3A', borderRadius: 18, height: 36, justifyContent: 'center', overflow: 'hidden', width: 36 },
  creditCopy: { flex: 1, gap: 3 },
  creditName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  creditRole: { color: 'rgba(255,255,255,0.58)', fontSize: 12 },
  lyricsMainContainer: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    marginVertical: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  lyricsList: { flex: 1, width: '100%' },
  lyricsScrollContent: {
    paddingTop: 48,
    paddingBottom: 72,
    paddingHorizontal: 12,
  },
  lyricLineButton: {
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  lyricEditorLine: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 68,
    paddingVertical: 12,
    position: 'relative',
    width: '100%',
  },
  lyricLineActiveButton: {
    transform: [{ scale: 1.02 }],
  },
  lyricText: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  lyricEditorText: {
    fontSize: 19,
    lineHeight: 25,
    paddingHorizontal: 52,
    width: '100%',
  },
  lyricTextActive: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textShadowColor: 'rgba(255,255,255,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  lyricTextInactive: {
    color: 'rgba(255,255,255,0.32)',
  },
  lyricGapText: {
    color: 'rgba(255,255,255,0.46)',
    fontSize: 18,
    letterSpacing: 6,
    textAlign: 'center',
  },
  lyricTiming: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 15,
    left: 0,
    position: 'absolute',
    textAlign: 'left',
    width: 52,
  },
  plainLyricRow: {
    paddingVertical: 8,
  },
  plainLyricText: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '500',
  },
  noLyricsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noLyricsText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '500',
    marginTop: 12,
  },
  actionPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    gap: 12,
  },
  circleActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lyricsTrackPill: {
    flex: 1,
    minWidth: 0,
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    maxWidth: SCREEN_WIDTH - 150,
  },
  lyricsTrackPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  lyricsTrackPillMarquee: { width: '100%' },
  progressContainer: {
    width: '100%',
    marginVertical: 8,
  },
  slider: {
    width: '100%',
    height: 36,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  timeText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  dolbyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dolbyBadgeText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  sideControlBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadProgressText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  seekControlBtn: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassButtonSurface: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glassButtonDisabled: {
    opacity: 0.34,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  editKeyboardAvoidingView: { flex: 1, justifyContent: 'flex-end' },
  editModalOverlay: { justifyContent: 'flex-end', paddingBottom: 8 },
  actionSheetWrapper: {
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  actionSheetContainer: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(20, 24, 33, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  actionSheetHeader: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  youtubeCircleBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  actionSheetTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  actionSheetSubtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  actionSheetDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 14,
  },
  actionSheetItemText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  actionSheetCancelItem: {
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  actionSheetCancelText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  editModalContainer: {
    width: '100%',
    maxWidth: 440,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  editModalCard: {
    borderRadius: 28,
    padding: 24,
    backgroundColor: 'rgba(18, 22, 30, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 20,
  },
  editModalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  editModalTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  editModalSubtitle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 20,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  modalButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 15,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1.3,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  modalConfirmBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
  },
});
