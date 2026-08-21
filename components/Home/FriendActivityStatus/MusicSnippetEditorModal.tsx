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
  Dimensions,
  Image,
  Modal,
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
import { MusicTimelineSelector } from './MusicTimelineSelector';
import { MusicWaveformReel } from './MusicWaveformReel';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  const shouldResumeAfterDrag = React.useRef(false);
  const isScrubbingRef = React.useRef(false);
  const playerIsPlayingRef = React.useRef(playerState.isPlaying);
  const playerActions = React.useRef({ togglePlayPause, seekToPosition });
  playerIsPlayingRef.current = playerState.isPlaying;
  playerActions.current = { togglePlayPause, seekToPosition };

  const [startTimeMs, setStartTimeMs] = React.useState(0);
  const [isScrubbing, setIsScrubbing] = React.useState(false);
  const [isWaveformScrubbing, setIsWaveformScrubbing] = React.useState(false);
  const startTimeMsRef = React.useRef(0);

  const beginScrubbing = React.useCallback(() => {
    if (isScrubbingRef.current) return;

    isScrubbingRef.current = true;
    setIsScrubbing(true);
    shouldResumeAfterDrag.current = playerIsPlayingRef.current;
    if (shouldResumeAfterDrag.current) {
      playerActions.current.togglePlayPause();
    }
  }, []);

  const endScrubbing = React.useCallback(() => {
    if (!isScrubbingRef.current) return;

    isScrubbingRef.current = false;
    setIsScrubbing(false);
    playerActions.current.seekToPosition(startTimeMsRef.current);
    if (shouldResumeAfterDrag.current) {
      playerActions.current.togglePlayPause();
    }
    shouldResumeAfterDrag.current = false;
  }, []);

  // Reset scroll position to 0 whenever a new track or modal opens
  React.useEffect(() => {
    if (visible && track) {
      startTimeMsRef.current = 0;
      setStartTimeMs(0);
    }
  }, [visible, track?.spotifyId, track?.title]);

  const setSnippetStart = React.useCallback(
    (requestedStartMs: number) => {
      const nextStartMs = Math.round(
        Math.max(0, Math.min(requestedStartMs, maxStartMs))
      );
      startTimeMsRef.current = nextStartMs;
      setStartTimeMs(nextStartMs);
      return nextStartMs;
    },
    [maxStartMs]
  );

  const handleLyricSeek = React.useCallback(
    (positionMs: number) => {
      const nextStartMs = setSnippetStart(positionMs);
      seekToPosition(nextStartMs);
    },
    [seekToPosition, setSnippetStart]
  );

  // Sync audio seek position after any scrub ends.
  React.useEffect(() => {
    if (visible && track && !isScrubbing) {
      seekToPosition(Math.round(startTimeMs));
    }
  }, [visible, track, isScrubbing, Math.round(startTimeMs)]);

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
            <View style={[S.backgroundScrim, { pointerEvents: 'none' }]} />

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

              <MusicTimelineSelector
                isPlaying={playerState.isPlaying}
                onTogglePlayPause={() => void togglePlayPause()}
                startTimeMs={startTimeMs}
                totalDurationMs={totalDurationMs}
              />

              <MusicWaveformReel
                onMoveToStart={setSnippetStart}
                onScrubEnd={() => {
                  setIsWaveformScrubbing(false);
                  endScrubbing();
                }}
                onScrubStart={() => {
                  setIsWaveformScrubbing(true);
                  beginScrubbing();
                }}
                seed={track.title}
                selectionDurationMs={SNIPPET_DURATION_MS}
                selectionStartMs={startTimeMs}
                totalDurationMs={totalDurationMs}
              />
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
});
