/**
 * MusicSnippetEditorModal — 30-Second Audio Segment Mini-Editor Sheet
 *
 * Matching Instagram Music Editor (Screenshots 1 & 2):
 * - Top-right blue checkmark button (✓) (confirms snippet selection)
 * - Center: Album art, Title, Artist
 * - Timeline: (30) circle indicator on left, full-song timeline bar with active white 30s segment, Play/Pause on right
 * - Fixed Center Rainbow Box: The rainbow gradient frame remains stationary in the center, while the waveform bars scroll horizontally underneath!
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
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { usePlayer } from '@context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  onConfirmSnippet: (snippet: { startTimeMs: number; durationMs: number }) => void;
}

const SNIPPET_DURATION_MS = 30000; // 30 seconds
const TOTAL_BARS = 90;
const BAR_WIDTH = 3;
const BAR_GAP = 5;
const SINGLE_BAR_STEP = BAR_WIDTH + BAR_GAP; // 8px per bar
const WAVEFORM_TOTAL_WIDTH = TOTAL_BARS * SINGLE_BAR_STEP;

export const MusicSnippetEditorModal: React.FC<MusicSnippetEditorModalProps> = ({
  visible,
  track,
  onClose,
  onConfirmSnippet,
}) => {
  const { playerState, togglePlayPause, seekToPosition } = usePlayer();

  const totalDurationMs = track?.duration_ms || 210000;
  const maxStartMs = Math.max(0, totalDurationMs - SNIPPET_DURATION_MS);

  // Scroll offset of waveform (0 .. maxScroll)
  const maxScroll = WAVEFORM_TOTAL_WIDTH - (SCREEN_WIDTH - 80);
  const scrollAnim = React.useRef(new Animated.Value(maxScroll * 0.25)).current;
  const scrollVal = React.useRef(maxScroll * 0.25);

  const [startPercent, setStartPercent] = React.useState(0.25);

  const startTimeMs = startPercent * maxStartMs;

  // Track scroll position changes
  React.useEffect(() => {
    const id = scrollAnim.addListener(({ value }) => {
      scrollVal.current = value;
      const pct = Math.max(0, Math.min(1, value / Math.max(1, maxScroll)));
      setStartPercent(pct);
    });
    return () => scrollAnim.removeListener(id);
  }, [scrollAnim, maxScroll]);

  // Audio seek loop
  React.useEffect(() => {
    if (visible && track) {
      seekToPosition(Math.round(startTimeMs));
    }
  }, [visible, track, Math.round(startTimeMs)]);

  // PanResponder to scroll the waveform reel horizontally under the fixed center box
  const panStartVal = React.useRef(0);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panStartVal.current = scrollVal.current;
      },
      onPanResponderMove: (evt, gestureState) => {
        const nextVal = Math.max(0, Math.min(maxScroll, panStartVal.current - gestureState.dx));
        scrollAnim.setValue(nextVal);
      },
      onPanResponderRelease: () => {
        try {
          Haptics.selectionAsync();
        } catch {}
      },
    })
  ).current;

  // Generate deterministic bar heights for waveform (Hook called unconditionally)
  const trackTitleLength = track?.title?.length || 5;
  const waveformHeights = React.useMemo(() => {
    return Array.from({ length: TOTAL_BARS }, (_, i) => {
      const seed = (i * 19 + trackTitleLength * 11) % 100;
      return 12 + (seed % 30);
    });
  }, [trackTitleLength]);

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
  const activeSegmentWidthPct = Math.min(100 - activeSegmentLeftPct, (SNIPPET_DURATION_MS / totalDurationMs) * 100);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={S.overlay} onPress={onClose}>
        <Pressable style={S.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Drag Handle */}
          <View style={S.handle} />

          {/* Top Bar: Blue Checkmark Button on Right (No "Música nova" button) */}
          <View style={S.topBar}>
            <View style={{ width: 38 }} />
            <TouchableOpacity style={S.confirmBtn} activeOpacity={0.85} onPress={handleConfirm}>
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Center Cover Art */}
          <View style={S.coverContainer}>
            <Image source={{ uri: imageUri }} style={S.coverImage} />
          </View>

          {/* Title & Artist */}
          <View style={S.titleContainer}>
            <Text style={S.trackTitle} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={S.trackArtist} numberOfLines={1}>
              {track.artistName}
            </Text>
          </View>

          {/* Timeline Row (Screenshot 1) */}
          <View style={S.timelineRow}>
            {/* 30s Circle Indicator */}
            <View style={S.durationBadge}>
              <Text style={S.durationBadgeText}>30</Text>
            </View>

            {/* Timeline Line with White Segment representing current 30s position */}
            <View style={S.progressLineContainer}>
              <View style={S.progressLineBg}>
                {/* Active 30s white segment */}
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

            {/* Play/Pause Button */}
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
                style={!playerState.isPlaying ? { marginLeft: 2 } : undefined}
              />
            </TouchableOpacity>
          </View>

          {/* Waveform Scrubber: Waveform scrolls underneath the FIXED center rainbow box (Screenshot 2) */}
          <View style={S.waveformContainer} {...panResponder.panHandlers}>
            {/* Scrolling Waveform Reel */}
            <Animated.View
              style={[
                S.waveformReel,
                {
                  transform: [{ translateX: Animated.multiply(scrollAnim, -1) }],
                },
              ]}
            >
              {waveformHeights.map((h, i) => (
                <View key={i} style={[S.waveformBar, { height: h }]} />
              ))}
            </Animated.View>

            {/* FIXED CENTER Rainbow Gradient Selection Frame */}
            <View style={S.fixedCenterRainbowFrame} pointerEvents="none">
              <LinearGradient
                colors={['#FF512F', '#DD2476', '#8E2DE2', '#4A00E0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={S.rainbowGradientBorder}
              >
                <View style={S.rainbowInnerOverlay} />
              </LinearGradient>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const S = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
    marginBottom: 16,
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
  coverContainer: {
    marginVertical: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  coverImage: {
    width: 86,
    height: 86,
    borderRadius: 12,
    backgroundColor: '#2C2C2E',
  },
  titleContainer: {
    alignItems: 'center',
    marginVertical: 10,
    paddingHorizontal: 20,
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
    marginTop: 3,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 14,
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
    width: SCREEN_WIDTH - 44,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  waveformReel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
    paddingLeft: (SCREEN_WIDTH - 44) / 2 - 45,
    paddingRight: (SCREEN_WIDTH - 44) / 2 + 45,
  },
  waveformBar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  fixedCenterRainbowFrame: {
    position: 'absolute',
    width: 90,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  rainbowGradientBorder: {
    width: '100%',
    height: '100%',
    padding: 3,
    borderRadius: 12,
  },
  rainbowInnerOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
