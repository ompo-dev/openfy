/**
 * MusicSnippetEditorModal — 30-Second Audio Segment Mini-Editor Sheet
 *
 * Matching Instagram Music Editor (Screenshots 1 & 2):
 * - Top-right blue checkmark button (✓) (confirms snippet selection)
 * - Blurred album art background, title and artist at top, lyric centered.
 * - Timeline: (30) circle indicator on left, full-song timeline bar with active white 30s segment, Play/Pause on right
 * - Fixed Center White Border Frame:
 *   - Crisp 3.5px white border frame with 0% background fill (completely transparent)
 *   - Mathematically exact 1:1 waveform scaling:
 *     - At 0:00 (start), Bar 0 aligns precisely at the LEFT edge of the 90px box.
 *     - At track end (100%), the last bar aligns precisely at the RIGHT edge of the 90px box.
 *   - Pauses audio playback when user starts dragging, seeks and resumes when released!
 */

import * as React from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { usePlayer } from '@context';
import { NoteLyricBlocks } from './NoteLyricLine';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface DownloadedTrack {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName?: string;
  imageURL?: string;
  localImagePath?: string;
  duration_ms?: number;
}

interface MusicSnippetEditorModalProps {
  visible: boolean;
  track: DownloadedTrack | null;
  onClose: () => void;
  onChangeMusic?: () => void;
  onConfirmSnippet: (snippet: {
    startTimeMs: number;
    durationMs: number;
  }) => void;
}

const SNIPPET_DURATION_MS = 30000; // 30 seconds
const BAR_WIDTH = 3;
const BAR_GAP = 5;
const FRAME_WIDTH = 90; // 90px width of the center selection box
const FRAME_BORDER_WIDTH = 3.5;
const CONTAINER_WIDTH = SCREEN_WIDTH - 44;
const CENTER_RESPIRO_OFFSET = (CONTAINER_WIDTH - FRAME_WIDTH) / 2;
const EDITOR_HEIGHT = Math.min(500, SCREEN_HEIGHT - 24);

export const MusicSnippetEditorModal: React.FC<
  MusicSnippetEditorModalProps
