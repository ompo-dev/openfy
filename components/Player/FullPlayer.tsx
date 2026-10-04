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
  Animated,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
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
import { useSharedValue } from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  findArtistIdByName,
  getArtistCatalogImage,
  getYouTubeMusicArtistBiography,
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
import { GlassSurface, LoggedPressable } from '../native';
import { TrackPlaylistPickerModal } from '../LocalPlaylist/TrackPlaylistPickerModal';
import { LyricSyncEditor } from './LyricSyncEditor';
import { SyncedLyricText } from './SyncedLyricText';
import { MarqueeText } from '../common/MarqueeText';
import { useLyricScrubGesture } from '../common/useLyricScrubGesture';
import { SwipeableArtwork } from './SwipeableArtwork';
import { ArtworkBackground } from './ArtworkBackground';
import { MiniPlayer } from './MiniPlayer';
import { SkeletonImage } from '../common/SkeletonImage';
import { useConnectivityStore } from '../../stores/useConnectivityStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_SIZE = Math.min(Math.max(240, SCREEN_WIDTH * 0.82), 340);
const COVER_VIEWPORT_WIDTH = SCREEN_WIDTH;
const COVER_GAP = -16;
const PREVIEW_SCRUB_LINE_HEIGHT = 21;
const PLAYER_MEDIA_HEIGHT = COVER_SIZE + 18 + 42;

type FullPlayerProps = {
  visible: boolean;
  onClose: () => void;
};

