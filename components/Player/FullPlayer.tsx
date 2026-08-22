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
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Href, useRouter, useSegments } from 'expo-router';
import { findArtistIdByName } from '@api';
import { MUSIC_SERVER_URL } from '@config';
import { usePlayer } from '@context';
import {
  getLyricGapRange,
  getLyricTimelineBlocks,
  LyricGapTarget,
  LyricSegment,
  LyricTimelineBlock,
  moveLyricGap,
  moveLyricSegment,
  parseSpotifyLink,
  resizeLyricGapEnd,
  resizeLyricGapStart,
  resizeLyricSegmentEnd,
  resizeLyricSegmentStart,
} from '@services';
import { GlassSurface, LoggedPressable } from '../native';
import { LyricSyncEditor } from './LyricSyncEditor';
import { MarqueeText } from '../common/MarqueeText';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
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

  return (
    <MaskedView
      style={styles.lyricsMainContainer}
      maskElement={
        <View style={styles.lyricsMask}>
          <LinearGradient
            colors={['transparent', '#000000', '#000000', 'transparent']}
            locations={[0, 0.14, 0.86, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      }
    >
      <View style={styles.lyricsMaskContent}>{children}</View>
    </MaskedView>
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
  track: { spotifyId: string; youtubeUrl?: string } | null
): string => {
  const explicitUrl = getExactYouTubeUrl(track?.youtubeUrl);
  if (explicitUrl) return explicitUrl;

  const directVideoId = track?.spotifyId?.match(
    /^yt_([A-Za-z0-9_-]{11})$/
  )?.[1];
  return directVideoId
    ? `https://www.youtube.com/watch?v=${directVideoId}`
    : '';
};

type PlayerGlassButtonProps = {
  accessibilityLabel: string;
  children: React.ReactNode;
  disabled?: boolean;
  glass?: 'regular' | 'clear' | 'thick';
  onPress?: () => void;
  style?: any;
  surfaceStyle?: any;
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
  const router = useRouter();
  const segments = useSegments();
  const {
    currentTrack,
    playerState,
    playTrack,
    togglePlayPause,
    seekToPosition,
    playNext,
    playPrevious,
    queue,
    queueIndex,
    lyricsData,
    isLoadingLyrics,
    isShuffle,
    repeatMode,
    toggleShuffle,
    setRepeatMode,
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
  const [isLiked, setIsLiked] = React.useState(false);

  // YouTube action sheet and custom link edit state
  const [youtubeUrl, setYoutubeUrl] = React.useState<string>('');
  const [isActionModalVisible, setIsActionModalVisible] = React.useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = React.useState(false);
  const [customLinkInput, setCustomLinkInput] = React.useState('');
  const [isUpdatingAudio, setIsUpdatingAudio] = React.useState(false);

  const lyricsListRef = React.useRef<FlatList>(null);
  const lyricScrollRetriedRef = React.useRef(false);
  const shouldScrollLyricsOnOpenRef = React.useRef(false);
  const currentTrackRef = React.useRef(currentTrack);
  const youtubeTrackKeyRef = React.useRef('');
  const draftLyricSegmentsRef = React.useRef<LyricSegment[]>([]);
  const resumeAfterLyricEditRef = React.useRef(false);
  const currentTrackKey = getTrackKey(currentTrack);

  const artistLinks = React.useMemo(() => {
    if (!currentTrack) return [];
    if (currentTrack.artists?.length) return currentTrack.artists;
    return currentTrack.artistName
      .split(/\s*(?:,|&| feat\.?)\s*/i)
      .filter(Boolean)
      .map((name) => ({ id: '', name: name.trim() }));
  }, [currentTrack]);

  const handleArtistPress = React.useCallback(
    async (artistId: string, artistName: string) => {
      const targetArtistId =
        artistId ||
        (await findArtistIdByName(artistName)) ||
        `local_artist_${encodeURIComponent(artistName)}`;
      const section = segments.join('/').includes('library')
        ? 'library'
        : 'home';
      router.push(`/(tabs)/${section}/artist/${targetArtistId}` as Href);
      requestAnimationFrame(onClose);
    },
    [onClose, router, segments]
  );

  React.useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  // Reset first so an old link can never open while next track resolves.
  React.useEffect(() => {
    if (!currentTrack) {
      setYoutubeUrl('');
      youtubeTrackKeyRef.current = '';
      return;
    }

    youtubeTrackKeyRef.current = currentTrackKey;
    const exactTrackUrl = getTrackYouTubeUrl(currentTrack);
    setYoutubeUrl(exactTrackUrl);
    if (exactTrackUrl) return;

    let isMounted = true;
    if (!MUSIC_SERVER_URL) return;
    fetch(`${MUSIC_SERVER_URL}/api/music/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: currentTrack.title,
        artist: currentTrack.artistName,
        durationMs: currentTrack.duration_ms,
        spotifyId: currentTrack.spotifyId,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (isMounted) {
          if (/^[A-Za-z0-9_-]{11}$/.test(data.source?.id || '')) {
            setYoutubeUrl(`https://www.youtube.com/watch?v=${data.source.id}`);
          } else {
            const resolvedUrl = getExactYouTubeUrl(data.playback?.url);
            if (resolvedUrl) setYoutubeUrl(resolvedUrl);
          }
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [
    currentTrack?.artistName,
    currentTrack?.duration_ms,
    currentTrack?.spotifyId,
    currentTrack?.title,
    currentTrack?.youtubeUrl,
    currentTrackKey,
  ]);

  const lyricDurationMs =
    playerState.durationMs > 0
      ? playerState.durationMs
      : currentTrack?.duration_ms || 0;
  const displayedLyricSegments = isLyricsEditing
    ? draftLyricSegments
    : lyricsData?.segments || [];
  const lyricTimelineDurationMs = Math.max(
    lyricDurationMs,
    getLastSegmentEndMs(displayedLyricSegments)
  );
  const lyricTimeline = React.useMemo(
    () =>
      getLyricTimelineBlocks(displayedLyricSegments, lyricTimelineDurationMs),
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
          message: 'Origem oficial do áudio no YouTube',
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
    const activeYoutubeUrl =
      getTrackYouTubeUrl(currentTrack) ||
      (youtubeTrackKeyRef.current === currentTrackKey ? youtubeUrl : '');
    if (!getExactYouTubeUrl(activeYoutubeUrl)) {
      Alert.alert(
        'Vídeo indisponível',
        'Ainda não foi possível confirmar o vídeo oficial desta música.'
      );
      return;
    }
    Linking.openURL(activeYoutubeUrl).catch(() => {});
  };

  const handleOpenEditLinkModal = () => {
    Haptics.selectionAsync().catch(() => {});
    setIsActionModalVisible(false);
    const activeYoutubeUrl =
      getTrackYouTubeUrl(currentTrack) ||
      (youtubeTrackKeyRef.current === currentTrackKey ? youtubeUrl : '');
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
      if (!MUSIC_SERVER_URL) throw new Error('Music server unavailable');
      const response = await fetch(`${MUSIC_SERVER_URL}/api/music/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl }),
      });
      if (!response.ok) throw new Error('Could not resolve YouTube track');

      const data = (await response.json()) as {
        track?: {
          videoId: string;
          youtubeUrl: string;
          streamUrl: string;
          title: string;
          artistName: string;
          albumName: string;
          imageURL: string;
          duration_ms: number;
        };
      };
      const track = data.track;
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
        youtubeUrl: track.youtubeUrl,
      };
      setYoutubeUrl(track.youtubeUrl);
      youtubeTrackKeyRef.current = getTrackKey(nextTrack);
      await playTrack(nextTrack, { setQueue: false });
      setIsEditModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {}
      );
    } catch {
      Alert.alert(
        'Não foi possível atualizar',
        'Verifique o link e tente novamente.'
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

  const handleToggleRepeat = () => {
    const nextMode =
      repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    setRepeatMode(nextMode);
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
        ? moveLyricSegment(
            segments,
            selectedLyricTarget.index,
            deltaMs
          )
        : moveLyricGap(
            segments,
            selectedLyricTarget.target,
            deltaMs
          )
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
        ? resizeLyricSegmentEnd(
            segments,
            selectedLyricTarget.index,
            deltaMs
          )
        : resizeLyricGapEnd(
            segments,
            selectedLyricTarget.target,
            deltaMs
          )
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

  const canGoPrevious =
    queue.length > 1 && (isShuffle || repeatMode === 'all' || queueIndex > 0);
  const canGoNext =
    queue.length > 1 &&
    (isShuffle || repeatMode === 'all' || queueIndex < queue.length - 1);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {currentTrack.imageURL ? (
          <Image
            source={{ uri: currentTrack.imageURL }}
            style={styles.backgroundCover}
            blurRadius={28}
            resizeMode="cover"
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
            <Text style={styles.headerFrom}>OPENFY MUSIC</Text>
            <Text style={styles.headerContext} numberOfLines={1}>
              {currentTrack.albumName || 'Reproduzindo'}
            </Text>
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
                ref={lyricsListRef}
                data={lyricTimeline}
                extraData={`${activeLineIndex}:${isLyricsEditing}:${JSON.stringify(selectedLyricTarget)}`}
                keyExtractor={(item) =>
                  item.kind === 'gap'
                    ? item.id
                    : `lyric_${item.startTimeMs}_${item.index}`
                }
                initialScrollIndex={Math.max(0, activeLineIndex)}
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
          /* =========================================================
           * STANDARD ALBUM ART & TRACK INFO VIEW
           * ========================================================= */
          <View style={styles.mainPlayerSection}>
            {/* Floating Cover Art */}
            <View style={styles.coverContainer}>
              {currentTrack.imageURL ? (
                <Image
                  source={{ uri: currentTrack.imageURL }}
                  style={styles.cover}
                />
              ) : (
                <View style={[styles.cover, styles.coverFallback]}>
                  <Ionicons name="musical-note" size={80} color="#888" />
                </View>
              )}
            </View>

            {/* Track Info (Title & Artist) */}
            <View style={styles.trackInfoSection}>
              <MarqueeText
                text={currentTrack.title}
                style={styles.trackTitle}
                containerStyle={styles.trackTitleMarquee}
                align="center"
                fadeWidth={16}
              />
              <View style={styles.trackArtistLinks}>
                {artistLinks.map((artist, index) => (
                  <LoggedPressable
                    key={`${artist.id}-${artist.name}`}
                    accessibilityLabel={`Abrir artista ${artist.name}`}
                    onPress={() =>
                      void handleArtistPress(artist.id, artist.name)
                    }
                  >
                    <MarqueeText
                      text={`${artist.name}${index < artistLinks.length - 1 ? ' · ' : ''}`}
                      style={styles.trackArtist}
                      containerStyle={styles.trackArtistMarquee}
                      align="center"
                      fadeWidth={14}
                    />
                  </LoggedPressable>
                ))}
              </View>
            </View>
          </View>
        )}

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
            {/* =========================================================
             * MIDDLE GLASS ACTION PILL ROW (Apple Music Style)
             * ========================================================= */}
            <View style={styles.actionPillRow}>
              {/* Left Pill: Lyrics Toggle */}
              <PlayerGlassButton
                accessibilityLabel={
                  showLyricsFull
                    ? 'Fechar letras sincronizadas'
                    : 'Abrir letras sincronizadas'
                }
                onPress={toggleLyricsView}
                style={styles.circleActionBtn}
                tintColor={
                  showLyricsFull ? 'rgba(255,255,255,0.28)' : undefined
                }
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={20}
                  color={showLyricsFull ? '#FFFFFF' : 'rgba(255,255,255,0.75)'}
                />
              </PlayerGlassButton>

              {/* Center Pill: Quick Controls or Track Info */}
              {showLyricsFull ? (
                <GlassSurface
                  glass="regular"
                  isInteractive
                  style={styles.lyricsTrackPill}
                >
                  <MarqueeText
                    text={`${currentTrack.title} • ${artistLinks.map((artist) => artist.name).join(' · ')}`}
                    style={styles.lyricsTrackPillText}
                    containerStyle={styles.lyricsTrackPillMarquee}
                    align="center"
                    fadeWidth={14}
                  />
                </GlassSurface>
              ) : (
                <GlassSurface
                  glass="regular"
                  isInteractive
                  style={styles.centerActionPill}
                >
                  <LoggedPressable
                    onPress={() => setIsLiked(!isLiked)}
                    style={styles.pillSegment}
                  >
                    <Ionicons
                      name={isLiked ? 'heart' : 'heart-outline'}
                      size={19}
                      color={isLiked ? '#FF3B30' : 'rgba(255,255,255,0.8)'}
                    />
                  </LoggedPressable>

                  <View style={styles.pillDivider} />

                  <LoggedPressable
                    onPress={openLyricsView}
                    style={styles.pillSegment}
                  >
                    <Ionicons
                      name="musical-note"
                      size={19}
                      color="rgba(255,255,255,0.8)"
                    />
                  </LoggedPressable>

                  <View style={styles.pillDivider} />

                  <LoggedPressable
                    style={styles.pillSegment}
                    onPress={handleOpenYoutubeMenu}
                    accessibilityRole="button"
                    accessibilityLabel="Opções do YouTube"
                  >
                    <Ionicons
                      name="ellipsis-horizontal"
                      size={19}
                      color="rgba(255,255,255,0.8)"
                    />
                  </LoggedPressable>
                </GlassSurface>
              )}

              {/* Right Pill: YouTube Button with Clean Glass Theme */}
              <PlayerGlassButton
                accessibilityLabel="Opções do YouTube"
                onPress={handleOpenYoutubeMenu}
                style={styles.circleActionBtn}
              >
                <Ionicons
                  name="logo-youtube"
                  size={20}
                  color="rgba(255,255,255,0.85)"
                />
              </PlayerGlassButton>
            </View>

            {/* =========================================================
             * SCRUBBER & DOLBY ATMOS STATUS ROW
             * ========================================================= */}
            <View style={styles.progressContainer}>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={1}
                value={progress}
                minimumTrackTintColor="#FFFFFF"
                maximumTrackTintColor="rgba(255,255,255,0.22)"
                thumbTintColor="#FFFFFF"
                onSlidingStart={(v) => {
                  setSeeking(true);
                  setSeekValue(v);
                }}
                onValueChange={(v) => setSeekValue(v)}
                onSlidingComplete={async (v) => {
                  setSeeking(false);
                  const targetMs = v * totalDurationMs;
                  await seekToPosition(targetMs);
                }}
              />
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>
                  {formatTime(
                    seeking
                      ? seekValue * totalDurationMs
                      : playerState.positionMs
                  )}
                </Text>

                <Text style={styles.timeText}>
                  {formatTime(totalDurationMs)}
                </Text>
              </View>
            </View>
          </>
        )}

        {!isLyricsEditing ? (
          <>
            {/* =========================================================
             * BOTTOM PLAYBACK CONTROLS
             * ========================================================= */}
            <View style={styles.controlsRow}>
              {/* AirPlay / Output icon */}
              <PlayerGlassButton
                accessibilityLabel="Dispositivo de saída"
                style={styles.sideControlBtn}
              >
                <Ionicons
                  name="radio-outline"
                  size={24}
                  color="rgba(255,255,255,0.75)"
                />
              </PlayerGlassButton>

              {/* Previous Track */}
              <PlayerGlassButton
                accessibilityLabel="Faixa anterior"
                disabled={!canGoPrevious}
                onPress={playPrevious}
                style={styles.seekControlBtn}
              >
                <Ionicons
                  name="play-back"
                  size={32}
                  color={canGoPrevious ? '#FFFFFF' : 'rgba(255,255,255,0.42)'}
                />
              </PlayerGlassButton>

              {/* Primary control keeps the light Liquid Glass treatment from iOS Music. */}
              <PlayerGlassButton
                accessibilityLabel={playerState.isPlaying ? 'Pausar' : 'Tocar'}
                glass="thick"
                onPress={togglePlayPause}
                style={styles.playPauseCircle}
                tintColor="rgba(255,255,255,0.92)"
              >
                {playerState.isBuffering ? (
                  <MaterialCommunityIcons
                    name="loading"
                    size={34}
                    color="#FFFFFF"
                  />
                ) : (
                  <Ionicons
                    name={playerState.isPlaying ? 'pause' : 'play'}
                    size={34}
                    color="#FFFFFF"
                    style={
                      playerState.isPlaying ? undefined : { marginLeft: 3 }
                    }
                  />
                )}
              </PlayerGlassButton>

              {/* Next Track */}
              <PlayerGlassButton
                accessibilityLabel="Próxima faixa"
                disabled={!canGoNext}
                onPress={playNext}
                style={styles.seekControlBtn}
              >
                <Ionicons
                  name="play-forward"
                  size={32}
                  color={canGoNext ? '#FFFFFF' : 'rgba(255,255,255,0.42)'}
                />
              </PlayerGlassButton>

              {/* Shuffle / Repeat toggle */}
              <PlayerGlassButton
                accessibilityLabel="Alternar reprodução aleatória"
                onPress={toggleShuffle}
                style={styles.sideControlBtn}
              >
                <MaterialCommunityIcons
                  name="shuffle-variant"
                  size={24}
                  color={isShuffle ? '#1ED760' : 'rgba(255,255,255,0.75)'}
                />
              </PlayerGlassButton>
            </View>
          </>
        ) : null}

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
                    Origem do Áudio no YouTube
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
                  style={[styles.actionSheetItem, styles.actionSheetCancelItem]}
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
          <Pressable
            style={styles.modalOverlay}
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
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#101116',
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 12 : 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    justifyContent: 'space-between',
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
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  mainPlayerSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
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
    marginBottom: 28,
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
  trackArtist: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 17,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  trackArtistLinks: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 4,
  },
  trackArtistMarquee: { maxWidth: SCREEN_WIDTH - 64 },
  lyricsMainContainer: {
    flex: 1,
    marginVertical: 4,
    position: 'relative',
  },
  lyricsMask: { flex: 1 },
  lyricsMaskContent: { flex: 1 },
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
  centerActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
  },
  lyricsTrackPill: {
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
  lyricsTrackPillMarquee: { flex: 1 },
  pillSegment: {
    paddingHorizontal: 12,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
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
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
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