> = ({ visible, track, onClose, onConfirmSnippet }) => {
  const {
    playerState,
    currentTrack,
    togglePlayPause,
    seekToPosition,
    lyricsData,
  } = usePlayer();

  const totalDurationMs = track?.duration_ms || 210000;
  const maxStartMs = Math.max(0, totalDurationMs - SNIPPET_DURATION_MS);

  // 1. Calculate total bars and actual rendered waveform pixel width
  const durationSec = Math.max(30, totalDurationMs / 1000);
  const barsPerSecond = 12 / 30; // 12 bars per 30 seconds
  const totalBars = Math.max(12, Math.round(durationSec * barsPerSecond));
  const actualRenderedWidth = totalBars * BAR_WIDTH + (totalBars - 1) * BAR_GAP;

  // 2. At the end, final waveform bar aligns with the frame's right edge.
  const maxScroll = Math.max(1, actualRenderedWidth - FRAME_WIDTH);

  const scrollAnim = React.useRef(new Animated.Value(0)).current;
  const scrollVal = React.useRef(0);
  const shouldResumeAfterDrag = React.useRef(false);
  const isScrubbingRef = React.useRef(false);
  const interactionValues = React.useRef({
    maxScroll,
    maxStartMs,
    isPlaying: playerState.isPlaying,
  });
  const playerActions = React.useRef({ togglePlayPause, seekToPosition });

  interactionValues.current = {
    maxScroll,
    maxStartMs,
    isPlaying: playerState.isPlaying,
  };
  playerActions.current = { togglePlayPause, seekToPosition };

  const [startPercent, setStartPercent] = React.useState(0);
  const [isScrubbing, setIsScrubbing] = React.useState(false);
  const [isWaveformScrubbing, setIsWaveformScrubbing] = React.useState(false);

  const beginScrubbing = React.useCallback(() => {
    if (isScrubbingRef.current) return;

    isScrubbingRef.current = true;
    setIsScrubbing(true);
    shouldResumeAfterDrag.current = interactionValues.current.isPlaying;
    if (shouldResumeAfterDrag.current) {
      playerActions.current.togglePlayPause();
    }
  }, []);

  const endScrubbing = React.useCallback(() => {
    if (!isScrubbingRef.current) return;

    isScrubbingRef.current = false;
    setIsScrubbing(false);
    const { maxScroll: latestMaxScroll, maxStartMs: latestMaxStartMs } =
      interactionValues.current;
    playerActions.current.seekToPosition(
      Math.round((scrollVal.current / latestMaxScroll) * latestMaxStartMs)
    );
    if (shouldResumeAfterDrag.current) {
      playerActions.current.togglePlayPause();
    }
    shouldResumeAfterDrag.current = false;
  }, []);

  // Reset scroll position to 0 whenever a new track or modal opens
  React.useEffect(() => {
    if (visible && track) {
      scrollAnim.setValue(0);
      scrollVal.current = 0;
      setStartPercent(0);
    }
  }, [visible, track?.spotifyId, track?.title, scrollAnim]);

  const startTimeMs = startPercent * maxStartMs;

  const handleLyricSeek = React.useCallback(
    (positionMs: number) => {
      const nextStartMs = Math.max(0, Math.min(positionMs, maxStartMs));
      const nextPercent = maxStartMs === 0 ? 0 : nextStartMs / maxStartMs;
      const nextScroll = nextPercent * maxScroll;

      scrollVal.current = nextScroll;
      setStartPercent(nextPercent);
      scrollAnim.setValue(nextScroll);
      seekToPosition(nextStartMs);
    },
    [maxScroll, maxStartMs, scrollAnim, seekToPosition]
  );

  // Track scroll position changes
  React.useEffect(() => {
    const id = scrollAnim.addListener(({ value }) => {
      const clamped = Math.max(0, Math.min(maxScroll, value));
      scrollVal.current = clamped;
      setStartPercent(clamped / maxScroll);
    });
    return () => scrollAnim.removeListener(id);
  }, [scrollAnim, maxScroll]);

  // Sync audio seek position after any scrub ends.
  React.useEffect(() => {
    if (visible && track && !isScrubbing) {
      seekToPosition(Math.round(startTimeMs));
    }
  }, [visible, track, isScrubbing, Math.round(startTimeMs)]);

  // PanResponder to scroll waveform reel under fixed center box
  const panStartVal = React.useRef(0);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panStartVal.current = scrollVal.current;
        setIsWaveformScrubbing(true);
        beginScrubbing();
      },
      onPanResponderMove: (evt, gestureState) => {
        const nextVal = Math.max(
          0,
          Math.min(
            interactionValues.current.maxScroll,
            panStartVal.current - gestureState.dx
          )
        );
        scrollAnim.setValue(nextVal);
      },
      onPanResponderRelease: () => {
        try {
          Haptics.selectionAsync();
        } catch {}
        setIsWaveformScrubbing(false);
        endScrubbing();
      },
      onPanResponderTerminate: () => {
        setIsWaveformScrubbing(false);
        endScrubbing();
      },
    })
  ).current;

  // Generate realistic audio peak heights for waveform (Hook called unconditionally)
  const trackTitleLength = track?.title?.length || 5;
  const waveformHeights = React.useMemo(() => {
    return Array.from({ length: totalBars }, (_, i) => {
      const pos = i / Math.max(1, totalBars);
      // Realistic song dynamics: lower intro, chorus peak, bridge, outro
      const envelope = Math.sin(pos * Math.PI) * 0.7 + 0.3;
      const seed = (i * 23 + trackTitleLength * 13) % 100;
      const baseHeight = 10 + (seed % 28);
      return Math.min(42, Math.max(8, Math.round(baseHeight * envelope * 1.2)));
    });
  }, [totalBars, trackTitleLength]);

  // Resolve active lyric only when player is on editor's selected track.
  const currentSongPositionMs =
    isScrubbing || !playerState.isPlaying || !playerState.positionMs
      ? startTimeMs
      : playerState.positionMs;

  const lyricSegments = React.useMemo(() => {
    if (currentTrack?.spotifyId !== track?.spotifyId) return [];
    return lyricsData?.segments ?? [];
  }, [currentTrack?.spotifyId, track?.spotifyId, lyricsData?.segments]);

  const activeLyricIndex = React.useMemo(() => {
    if (lyricSegments.length === 0) return 0;
    const index = lyricSegments.findIndex(
      (seg) =>
        currentSongPositionMs >= seg.startTimeMs &&
        currentSongPositionMs <= seg.endTimeMs
    );
    return index >= 0 ? index : 0;
  }, [lyricSegments, currentSongPositionMs]);

  // Unconditional hooks declared above
  if (!track) return null;

  const imageUri =
    track.localImagePath ||
    track.imageURL ||
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80';

  const handleConfirm = () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    onConfirmSnippet({
      startTimeMs: Math.round(startTimeMs),
      durationMs: SNIPPET_DURATION_MS,
    });
  };

  // Timeline segment calculations for Screenshot 1
  const activeSegmentLeftPct = (startTimeMs / totalDurationMs) * 100;
  const activeSegmentWidthPct = Math.min(
    100 - activeSegmentLeftPct,
    (SNIPPET_DURATION_MS / totalDurationMs) * 100
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={S.gestureHandlerRoot}>
        <Pressable style={S.overlay} onPress={onClose}>
          <Pressable style={S.sheet} onPress={(e) => e.stopPropagation()}>
            <Image
              source={{ uri: imageUri }}
              style={S.backgroundCover}
              blurRadius={22}
              resizeMode="cover"
            />
            <View pointerEvents="none" style={S.backgroundScrim} />

            <View style={S.content}>
              <View style={S.handle} />

              <View style={S.topBar}>
                <View style={{ width: 38 }} />
                <View style={S.topTrackInfo}>
                  <Text style={S.trackTitle} numberOfLines={1}>
                    {track.title}
                  </Text>
                  <Text style={S.trackArtist} numberOfLines={1}>
                    {track.artistName}
                  </Text>
                </View>
                <TouchableOpacity
                  style={S.confirmBtn}
                  activeOpacity={0.85}
                  onPress={handleConfirm}
                >
                  <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <NoteLyricBlocks
                segments={lyricSegments}
                activeIndex={activeLyricIndex}
                onSeek={handleLyricSeek}
                onScrubStart={beginScrubbing}
                onScrubEnd={endScrubbing}
                isTimelineScrubbing={isWaveformScrubbing}
                style={S.lyricStage}
              />

              <View style={S.timelineRow}>
                <View style={S.durationBadge}>
                  <Text style={S.durationBadgeText}>30</Text>
                </View>

                <View style={S.progressLineContainer}>
                  <View style={S.progressLineBg}>
                    <View
                      style={[
                        S.activeSnippetSegment,
                        {
                          left: `${activeSegmentLeftPct}%`,
                          width: `${activeSegmentWidthPct}%`,
                        },
                      ]}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={S.playBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    try {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    } catch {}
                    togglePlayPause();
                  }}
                >
                  <Ionicons
                    name={playerState.isPlaying ? 'pause' : 'play'}
                    size={18}
                    color="#000000"
                    style={
                      !playerState.isPlaying ? { marginLeft: 2 } : undefined
                    }
                  />
                </TouchableOpacity>
              </View>

              <View style={S.waveformContainer} {...panResponder.panHandlers}>
                <Animated.View
                  style={[
                    S.waveformReel,
                    {
                      paddingLeft: CENTER_RESPIRO_OFFSET,
                      paddingRight: CENTER_RESPIRO_OFFSET,
                      transform: [
                        { translateX: Animated.multiply(scrollAnim, -1) },
                      ],
                    },
                  ]}
                >
                  {waveformHeights.map((h, i) => (
                    <View key={i} style={[S.waveformBar, { height: h }]} />
                  ))}
                </Animated.View>

                <View style={S.fixedCenterFrame} pointerEvents="none">
                  <View style={S.selectionWaveformClip}>
                    <Animated.View
                      style={[
                        S.selectionWaveformReel,
                        {
                          left: -FRAME_BORDER_WIDTH,
                          width: actualRenderedWidth,
                          transform: [
                            { translateX: Animated.multiply(scrollAnim, -1) },
                          ],
                        },
                      ]}
                    >
                      {waveformHeights.map((height, index) => (
                        <View
                          key={index}
                          style={[S.selectionWaveformBar, { height }]}
                        />
                      ))}
                    </Animated.View>
                  </View>
                  <View style={S.centerFrameBorder} />
                </View>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
};