const LyricsViewport = ({ children }: React.PropsWithChildren) => {
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
  const artworkProgress = useSharedValue(0);
  const isOffline = useConnectivityStore((state) => state.status === 'offline');
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
  const [hasOpenedLyrics, setHasOpenedLyrics] = React.useState(false);
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
  const [previewCurrentLineCount, setPreviewCurrentLineCount] = React.useState(0);
  const [scrubbedLyricTimelineIndex, setScrubbedLyricTimelineIndex] = React.useState<number | null>(null);
  const [isPreviewScrubbing, setIsPreviewScrubbing] = React.useState(false);
  const [isLyricsUserScrolling, setIsLyricsUserScrolling] = React.useState(false);
  const previewDragOffset = React.useRef(new Animated.Value(0)).current;
  const previewScrubbingRef = React.useRef(false);
  const playerScrollGesture = React.useMemo(() => Gesture.Native(), []);

  const lyricsListRef = React.useRef<FlatList>(null);
  const playerScrollRef = React.useRef<ScrollView>(null);
  const lyricScrollRetriesRef = React.useRef(0);
  const lyricScrollRetryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldScrollLyricsOnOpenRef = React.useRef(false);
  const manualLyricsFollowUntilRef = React.useRef(0);
  const manualLyricsFollowTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewGestureStartPositionRef = React.useRef(0);
  const previewLineIndicesRef = React.useRef<number[]>([]);
  const activePreviewPositionRef = React.useRef(0);
  const lastPreviewSeekTimelineIndexRef = React.useRef<number | null>(null);
  const lyricsListDraggingRef = React.useRef(false);
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
      const imageURL = await getCachedArtistImage(key, () =>
        getArtistCatalogImage(primaryArtist.id, primaryArtist.name),
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
        const imageURL = await getCachedArtistImage(key, () =>
          getArtistCatalogImage(artist.id, artist.name),
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
      const isSpotifyArtistId = /^[A-Za-z0-9]{22}$/.test(artistId);
      const shouldResolveArtistName = !isSpotifyArtistId && (
        !artistId || artistId.startsWith('ytartist_') || artistId.startsWith('local_artist_')
      );
      const canonicalArtistId = isSpotifyArtistId
        ? artistId
        : shouldResolveArtistName
          ? await findArtistIdByName(artistName)
          : '';
      const targetArtistId = canonicalArtistId || artistId || (
        isYouTubeTrack
          ? `ytartist_name_${encodeURIComponent(artistName)}`
          : `local_artist_${encodeURIComponent(artistName)}`
      );
      openDetail('artist', targetArtistId);
      requestAnimationFrame(onClose);
    },
    [
      currentTrack?.spotifyId,
      currentTrack?.youtubeVideoId,
      onClose,
      openDetail,
    ]
  );

  const renderArtistPill = (withArtwork = false) => (
    <GlassSurface
      glass="regular"
      testID="player-artists-pill"
      style={[styles.lyricsTrackPill, withArtwork && styles.lyricsTrackPillExpanded]}
    >
      {withArtwork ? (
        <LoggedPressable
          accessibilityRole="button"
          accessibilityLabel="Fechar letras sincronizadas"
          onPress={toggleLyricsView}
          style={styles.lyricsPillArtworkButton}
        >
          {artworkUrl ? (
            <SkeletonImage
              source={{ uri: artworkUrl }}
              cachePolicy="memory-disk"
              contentFit="cover"
              style={styles.lyricsPillArtwork}
            />
          ) : (
            <View style={[styles.lyricsPillArtwork, styles.coverFallback]}>
              <Ionicons name="musical-note" size={17} color="#FFFFFF" />
            </View>
          )}
        </LoggedPressable>
      ) : null}
      <View style={styles.lyricsTrackPillCopy}>
        <MarqueeText
          testID="player-artists"
          text={artistLinks.map((artist) => artist.name).join(' · ')}
          interactiveContent={artistLinks.map((artist, index) => (
            <React.Fragment key={`${artist.id}-${artist.name}-${index}`}>
              {index > 0 ? (
                <Text style={styles.lyricsTrackPillText} accessible={false}> · </Text>
              ) : null}
              <Pressable
                style={styles.artistLink}
                accessibilityRole="link"
                accessibilityLabel={`Abrir artista ${artist.name}`}
                hitSlop={{ top: 14, bottom: 14, left: 5, right: 5 }}
                pressRetentionOffset={{ top: 20, bottom: 20, left: 10, right: 10 }}
                onPress={() => void handleArtistPress(artist.id, artist.name)}
              >
                <Text style={styles.lyricsTrackPillText} numberOfLines={1} accessible={false}>
                  {artist.name}
                </Text>
              </Pressable>
            </React.Fragment>
          ))}
          style={styles.lyricsTrackPillText}
          containerStyle={styles.lyricsTrackPillMarquee}
          align="center"
          fadeWidth={14}
          scrollMode="left"
          delay={2000}
          endDelay={2000}
          speed={30}
          active={visible}
        />
      </View>
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
  const lyricTimelineRef = React.useRef(lyricTimeline);
  const scrubbedLyricTimelineIndexRef = React.useRef<number | null>(scrubbedLyricTimelineIndex);
  lyricTimelineRef.current = lyricTimeline;
  scrubbedLyricTimelineIndexRef.current = scrubbedLyricTimelineIndex;
  React.useEffect(() => {
    draftLyricSegmentsRef.current = draftLyricSegments;
  }, [draftLyricSegments]);

  React.useEffect(() => {
    setIsLyricsEditing(false);
    setDraftLyricSegments([]);
    draftLyricSegmentsRef.current = [];
    setSelectedLyricTarget({ kind: 'lyric', index: 0 });
    setScrubbedLyricTimelineIndex(null);
    previewScrubbingRef.current = false;
    setIsPreviewScrubbing(false);
    setIsLyricsUserScrolling(false);
    previewDragOffset.setValue(0);
    manualLyricsFollowUntilRef.current = 0;
    lyricsListDraggingRef.current = false;
    if (manualLyricsFollowTimerRef.current) {
      clearTimeout(manualLyricsFollowTimerRef.current);
      manualLyricsFollowTimerRef.current = null;
    }
  }, [currentTrackKey, previewDragOffset]);

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

  const lyricTimelineIndices = React.useMemo(
    () => lyricTimeline.flatMap((block, index) => block.kind === 'lyric' ? [index] : []),
    [lyricTimeline]
  );
  const activePreviewPosition = React.useMemo(() => {
    const currentMs = playerState.positionMs;
    const activePosition = lyricTimelineIndices.findIndex((index) => {
      const line = lyricTimeline[index];
      return currentMs >= line.startTimeMs && currentMs < line.endTimeMs;
    });
    if (activePosition >= 0) return activePosition;
    const upcomingPosition = lyricTimelineIndices.findIndex(
      (index) => lyricTimeline[index].endTimeMs > currentMs
    );
    return upcomingPosition >= 0 ? upcomingPosition : Math.max(0, lyricTimelineIndices.length - 1);
  }, [lyricTimeline, lyricTimelineIndices, playerState.positionMs]);
  previewLineIndicesRef.current = lyricTimelineIndices;
  activePreviewPositionRef.current = activePreviewPosition;

  const lyricPreview = React.useMemo(() => {
    if (lyricTimelineIndices.length) {
      const manualIndex = scrubbedLyricTimelineIndex === null
        ? -1
        : lyricTimelineIndices.indexOf(scrubbedLyricTimelineIndex);
      const firstLyric = lyricTimeline[lyricTimelineIndices[0]];
      const beforeFirstLyric = manualIndex < 0 &&
        playerState.positionMs < firstLyric.startTimeMs;
      const startPosition = manualIndex >= 0
        ? manualIndex
        : beforeFirstLyric ? 0 : activePreviewPosition;
      return lyricTimelineIndices
        .slice(startPosition, startPosition + 2)
        .map((timelineIndex) => {
          const line = lyricTimeline[timelineIndex];
          return {
            text: line.text,
            active: !beforeFirstLyric && (
              timelineIndex === activeLineIndex || timelineIndex === scrubbedLyricTimelineIndex
            ),
            timelineIndex,
            startTimeMs: line.startTimeMs,
          };
        });
    }
    return (lyricsData?.plainLyrics || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .map((text, index) => ({
        text,
        active: playerState.positionMs > 0 && index === 0,
        timelineIndex: null,
        startTimeMs: null,
      }));
  }, [
    activeLineIndex,
    activePreviewPosition,
    lyricTimeline,
    lyricTimelineIndices,
    lyricsData?.plainLyrics,
    playerState.positionMs,
    scrubbedLyricTimelineIndex,
  ]);
  const previewCurrentText = lyricPreview[0]?.text;
  const previewNextText = lyricPreview[1]?.text;

  React.useEffect(() => {
    setPreviewCurrentLineCount(0);
  }, [currentTrackKey, previewCurrentText, previewNextText]);

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
        Date.now() < manualLyricsFollowUntilRef.current ||
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

  const scrollLyricsToActiveRef = React.useRef(scrollLyricsToActive);
  scrollLyricsToActiveRef.current = scrollLyricsToActive;
  const pauseLyricsAutoFollow = React.useCallback(() => {
    manualLyricsFollowUntilRef.current = Date.now() + 2500;
    if (manualLyricsFollowTimerRef.current) {
      clearTimeout(manualLyricsFollowTimerRef.current);
    }
    manualLyricsFollowTimerRef.current = setTimeout(() => {
      if (previewScrubbingRef.current) return;
      manualLyricsFollowUntilRef.current = 0;
      manualLyricsFollowTimerRef.current = null;
      lyricsListDraggingRef.current = false;
      setIsLyricsUserScrolling(false);
      setScrubbedLyricTimelineIndex(null);
      scrollLyricsToActiveRef.current(true);
    }, 2500);
  }, []);
  const pauseLyricsAutoFollowRef = React.useRef(pauseLyricsAutoFollow);
  const seekToPositionRef = React.useRef(seekToPosition);
  pauseLyricsAutoFollowRef.current = pauseLyricsAutoFollow;
  seekToPositionRef.current = seekToPosition;

  React.useEffect(() => {
    if (showLyricsFull) return;
    lyricScrollRetriesRef.current = 0;
    shouldScrollLyricsOnOpenRef.current = false;
    manualLyricsFollowUntilRef.current = 0;
    lyricsListDraggingRef.current = false;
    if (manualLyricsFollowTimerRef.current) {
      clearTimeout(manualLyricsFollowTimerRef.current);
      manualLyricsFollowTimerRef.current = null;
    }
    setScrubbedLyricTimelineIndex(null);
    setIsLyricsUserScrolling(false);
  }, [showLyricsFull]);

  React.useEffect(() => () => {
    if (manualLyricsFollowTimerRef.current) {
      clearTimeout(manualLyricsFollowTimerRef.current);
    }
    if (lyricScrollRetryTimerRef.current) clearTimeout(lyricScrollRetryTimerRef.current);
  }, []);

  // Follow timing changes unless the listener is exploring another part.
  React.useEffect(() => {
    lyricScrollRetriesRef.current = 0;
    if (lyricScrollRetryTimerRef.current) clearTimeout(lyricScrollRetryTimerRef.current);
    if (
      !showLyricsFull ||
      isLyricsEditing ||
      activeLineIndex < 0
    ) {
      return;
    }

    const animated = !shouldScrollLyricsOnOpenRef.current;
    const frame = requestAnimationFrame(() => {
      scrollLyricsToActive(animated);
      shouldScrollLyricsOnOpenRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [activeLineIndex, isLyricsEditing, scrollLyricsToActive, showLyricsFull]);

  const openLyricsView = React.useCallback(() => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    Haptics.selectionAsync().catch(() => {});
    if (manualLyricsFollowTimerRef.current) {
      clearTimeout(manualLyricsFollowTimerRef.current);
      manualLyricsFollowTimerRef.current = null;
    }
    manualLyricsFollowUntilRef.current = 0;
    lyricScrollRetriesRef.current = 0;
    shouldScrollLyricsOnOpenRef.current = true;
    setIsLyricsUserScrolling(false);
    setHasOpenedLyrics(true);
    setShowLyricsFull(true);
  }, []);

  const toggleLyricsView = () => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    Haptics.selectionAsync().catch(() => {});
    if (showLyricsFull) {
      shouldScrollLyricsOnOpenRef.current = false;
      setShowLyricsFull(false);
      return;
    }
    openLyricsView();
  };

  const lyricPreviewGesture = useLyricScrubGesture({
    enabled: lyricTimelineIndices.length > 1,
    scrollGesture: playerScrollGesture,
    onPress: openLyricsView,
    onStart: () => {
        previewScrubbingRef.current = true;
        setIsPreviewScrubbing(true);
        pauseLyricsAutoFollowRef.current();
        const scrubbedIndex = scrubbedLyricTimelineIndexRef.current;
        const scrubbedPosition = scrubbedIndex === null
          ? -1
          : previewLineIndicesRef.current.indexOf(scrubbedIndex);
        const position = scrubbedPosition >= 0
          ? scrubbedPosition
          : activePreviewPositionRef.current;
        const timelineIndex = previewLineIndicesRef.current[position];
        previewGestureStartPositionRef.current = position;
        lastPreviewSeekTimelineIndexRef.current = timelineIndex ?? null;
        if (timelineIndex !== undefined) setScrubbedLyricTimelineIndex(timelineIndex);
    },
    onDrag: (translationY) => {
        const lineIndices = previewLineIndicesRef.current;
        if (lineIndices.length < 2) return;
        const start = previewGestureStartPositionRef.current;
        const position = Math.max(0, Math.min(
          lineIndices.length - 1,
          start + Math.round(-translationY / PREVIEW_SCRUB_LINE_HEIGHT)
        ));
        previewDragOffset.setValue(
          translationY + (position - start) * PREVIEW_SCRUB_LINE_HEIGHT
        );
        pauseLyricsAutoFollowRef.current();
        const timelineIndex = lineIndices[position];
        const line = lyricTimelineRef.current[timelineIndex];
        if (!line || lastPreviewSeekTimelineIndexRef.current === timelineIndex) return;
        lastPreviewSeekTimelineIndexRef.current = timelineIndex;
        setScrubbedLyricTimelineIndex(timelineIndex);
        Haptics.selectionAsync().catch(() => {});
        void seekToPositionRef.current(line.startTimeMs);
    },
    onEnd: () => {
      if (!previewScrubbingRef.current) return;
      previewScrubbingRef.current = false;
      setIsPreviewScrubbing(false);
      previewDragOffset.setValue(0);
      pauseLyricsAutoFollowRef.current();
    },
  });

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

  const handleArtworkPrevious = React.useCallback(() => {
    if (canGoPrevious) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      void playQueueIndex(previousQueueIndex);
    }
  }, [canGoPrevious, playQueueIndex, previousQueueIndex]);
  const handleArtworkNext = React.useCallback(() => {
    if (canGoNext) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      void playQueueIndex(nextQueueIndex);
    }
  }, [canGoNext, nextQueueIndex, playQueueIndex]);
  const handlePlayPrevious = React.useCallback(() => {
    if (!canGoPrevious) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    void playPrevious();
  }, [canGoPrevious, playPrevious]);
  const handlePlayNext = React.useCallback(() => {
    if (!canGoNext) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    void playNext();
  }, [canGoNext, playNext]);

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

  const applyImportedSegments = (segments: LyricSegment[]) => {
    draftLyricSegmentsRef.current = segments;
    setDraftLyricSegments(segments);
    const selectedIndex = selectedLyricTarget.kind === 'lyric'
      ? Math.min(selectedLyricTarget.index, Math.max(0, segments.length - 1))
      : Math.max(0, segments.findIndex((segment) =>
        playerState.positionMs >= segment.startTimeMs && playerState.positionMs < segment.endTimeMs
      ));
    setSelectedLyricTarget({ kind: 'lyric', index: selectedIndex });
    Haptics.selectionAsync().catch(() => {});
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
      await togglePlayPause('lyrics-editor');
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
    await togglePlayPause('lyrics-editor');
  };

  const handleLyricPress = async (segment: LyricSegment, index: number) => {
    pauseLyricsAutoFollow();
    if (isLyricsEditing) setSelectedLyricTarget({ kind: 'lyric', index });
    await seekToPosition(segment.startTimeMs);
  };

  const handleGapPress = async (
    target: LyricGapTarget,
    startTimeMs: number
  ) => {
    pauseLyricsAutoFollow();
    if (isLyricsEditing) setSelectedLyricTarget({ kind: 'gap', target });
    await seekToPosition(startTimeMs);
  };

  const renderArtistDetails = () => (
    <View testID="player-artist-details" style={styles.artistDetailsSection}>
      <Text style={styles.artistDetailsHeading}>Sobre o artista</Text>
      <LoggedPressable
        accessibilityLabel={`Abrir perfil de ${primaryArtist?.name || 'artista principal'}`}
        disabled={!primaryArtist}
        onPress={() => primaryArtist && void handleArtistPress(primaryArtist.id, primaryArtist.name)}
        style={styles.primaryArtistCard}
      >
        {primaryArtistImage ? (
          <SkeletonImage
            source={{ uri: primaryArtistImage }}
            cachePolicy="memory-disk"
            contentFit="cover"
            style={styles.primaryArtistImage}
          />
        ) : (
          <View style={[styles.primaryArtistImage, styles.primaryArtistFallback]}>
            <Ionicons name="person" size={24} color="#DDD" />
          </View>
        )}
        <View style={styles.primaryArtistCopy}>
          <Text style={styles.artistRole}>Artista principal</Text>
          <Text numberOfLines={1} style={styles.primaryArtistName}>
            {primaryArtist?.name || 'Artista não identificado'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
      </LoggedPressable>
      {primaryArtistBiography ? (
        <View style={styles.artistBiography}>
          <Text
            numberOfLines={isBiographyExpanded ? undefined : 4}
            style={styles.artistBiographyText}
          >
            {primaryArtistBiography}
          </Text>
          {primaryArtistBiography.length > 120 ? (
            <LoggedPressable
              accessibilityRole="button"
              accessibilityLabel={isBiographyExpanded ? 'Mostrar menos sobre o artista' : 'Mostrar mais sobre o artista'}
              onPress={() => setIsBiographyExpanded((expanded) => !expanded)}
              style={styles.biographyToggle}
            >
              <Text style={styles.biographyToggleText}>
                {isBiographyExpanded ? 'Mostrar menos' : 'Mostrar mais'}
              </Text>
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
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.container}>
          <ArtworkBackground current={artworkUrl}
            previous={getTrackArtworkUri(previousTrack)}
            next={getTrackArtworkUri(nextTrack)} progress={artworkProgress} />
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
            <LinearGradient
              colors={['rgba(8,10,16,0.38)', 'rgba(8,10,16,0)']}
              pointerEvents="none"
              style={styles.headerBottomFade}
            />
          </View>

          <GestureDetector gesture={playerScrollGesture}>
            <ScrollView
              ref={playerScrollRef}
              testID="player-scroll-view"
              style={styles.playerScroll}
              contentContainerStyle={[
                styles.playerScrollContent,
                { paddingTop: isLyricsEditing ? 0 : undefined,
                  paddingBottom: isLyricsEditing
                  ? Math.max(16, insets.bottom + 8)
                  : Math.max(24, insets.bottom + 20) },
              ]}
              contentInsetAdjustmentBehavior="never"
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              onScroll={(event) => {
                const canShowMiniPlayer = controlsBottomOffset !== null &&
                  event.nativeEvent.contentOffset.y >= controlsBottomOffset;
                setIsPlayerScrolled(canShowMiniPlayer);
              }}
              scrollEventThrottle={100}
              showsVerticalScrollIndicator={false}
            >
            <View testID="player-media-section" style={styles.mainPlayerSection}>
              {hasOpenedLyrics ? (
                <View
                  testID="player-lyrics-panel"
                  style={[styles.lyricsCoverViewport, !showLyricsFull && styles.hiddenLyricsPanel]}
                  pointerEvents={showLyricsFull ? 'auto' : 'none'}
                  accessibilityElementsHidden={!showLyricsFull}
                  importantForAccessibility={showLyricsFull ? 'auto' : 'no-hide-descendants'}
                >
                  <LyricsViewport>
              {lyricTimeline.length > 0 ? (
                <FlatList
                  testID="player-synced-lyrics"
                  key={currentTrackKey}
                  style={styles.lyricsList}
                  removeClippedSubviews={false}
                  ref={lyricsListRef}
                  data={lyricTimeline}
                  extraData={`${activeLineIndex}:${isLyricsEditing}:${isLyricsUserScrolling}:${JSON.stringify(selectedLyricTarget)}`}
                  keyExtractor={(item) =>
                    item.kind === 'gap'
                      ? item.id
                      : `lyric_${item.startTimeMs}_${item.index}`
                  }
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  contentContainerStyle={styles.lyricsScrollContent}
                  onLayout={() => scrollLyricsToActive(false)}
                  onContentSizeChange={() => scrollLyricsToActive(false)}
                  onScrollBeginDrag={() => {
                    lyricsListDraggingRef.current = true;
                    setIsLyricsUserScrolling(true);
                    Haptics.selectionAsync().catch(() => {});
                    pauseLyricsAutoFollow();
                  }}
                  onScroll={() => {
                    if (lyricsListDraggingRef.current) pauseLyricsAutoFollow();
                  }}
                  onScrollEndDrag={() => pauseLyricsAutoFollow()}
                  onMomentumScrollEnd={() => {
                    lyricsListDraggingRef.current = false;
                    pauseLyricsAutoFollow();
                  }}
                  onScrollToIndexFailed={({ index, averageItemLength }) => {
                    if (!showLyricsFull || isLyricsEditing || index !== activeLineIndex ||
                      Date.now() < manualLyricsFollowUntilRef.current || lyricScrollRetriesRef.current >= 8) return;
                    lyricScrollRetriesRef.current += 1;
                    lyricsListRef.current?.scrollToOffset({
                      offset: Math.max(
                        0,
                        (activeLineIndex - 2) * averageItemLength
                      ),
                      animated: false,
                    });
                    // Native lyric heights arrive asynchronously; wait for the target batch to mount.
                    if (lyricScrollRetryTimerRef.current) clearTimeout(lyricScrollRetryTimerRef.current);
                    lyricScrollRetryTimerRef.current = setTimeout(() => scrollLyricsToActiveRef.current(false), 100);
                  }}
                  renderItem={({ item, index }) => {
                    const isActive = index === activeLineIndex;
                    const gapTarget =
                      item.kind === 'gap'
                        ? getGapTarget(lyricTimeline, index)
                        : null;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={item.text}
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
                        ]}
                      >
                        {isLyricsEditing ? (
                          <Text style={styles.lyricTiming}>
                            {formatTime(item.startTimeMs)}
                            {'\n'}
                            {formatTime(item.endTimeMs)}
                          </Text>
                        ) : null}
                        {!isLyricsEditing && item.kind === 'lyric' ? (
                          <SyncedLyricText active={isActive} blurred={!isActive && !isLyricsUserScrolling}>
                            {item.text}
                          </SyncedLyricText>
                        ) : <Text
                          style={[
                            styles.lyricText,
                            item.kind === 'gap'
                              ? styles.lyricGapText
                              : isActive
                                ? styles.lyricTextActive
                                : styles.lyricTextUnblurred,
                            isLyricsEditing && styles.lyricEditorText,
                          ]}
                        >
                          {item.text}
                        </Text>}
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
                  nestedScrollEnabled
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
                </View>
              ) : null}
              {!showLyricsFull ? (
              <>
              <SwipeableArtwork
                trackKey={currentTrackKey}
                artworkUri={artworkUrl}
                previousArtworkUri={getTrackArtworkUri(previousTrack)}
                nextArtworkUri={getTrackArtworkUri(nextTrack)}
                size={COVER_SIZE}
                viewportWidth={COVER_VIEWPORT_WIDTH}
                gap={COVER_GAP}
                progress={artworkProgress}
                scrollGesture={playerScrollGesture}
                canGoPrevious={canGoPrevious}
                canGoNext={canGoNext}
                onPrevious={handleArtworkPrevious}
                onNext={handleArtworkNext}
                loading={false}
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

              <GestureDetector gesture={lyricPreviewGesture}>
                <View
                  collapsable={false}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Abrir letra completa"
                  testID="player-lyric-preview"
                  onAccessibilityTap={openLyricsView}
                  style={styles.lyricPreview}
                >
                  {isPreviewScrubbing ? (
                    <Animated.View
                      pointerEvents="none"
                      testID="player-lyric-scrub-stack"
                      style={[styles.lyricScrubStack, {
                        transform: [{ translateY: Animated.add(previewDragOffset, -2 * PREVIEW_SCRUB_LINE_HEIGHT) }],
                      }]}
                    >
                      {[-2, -1, 0, 1, 2, 3].map((offset) => {
                        const selected = lyricTimelineIndices.indexOf(scrubbedLyricTimelineIndex ?? -1);
                        const line = lyricTimeline[lyricTimelineIndices[selected + offset]];
                        return (
                          <Text
                            key={offset}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            style={[styles.lyricScrubRow, styles.lyricPreviewText,
                              offset === 0 && styles.lyricPreviewActive]}
                          >{line?.text || ' '}</Text>
                        );
                      })}
                    </Animated.View>
                  ) : lyricPreview.length ? (
                    <>
                      <Text
                        testID="player-lyric-preview-current"
                        numberOfLines={lyricPreview[0].active ? 2 : 1}
                        ellipsizeMode="tail"
                        onTextLayout={(event) => setPreviewCurrentLineCount(event.nativeEvent.lines.length)}
                        style={[styles.lyricPreviewText, lyricPreview[0].active && styles.lyricPreviewActive]}
                      >{lyricPreview[0].text}</Text>
                      {lyricPreview[1] && (
                        !lyricPreview[0].active || previewCurrentLineCount === 1
                      ) ? (
                        <Text
                          testID="player-lyric-preview-next"
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          style={[styles.lyricPreviewNext, lyricPreview[1].active && styles.lyricPreviewActive]}
                        >{lyricPreview[1].text}</Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.lyricPreviewPlaceholder}>
                      {isLoadingLyrics ? 'Carregando letra…' : 'Letra não disponível para esta faixa.'}
                    </Text>
                  )}
                </View>
              </GestureDetector>
              </>
              ) : null}
            </View>
            {isLyricsEditing ? (
              <View style={styles.controlsBoundaryMarker}>
                <LinearGradient
                  colors={['rgba(8,10,16,0)', 'rgba(8,10,16,0.34)']}
                  pointerEvents="none"
                  style={styles.controlsTopFade}
                />
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
                  segments={draftLyricSegments}
                  onApplySegments={applyImportedSegments}
                />
              </View>
            ) : (
              <>
                {showLyricsFull ? (
                  <View pointerEvents="none" style={styles.controlsBoundaryMarker}>
                    <LinearGradient
                      colors={['rgba(8,10,16,0)', 'rgba(8,10,16,0.34)']}
                      style={styles.controlsTopFade}
                    />
                  </View>
                ) : null}
                <View style={styles.actionPillRow}>
                  {!showLyricsFull ? <PlayerGlassButton
                    accessibilityLabel="Abrir letras sincronizadas"
                    onPress={toggleLyricsView}
                    style={styles.circleActionBtn}
                    testID="player-lyrics-toggle"
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color="rgba(255,255,255,0.75)" />
                  </PlayerGlassButton> : null}
                  {renderArtistPill(showLyricsFull)}
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
                    onSlidingStart={(value) => {
                      setSeeking(true);
                      setSeekValue(value);
                      Haptics.selectionAsync().catch(() => {});
                    }}
                    onValueChange={(value) => setSeekValue(value)}
                    onSlidingComplete={async (value) => {
                      setSeeking(false);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
                  accessibilityLabel={isCurrentTrackDownloading ? `Baixando ${currentDownloadProgress}%` : isCurrentTrackDownloaded ? 'Excluir download' : isOffline ? 'Offline: download indisponível' : 'Baixar música'}
                  disabled={isCurrentTrackDownloading || isDownloadMutationPending}
                  onPress={handleDownloadAction}
                  style={styles.sideControlBtn}
                >
                  {isCurrentTrackDownloading ? <Text style={styles.downloadProgressText}>{currentDownloadProgress}%</Text> : isDownloadMutationPending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name={isCurrentTrackDownloaded ? 'trash-outline' : isOffline ? 'cloud-offline-outline' : 'download-outline'} size={23} color="rgba(255,255,255,0.82)" />}
                </PlayerGlassButton>
                <PlayerGlassButton accessibilityLabel="Faixa anterior" disabled={!canGoPrevious} onPress={handlePlayPrevious} style={styles.seekControlBtn}>
                  <Ionicons name="play-back" size={32} color={canGoPrevious ? '#FFFFFF' : 'rgba(255,255,255,0.42)'} />
                </PlayerGlassButton>
                <PlayerGlassButton accessibilityLabel={playerState.isPlaying ? 'Pausar' : 'Tocar'} glass="thick" onPress={togglePlayPause} style={styles.playPauseCircle} tintColor="rgba(255,255,255,0.92)">
                  {playerState.isBuffering && !playerState.isPlaying ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name={playerState.isPlaying ? 'pause' : 'play'} size={34} color="#FFFFFF" style={!playerState.isPlaying ? { marginLeft: 3 } : undefined} />}
                </PlayerGlassButton>
                <PlayerGlassButton accessibilityLabel="Próxima faixa" disabled={!canGoNext} onPress={handlePlayNext} style={styles.seekControlBtn}>
                  <Ionicons name="play-forward" size={32} color={canGoNext ? '#FFFFFF' : 'rgba(255,255,255,0.42)'} />
                </PlayerGlassButton>
                <PlayerGlassButton accessibilityLabel="Adicionar música a playlists" onPress={() => setIsPlaylistPickerVisible(true)} style={styles.sideControlBtn}>
                  <MaterialCommunityIcons name="playlist-plus" size={24} color="rgba(255,255,255,0.82)" />
                </PlayerGlassButton>
              </View>
            ) : null}

            {!isLyricsEditing ? renderArtistDetails() : null}
            </ScrollView>
            </GestureDetector>

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
    position: 'relative',
    zIndex: 20,
  },
  headerBottomFade: { bottom: -28, height: 42, left: 0, position: 'absolute', right: 0, zIndex: -1 },
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
  playerScroll: { flex: 1, minHeight: 0, marginHorizontal: -24 },
  playerScrollContent: { paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 136 : 96 },
  mainPlayerSection: {
    alignItems: 'center',
    justifyContent: 'center',
    height: PLAYER_MEDIA_HEIGHT,
    marginTop: 8,
    marginBottom: 4,
  },
  coverContainer: {
    width: COVER_VIEWPORT_WIDTH,
    height: COVER_SIZE,
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
  lyricPreview: { alignSelf: 'stretch', height: 42, justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 8, width: '100%' },
  lyricScrubStack: { position: 'absolute', top: 0, left: 8, right: 8 },
  lyricScrubRow: { height: PREVIEW_SCRUB_LINE_HEIGHT },
  lyricPreviewText: { color: 'rgba(255,255,255,0.58)', fontSize: 15, lineHeight: 21, textAlign: 'left' },
  lyricPreviewNext: { color: 'rgba(255,255,255,0.48)', fontSize: 13, lineHeight: 18, textAlign: 'left' },
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
    position: 'relative',
    overflow: 'hidden',
  },
  controlsBoundaryMarker: { height: 0, position: 'relative', width: '100%', zIndex: 5 },
  controlsTopFade: { height: 48, left: 0, position: 'absolute', right: 0, top: -42 },
  lyricsCoverViewport: {
    position: 'absolute',
    top: 0,
    flexGrow: 0,
    flexShrink: 0,
    height: PLAYER_MEDIA_HEIGHT,
    width: '100%',
  },
  hiddenLyricsPanel: { opacity: 0 },
  lyricsList: { flex: 1, width: '100%' },
  lyricsScrollContent: {
    paddingTop: 48,
    paddingBottom: 72,
    paddingHorizontal: 12,
  },
  lyricLineButton: {
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 8,
    width: '100%',
  },
  lyricEditorLine: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 68,
    paddingVertical: 12,
    position: 'relative',
    width: '100%',
  },
  lyricText: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 0,
    textAlign: 'left',
    width: '100%',
  },
  lyricEditorText: {
    fontSize: 19,
    lineHeight: 25,
    paddingHorizontal: 52,
    width: '100%',
  },
  lyricTextActive: {
    color: '#FFFFFF',
  },
  lyricTextUnblurred: {
    color: 'rgba(255,255,255,0.48)',
  },
  lyricGapText: {
    color: 'rgba(255,255,255,0.46)',
    fontSize: 18,
    letterSpacing: 6,
    textAlign: 'left',
    width: '100%',
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
    height: 50,
    paddingHorizontal: 14,
    borderRadius: 25,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    maxWidth: SCREEN_WIDTH - 138,
  },
  lyricsTrackPillExpanded: {
    maxWidth: '100%',
    paddingLeft: 68,
    paddingRight: 14,
  },
  lyricsPillArtworkButton: {
    alignItems: 'center',
    position: 'absolute',
    left: 18,
    top: 5,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  lyricsPillArtwork: {
    backgroundColor: '#252525',
    borderRadius: 10,
    height: 36,
    overflow: 'hidden',
    width: 36,
  },
  lyricsTrackPillCopy: {
    flex: 1,
    minWidth: 0,
  },
  lyricsTrackPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
  },
  artistLink: { flexShrink: 0 },
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
