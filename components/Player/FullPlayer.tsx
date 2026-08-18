/**
 * FullPlayer Component
 * Modern SwiftUI & Apple Music Liquid Glass aesthetic.
 * Full-screen player with dynamic backdrop gradients, floating shadow cover,
 * glassmorphic lyrics card, iOS style fluid slider, and rich playback controls.
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
} from 'react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { usePlayer } from '@context';
import { fetchLyrics, LyricsData, LyricSegment } from '@services';
import { getDynamicColorPalette } from '@utils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_SIZE = SCREEN_WIDTH - 64;

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

  // Determine current active lyric segment index [startTimeMs, endTimeMs]
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
          viewPosition: 0.4,
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
        colors={[palette.primary, palette.secondary, '#0a0a0c']}
        locations={[0, 0.5, 1.0]}
        style={styles.container}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerIconButton} hitSlop={12}>
            <Ionicons name="chevron-down" size={28} color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={styles.headerFrom}>TOCANDO DO SPOTIFY</Text>
            <Text style={styles.headerContext} numberOfLines={1}>
              {currentTrack.albumName || 'Openfy Music'}
            </Text>
          </View>
          <Pressable
            onPress={() => setShowLyricsFull(!showLyricsFull)}
            style={styles.headerIconButton}
            hitSlop={8}
          >
            <MaterialCommunityIcons
              name={showLyricsFull ? 'image-outline' : 'microphone-variant'}
              size={24}
              color={showLyricsFull ? palette.accent : '#FFFFFF'}
            />
          </Pressable>
        </View>

        {showLyricsFull ? (
          /* FULL SCREEN LYRICS VIEW */
          <View style={styles.fullLyricsContainer}>
            <View style={styles.lyricsHeaderRow}>
              <View>
                <Text style={styles.lyricsHeaderTitle}>
                  {lyricsData?.isSynced ? 'Letras Sincronizadas' : 'Letra da Música'}
                </Text>
                <Text style={styles.lyricsHeaderSubtitle}>
                  {lyricsData?.isSynced ? 'Karaokê • Toque para pular' : 'Modo Leitura'}
                </Text>
              </View>
              {lyricsData?.isSynced && (
                <View style={styles.syncedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#1DB954" />
                  <Text style={styles.syncedBadgeText}>Sincronizada</Text>
                </View>
              )}
            </View>

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
                  name="microphone-off"
                  size={48}
                  color="rgba(255,255,255,0.4)"
                />
                <Text style={styles.noLyricsText}>
                  {isLoadingLyrics
                    ? 'Buscando letra...'
                    : 'Letra não encontrada para esta música.'}
                </Text>
              </View>
            )}
          </View>
        ) : (
          /* STANDARD ALBUM ART & TRACK INFO VIEW */
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

            {/* Track Info & Like Action */}
            <View style={styles.trackInfoRow}>
              <View style={styles.trackText}>
                <Text style={styles.trackTitle} numberOfLines={1}>
                  {currentTrack.title}
                </Text>
                <Text style={styles.trackArtist} numberOfLines={1}>
                  {currentTrack.artistName}
                </Text>
              </View>
              <Pressable
                onPress={() => setIsLiked(!isLiked)}
                style={styles.likeButton}
                hitSlop={8}
              >
                <Ionicons
                  name={isLiked ? 'heart' : 'heart-outline'}
                  size={28}
                  color={isLiked ? '#1DB954' : '#FFFFFF'}
                />
              </Pressable>
            </View>

            {/* Glassmorphic Lyrics Mini Preview */}
            {lyricsData && (
              <Pressable
                onPress={() => setShowLyricsFull(true)}
                style={styles.lyricsGlassCard}
              >
                <View style={styles.lyricsPreviewHeader}>
                  <MaterialCommunityIcons
                    name="microphone-variant"
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text style={styles.lyricsPreviewTitle}>LETRAS</Text>
                </View>
                <Text style={styles.lyricsPreviewLine} numberOfLines={2}>
                  {lyricsData.segments.length > 0 && activeLineIndex >= 0
                    ? lyricsData.segments[activeLineIndex].text
                    : lyricsData.plainLyrics?.split('\n')[0] || 'Toque para ver a letra'}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Progress Slider */}
        <View style={styles.progressContainer}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            value={progress}
            minimumTrackTintColor="#FFFFFF"
            maximumTrackTintColor="rgba(255,255,255,0.2)"
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
            <Text style={styles.timeText}>
              {formatTime(playerState.durationMs)}
            </Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <Pressable
            onPress={() => setIsShuffle(!isShuffle)}
            style={styles.auxButton}
            hitSlop={8}
          >
            <MaterialCommunityIcons
              name="shuffle-variant"
              size={24}
              color={isShuffle ? palette.accent : 'rgba(255,255,255,0.6)'}
            />
          </Pressable>

          <Pressable
            onPress={playPrevious}
            style={styles.controlButton}
            disabled={queue.length === 0}
            hitSlop={8}
          >
            <Ionicons name="play-skip-back" size={34} color="#FFFFFF" />
          </Pressable>

          {/* Solid White Play/Pause Button */}
          <Pressable
            onPress={togglePlayPause}
            style={styles.mainPlayButton}
            hitSlop={4}
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
          </Pressable>

          <Pressable
            onPress={playNext}
            style={styles.controlButton}
            disabled={queue.length === 0}
            hitSlop={8}
          >
            <Ionicons name="play-skip-forward" size={34} color="#FFFFFF" />
          </Pressable>

          <Pressable
            onPress={handleToggleRepeat}
            style={styles.auxButton}
            hitSlop={8}
          >
            <MaterialCommunityIcons
              name={
                repeatMode === 'one'
                  ? 'repeat-once'
                  : repeatMode === 'all'
                  ? 'repeat'
                  : 'repeat-off'
              }
              size={24}
              color={
                repeatMode !== 'off'
                  ? palette.accent
                  : 'rgba(255,255,255,0.6)'
              }
            />
          </Pressable>
        </View>

        {/* Bottom Actions: Devices + Share */}
        <View style={styles.bottomActionsRow}>
          <Pressable style={styles.bottomActionButton} hitSlop={8}>
            <MaterialCommunityIcons name="devices" size={22} color="rgba(255,255,255,0.7)" />
          </Pressable>
          <Pressable style={styles.bottomActionButton} hitSlop={8}>
            <Ionicons name="share-outline" size={22} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
      </LinearGradient>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerIconButton: {
    padding: 6,
  },
  headerInfo: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  headerFrom: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontFamily: 'SF-Bold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  headerContext: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'SF-Semibold',
    marginTop: 2,
  },
  mainPlayerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  coverContainer: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    backgroundColor: '#1E1E1E',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#282828',
  },
  trackInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  trackText: {
    flex: 1,
    gap: 4,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'SF-Bold',
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  trackArtist: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontFamily: 'SF-Regular',
  },
  likeButton: {
    padding: 6,
  },
  lyricsGlassCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  lyricsPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lyricsPreviewTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
    letterSpacing: 1,
  },
  lyricsPreviewLine: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontFamily: 'SF-Semibold',
    lineHeight: 20,
  },
  fullLyricsContainer: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    padding: 16,
    marginVertical: 12,
  },
  lyricsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  lyricsHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'SF-Bold',
    fontWeight: '800',
  },
  lyricsHeaderSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: 'SF-Regular',
    marginTop: 2,
  },
  syncedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  syncedBadgeText: {
    color: '#1DB954',
    fontSize: 11,
    fontFamily: 'SF-Bold',
  },
  lyricsScrollContent: {
    paddingVertical: 20,
    gap: 8,
  },
  lyricLineButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  lyricLineActiveButton: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  lyricText: {
    fontSize: 20,
    fontFamily: 'SF-Bold',
    lineHeight: 28,
  },
  lyricTextActive: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  lyricTextInactive: {
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
  },
  plainLyricRow: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  plainLyricText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 17,
    fontFamily: 'SF-Semibold',
    lineHeight: 26,
  },
  noLyricsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  noLyricsText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontFamily: 'SF-Regular',
    textAlign: 'center',
  },
  progressContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  slider: {
    width: '100%',
    height: 36,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: -8,
  },
  timeText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontFamily: 'SF-Medium',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginVertical: 10,
  },
  auxButton: {
    padding: 8,
  },
  controlButton: {
    padding: 8,
  },
  mainPlayButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  bottomActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  bottomActionButton: {
    padding: 6,
  },
});