const S = StyleSheet.create({
  gestureHandlerRoot: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#101116',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: EDITOR_HEIGHT,
    overflow: 'hidden',
  },
  backgroundCover: {
    ...StyleSheet.absoluteFill,
    opacity: 0.64,
    transform: [{ scale: 1.1 }],
  },
  backgroundScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8, 10, 16, 0.60)',
  },
  content: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 42,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#48484A',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 4,
  },
  confirmBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#4E75FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4E75FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  topTrackInfo: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
    textAlign: 'center',
  },
  trackArtist: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13.5,
    fontFamily: 'SimplyRounded',
    textAlign: 'center',
    marginTop: 2,
  },
  lyricStage: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: 12,
    marginBottom: 0,
    paddingHorizontal: 4,
    gap: 12,
  },
  durationBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
  },
  progressLineContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  progressLineBg: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 1.5,
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  activeSnippetSegment: {
    position: 'absolute',
    height: 4.5,
    backgroundColor: '#FFFFFF',
    borderRadius: 2.25,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformContainer: {
    width: CONTAINER_WIDTH,
    height: 58,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  waveformReel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
  },
  waveformBar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    backgroundColor: '#FFFFFF',
  },
  fixedCenterFrame: {
    position: 'absolute',
    left: CENTER_RESPIRO_OFFSET,
    top: 4,
    width: FRAME_WIDTH,
    height: 50,
    zIndex: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  selectionWaveformReel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
  },
  selectionWaveformBar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    backgroundColor: '#101116',
  },
  selectionWaveformClip: {
    position: 'absolute',
    top: FRAME_BORDER_WIDTH,
    right: FRAME_BORDER_WIDTH,
    bottom: FRAME_BORDER_WIDTH,
    left: FRAME_BORDER_WIDTH,
    borderRadius: 10 - FRAME_BORDER_WIDTH,
    overflow: 'hidden',
  },
  centerFrameBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: 10,
    borderWidth: FRAME_BORDER_WIDTH,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
});
