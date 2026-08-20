/**
 * MusicSnippetEditorModal — 30-Second Audio Segment Mini-Editor Sheet
 *
 * Matching Screenshot 3:
 * - Top-left pill button "Música nova" (opens music search)
 * - Top-right blue checkmark button (✓) (confirms snippet selection)
 * - Center: Album art, Title, Artist
 * - Timeline: (30) duration circle on left, progress bar line, Play/Pause button on right
 * - Waveform Scrubber: Rainbow gradient sliding selection box over waveform bars to pick exact 30s portion
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
  onChangeMusic: () => void;
  onConfirmSnippet: (snippet: { startTimeMs: number; durationMs: number }) => void;
}

const SNIPPET_DURATION_MS = 30000; // 30 seconds
const WAVEFORM_BAR_COUNT = 36;

export const MusicSnippetEditorModal: React.FC<MusicSnippetEditorModalProps> = ({
  visible,
  track,
  onClose,
  onChangeMusic,
  onConfirmSnippet,
}) => {
  const { playerState, togglePlayPause, seekToPosition, playTrack } = usePlayer();

  const totalDurationMs = track?.duration_ms || 210000;
  const maxStartMs = Math.max(0, totalDurationMs - SNIPPET_DURATION_MS);

  // Position percentage (0..1) of snippet start
  const [startPercent, setStartPercent] = React.useState(0.2); // default ~20% into track

  const waveformWidth = SCREEN_WIDTH - 60;
  const windowWidth = 90; // width of the rainbow box

  // Synchronize audio playback loop within 30s snippet window
  const startTimeMs = startPercent * maxStartMs;

  React.useEffect(() => {
    if (visible && track) {
      // Seek to current snippet start time
      seekToPosition(Math.round(startTimeMs));
    }
  }, [visible, track, startPercent]);

  // PanResponder for smooth waveform scrubbing
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        const touchX = Math.max(0, Math.min(waveformWidth, gestureState.x0 + gestureState.dx - 30));
        const pct = Math.max(0, Math.min(1, touchX / (waveformWidth - windowWidth)));
        setStartPercent(pct);
      },
      onPanResponderRelease: () => {
        try {
          Haptics.selectionAsync();
        } catch {}
      },
    })
  ).current;

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

  // Generate deterministic bar heights for waveform
  const waveformHeights = React.useMemo(() => {
    return Array.from({ length: WAVEFORM_BAR_COUNT }, (_, i) => {
      const seed = (i * 17 + (track.title.length || 5) * 7) % 100;
      return 12 + (seed % 28);
    });
  }, [track]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={S.overlay} onPress={onClose}>
        <Pressable style={S.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Drag Handle */}
          <View style={S.handle} />

          {/* Top Bar: "Música nova" button on Left, Blue Checkmark button on Right */}
          <View style={S.topBar}>
            <TouchableOpacity style={S.changeMusicBtn} activeOpacity={0.8} onPress={onChangeMusic}>
              <Text style={S.changeMusicText}>Música nova</Text>
            </TouchableOpacity>

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

          {/* Timeline Row */}
          <View style={S.timelineRow}>
            {/* 30s Circle Indicator */}
            <View style={S.durationBadge}>
              <Text style={S.durationBadgeText}>30</Text>
            </View>

            {/* Progress Bar Line */}
            <View style={S.progressLineContainer}>
              <View style={S.progressLineBg}>
                <View
                  style={[
                    S.progressLineFill,
                    { width: `${startPercent * 100}%` },
                  ]}
                />
                <View style={S.progressDot} />
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

          {/* Waveform Audio Scrubber with Sliding Rainbow Box */}
          <View style={S.waveformArea} {...panResponder.panHandlers}>
            {/* Waveform bars */}
            <View style={S.waveformBarsRow}>
              {waveformHeights.map((h, i) => (
                <View key={i} style={[S.waveformBar, { height: h }]} />
              ))}
            </View>

            {/* Rainbow Gradient Selection Window Box */}
            <View
              style={[
                S.rainbowWindow,
                {
                  left: startPercent * (waveformWidth - windowWidth),
                  width: windowWidth,
                },
              ]}
            >
              <LinearGradient
                colors={['#FF512F', '#DD2476', '#8E2DE2', '#4A00E0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={S.rainbowGradientBorder}
              >
                <View style={S.rainbowInnerBox}>
                  {/* Inner waveform sample bars inside selection frame */}
                  {waveformHeights.slice(10, 20).map((h, idx) => (
                    <View key={idx} style={[S.rainbowBar, { height: Math.min(30, h + 4) }]} />
                  ))}
                </View>
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
    paddingBottom: 40,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#48484A',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  changeMusicBtn: {
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  changeMusicText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '600',
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
    marginVertical: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  coverImage: {
    width: 90,
    height: 90,
    borderRadius: 12,
    backgroundColor: '#2C2C2E',
  },
  titleContainer: {
    alignItems: 'center',
    marginVertical: 12,
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
    marginVertical: 16,
    paddingHorizontal: 6,
    gap: 12,
  },
  durationBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 1.5,
    position: 'relative',
    justifyContent: 'center',
  },
  progressLineFill: {
    height: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 1.5,
  },
  progressDot: {
    position: 'absolute',
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformArea: {
    width: SCREEN_WIDTH - 44,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    position: 'relative',
  },
  waveformBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: '100%',
    paddingHorizontal: 4,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  rainbowWindow: {
    position: 'absolute',
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
  },
  rainbowGradientBorder: {
    width: '100%',
    height: '100%',
    padding: 3,
    borderRadius: 12,
  },
  rainbowInnerBox: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
  },
  rainbowBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: '#FFFFFF',
  },
});
