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
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppIcon as Ionicons } from "../../native/AppIcon";
import * as Haptics from 'expo-haptics';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { usePlayer } from '@context';
import { NoteLyricBlocks } from './NoteLyricLine';
import { MusicTimelineSelector } from './MusicTimelineSelector';
import { MusicWaveformReel } from './MusicWaveformReel';
import { GlassSurface, SheetFrame } from '../../native';

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
    '';

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
    <SheetFrame visible={visible} title={track.title} onClose={onClose}
      artworkURL={imageUri} scroll={false} contentHeight={220 + Math.min(3, lyricSegments.length) * 100}
      headerTrailing={<TouchableOpacity accessibilityRole="button" accessibilityLabel="Confirmar trecho" onPress={handleConfirm}>
        <GlassSurface glass="regular" isInteractive style={S.confirmBtn}>
          <Ionicons name="checkmark" size={20} color="#FFFFFF" />
        </GlassSurface>
      </TouchableOpacity>}>
      <GestureHandlerRootView style={S.gestureHandlerRoot}>
            <View style={S.content}>
                  <Text style={S.trackArtist} numberOfLines={1}>
                    {track.artistName}
                  </Text>

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
      </GestureHandlerRootView>
    </SheetFrame>
  );
};

const S = StyleSheet.create({
  gestureHandlerRoot: {
    flex: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  overlay: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#101116',
    flex: 1,
    minHeight: 0,
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
    paddingHorizontal: 0,
    paddingTop: 12,
    paddingBottom: 12,
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
    alignItems: 'center',
    justifyContent: 'center',
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
