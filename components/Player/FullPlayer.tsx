/**
 * FullPlayer Component — Apple Music & Liquid Glass Design System
 * Matches the official iOS Apple Music player and synced lyrics experience.
 * Includes Dolby Atmos spatial audio badge, glass action pills,
 * glowing karaoke synced lyrics, and native haptic feedback.
 */

import * as React from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Dimensions,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { usePlayer } from '@context';
import { fetchLyrics, LyricsData, LyricSegment } from '@services';
import { getDynamicColorPalette } from '@utils';
import { GlassSurface, LoggedPressable } from '../native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const COVER_SIZE = Math.min(SCREEN_WIDTH - 64, 340);

type FullPlayerProps = {
  visible: boolean;
  onClose: () => void;
};

const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const FullPlayer = ({ visible, onClose }: FullPlayerProps) => {
  const {
    currentTrack,
    playerState,
    togglePlayPause,
    seekToPosition,
    playNext,
    playPrevious,
    queue,
  } = usePlayer();

  const [seeking, setSeeking] = React.useState(false);
  const [seekValue, setSeekValue] = React.useState(0);
  const [isShuffle, setIsShuffle] = React.useState(false);
  const [repeatMode, setRepeatMode] = React.useState<'off' | 'all' | 'one'>('off');
  const [showLyricsFull, setShowLyricsFull] = React.useState(false);
  const [isLiked, setIsLiked] = React.useState(false);
  const [lyricsData, setLyricsData] = React.useState<LyricsData | null>(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = React.useState(false);

  const lyricsListRef = React.useRef<FlatList>(null);

  // Dynamic ambient color palette based on track
  const palette = React.useMemo(() => {
    if (!currentTrack)
      return { primary: '#1e3a8a', secondary: '#0f172a', accent: '#38bdf8' };
    return getDynamicColorPalette(
      `${currentTrack.artistName} - ${currentTrack.title}`
    );
  }, [currentTrack]);

  // Fetch lyrics when track changes
  React.useEffect(() => {
    if (!currentTrack) {
      setLyricsData(null);
      return;
    }

    let isMounted = true;
    setIsLoadingLyrics(true);

    fetchLyrics(
      currentTrack.title,
      currentTrack.artistName,
      currentTrack.duration_ms ? currentTrack.duration_ms / 1000 : undefined
    )
      .then((data) => {
        if (isMounted) {
          setLyricsData(data);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingLyrics(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentTrack]);

  // Determine current active lyric segment index
  const activeLineIndex = React.useMemo(() => {
    if (!lyricsData || !lyricsData.segments || lyricsData.segments.length === 0)
      return -1;
    const currentMs = playerState.positionMs;

    const activeSeg = lyricsData.segments.find(
      (seg) => currentMs >= seg.startTimeMs && currentMs < seg.endTimeMs
    );

    if (activeSeg) return activeSeg.index;

    const lastSeg = lyricsData.segments[lyricsData.segments.length - 1];
    if (currentMs >= lastSeg.startTimeMs) return lastSeg.index;

    return 0;
  }, [lyricsData, playerState.positionMs]);

  // Auto-scroll lyrics to active line
  React.useEffect(() => {
    if (
      showLyricsFull &&
      activeLineIndex >= 0 &&
      lyricsListRef.current &&
      lyricsData?.segments &&
      activeLineIndex < lyricsData.segments.length
    ) {
      try {
        lyricsListRef.current.scrollToIndex({
          index: activeLineIndex,
          animated: true,
          viewPosition: 0.35,
        });
      } catch {}
    }
  }, [activeLineIndex, showLyricsFull, lyricsData]);

  if (!currentTrack) return null;

  const progress =
    !seeking && playerState.durationMs > 0
      ? playerState.positionMs / playerState.durationMs
      : seekValue;

  const handleToggleRepeat = () => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  };

  const handleLyricPress = async (seg: LyricSegment) => {
    await seekToPosition(seg.startTimeMs);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <LinearGradient
        colors={[palette.primary, palette.secondary, '#0a0d14']}
        locations={[0, 0.45, 1.0]}
        style={styles.container}
      >
        {/* Grab Handle Header */}
        <View style={styles.topGrabRow}>
          <View style={styles.grabBar} />
        </View>

        {/* Top Navigation Bar */}
        <View style={styles.header}>
          <LoggedPressable onPress={onClose} style={styles.headerIconButton}>
            <Ionicons name="chevron-down" size={26} color="#FFFFFF" />
          </LoggedPressable>
          <View style={styles.headerInfo}>
            <Text style={styles.headerFrom}>OPENFY MUSIC</Text>
            <Text style={styles.headerContext} numberOfLines={1}>
              {currentTrack.albumName || 'Reproduzindo'}
            </Text>
          </View>
          <LoggedPressable
            onPress={() => setShowLyricsFull(!showLyricsFull)}
            style={[
              styles.headerIconButton,
              showLyricsFull && styles.headerIconButtonActive,
            ]}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={22}
              color={showLyricsFull ? '#FFFFFF' : 'rgba(255,255,255,0.7)'}
            />
          </LoggedPressable>
        </View>

        {showLyricsFull ? (
          /* =========================================================
           * FULL SCREEN APPLE MUSIC SYNCED LYRICS VIEW
           * ========================================================= */
          <View style={styles.lyricsMainContainer}>
            {lyricsData && lyricsData.isSynced && lyricsData.segments.length > 0 ? (
              <FlatList
                ref={lyricsListRef}
                data={lyricsData.segments}
                keyExtractor={(item) => `${item.startTimeMs}_${item.index}`}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.lyricsScrollContent}
                onScrollToIndexFailed={() => {}}
                renderItem={({ item, index }) => {
                  const isActive = index === activeLineIndex;
                  return (
                    <Pressable
                      onPress={() => handleLyricPress(item)}
                      style={[
                        styles.lyricLineButton,
                        isActive && styles.lyricLineActiveButton,
                      ]}
                    >
                      <Text
                        style={[
                          styles.lyricText,
                          isActive
                            ? styles.lyricTextActive
                            : styles.lyricTextInactive,
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
          </View>
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
              <Text style={styles.trackTitle} numberOfLines={1}>
                {currentTrack.title}
              </Text>
              <Text style={styles.trackArtist} numberOfLines={1}>
                {currentTrack.artistName}
              </Text>
            </View>
          </View>
        )}

        {/* =========================================================
         * MIDDLE GLASS ACTION PILL ROW (Apple Music Style)
         * ========================================================= */}
        <View style={styles.actionPillRow}>
          {/* Left Pill: Lyrics Toggle */}
          <LoggedPressable
            onPress={() => setShowLyricsFull(!showLyricsFull)}
            style={[
              styles.circleActionBtn,
              showLyricsFull && styles.circleActionBtnActive,
            ]}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={20}
              color={showLyricsFull ? '#FFFFFF' : 'rgba(255,255,255,0.75)'}
            />
          </LoggedPressable>

          {/* Center Pill: Quick Controls or Track Info */}
          {showLyricsFull ? (
            <GlassSurface glass="regular" style={styles.lyricsTrackPill}>
              <Text style={styles.lyricsTrackPillText} numberOfLines={1}>
                {currentTrack.title} • {currentTrack.artistName}
              </Text>
            </GlassSurface>
          ) : (
            <GlassSurface glass="regular" style={styles.centerActionPill}>
              <LoggedPressable
                onPress={() => setIsLiked(!isLiked)}
                style={styles.pillSegment}
              >
                <Ionicons
                  name={isLiked ? 'star' : 'star-outline'}
                  size={19}
                  color={isLiked ? '#FFD700' : 'rgba(255,255,255,0.8)'}
                />
              </LoggedPressable>

              <View style={styles.pillDivider} />

              <LoggedPressable
                onPress={() => setShowLyricsFull(true)}
                style={styles.pillSegment}
              >
                <Ionicons
                  name="musical-note"
                  size={19}
                  color="rgba(255,255,255,0.8)"
                />
              </LoggedPressable>

              <View style={styles.pillDivider} />

              <LoggedPressable style={styles.pillSegment}>
                <Ionicons
                  name="ellipsis-horizontal"
                  size={19}
                  color="rgba(255,255,255,0.8)"
                />
              </LoggedPressable>
            </GlassSurface>
          )}

          {/* Right Pill: Queue / List */}
          <LoggedPressable style={styles.circleActionBtn}>
            <Ionicons
              name="list"
              size={20}
              color="rgba(255,255,255,0.75)"
            />
          </LoggedPressable>
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
              const targetMs = v * playerState.durationMs;
              await seekToPosition(targetMs);
            }}
          />
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>
              {formatTime(
                seeking
                  ? seekValue * playerState.durationMs
                  : playerState.positionMs
              )}
            </Text>

            {/* Spatial Audio Badge */}
            <View style={styles.dolbyBadge}>
              <FontAwesome6 name="tower-broadcast" size={11} color="rgba(255,255,255,0.65)" />
              <Text style={styles.dolbyBadgeText}>Dolby Atmos</Text>
            </View>

            <Text style={styles.timeText}>
              {formatTime(playerState.durationMs)}
            </Text>
          </View>
        </View>

        {/* =========================================================
         * BOTTOM PLAYBACK CONTROLS
         * ========================================================= */}
        <View style={styles.controlsRow}>
          {/* AirPlay / Output icon */}
          <LoggedPressable style={styles.sideControlBtn}>
            <Ionicons
              name="radio-outline"
              size={24}
              color="rgba(255,255,255,0.75)"
            />
          </LoggedPressable>

          {/* Previous Track */}
          <LoggedPressable
            onPress={playPrevious}
            style={styles.seekControlBtn}
          >
            <Ionicons name="play-back" size={32} color="#FFFFFF" />
          </LoggedPressable>

          {/* Solid White Play/Pause Button */}
          <LoggedPressable
            onPress={togglePlayPause}
            style={styles.playPauseCircle}
          >
            {playerState.isBuffering ? (
              <MaterialCommunityIcons
                name="loading"
                size={34}
                color="#000000"
              />
            ) : (
              <Ionicons
                name={playerState.isPlaying ? 'pause' : 'play'}
                size={34}
                color="#000000"
                style={playerState.isPlaying ? undefined : { marginLeft: 3 }}
              />
            )}
          </LoggedPressable>

          {/* Next Track */}
          <LoggedPressable
            onPress={playNext}
            style={styles.seekControlBtn}
          >
            <Ionicons name="play-forward" size={32} color="#FFFFFF" />
          </LoggedPressable>

          {/* Shuffle / Repeat toggle */}
          <LoggedPressable
            onPress={() => setIsShuffle(!isShuffle)}
            style={styles.sideControlBtn}
          >
            <MaterialCommunityIcons
              name="shuffle-variant"
              size={24}
              color={isShuffle ? palette.accent : 'rgba(255,255,255,0.75)'}
            />
          </LoggedPressable>
        </View>
      </LinearGradient>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 12 : 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    justifyContent: 'space-between',
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
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.35)',
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
  trackArtist: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 17,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  lyricsMainContainer: {
    flex: 1,
    marginVertical: 8,
  },
  lyricsScrollContent: {
    paddingVertical: 40,
    paddingHorizontal: 8,
  },
  lyricLineButton: {
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  lyricLineActiveButton: {
    transform: [{ scale: 1.02 }],
  },
  lyricText: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.2,
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
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActionBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  centerActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  lyricsTrackPill: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: SCREEN_WIDTH - 150,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  lyricsTrackPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
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
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
});
