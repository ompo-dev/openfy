/**
 * CompactMusicCarousel Component
 * Compact modern track carousel where the album artwork is the FULL background of the card,
 * with dark bottom gradient, in-image circular play button, explicit tag,
 * physics-based scroll inertia, bouncy elastic scroll edges, and marquee scrolling titles.
 */

import * as React from 'react';
import {
  Animated,
  ImageBackground,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { usePlayer } from '@context';
import { LoggedPressable } from '../../native';
import { MarqueeText } from '../../common/MarqueeText';

export interface CompactTrackItem {
  id: string;
  spotifyId: string;
  title: string;
  artist: string;
  albumName?: string;
  imageUrl: string;
  duration_ms: number;
  explicit?: boolean;
}

const COMPACT_TRACKS: CompactTrackItem[] = [
  {
    id: 'compact_headlines',
    spotifyId: '2FY7MXti3Mu8Zt597qSz2i',
    title: 'Headlines',
    artist: 'Drake',
    albumName: 'Take Care',
    imageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27326f7f19c7f0381e56156c94a',
    duration_ms: 236000,
    explicit: true,
  },
  {
    id: 'compact_dietrying',
    spotifyId: '3ZffCQKLFLUvOCuVsxc364',
    title: 'DIE TRYING',
    artist: 'PARTYNEXTDOOR, Drake, Yebba',
    albumName: 'PARTYMOBILE',
    imageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b2738278b782c429712cf757e754',
    duration_ms: 204000,
    explicit: true,
  },
  {
    id: 'compact_poetas',
    spotifyId: '5sIC52iprWHz3f2O22bWkL',
    title: 'Poetas no Topo 4',
    artist: 'PineappleStormTV',
    albumName: 'Poetas no Topo 4',
    imageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b2737e10812d9b103f2656dc91c6',
    duration_ms: 1067860,
    explicit: true,
  },
  {
    id: 'compact_birds',
    spotifyId: '6dOtVTDmmpzgGQ9qd0RMiZ',
    title: 'BIRDS OF A FEATHER',
    artist: 'Billie Eilish',
    albumName: 'HIT ME HARD AND SOFT',
    imageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27371d62ea7ea8a5be92d3c1f62',
    duration_ms: 194000,
    explicit: false,
  },
  {
    id: 'compact_blinding',
    spotifyId: '0VjIjW4GlUZAMYd2vXMi3b',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    albumName: 'After Hours',
    imageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36',
    duration_ms: 200000,
    explicit: false,
  },
];

const CARD_SNAP_WIDTH = 168; // 154 width + 14 gap

export const CompactMusicCarousel = () => {
  const { playTrack, currentTrack, playerState } = usePlayer();
  const scrollX = React.useRef(new Animated.Value(0)).current;

  const handlePlay = (item: CompactTrackItem) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    playTrack({
      spotifyId: item.spotifyId,
      title: item.title,
      artistName: item.artist,
      albumName: item.albumName || 'Single',
      imageURL: item.imageUrl,
      duration_ms: item.duration_ms,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Em Alta Agora</Text>
        <Text style={styles.seeAllText}>Ver tudo</Text>
      </View>

      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        bounces={true}
        alwaysBounceHorizontal={true}
        overScrollMode="always"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: Platform.OS !== 'web' }
        )}
      >
        {COMPACT_TRACKS.map((item, index) => {
          const isPlaying =
            currentTrack?.spotifyId === item.spotifyId && playerState.isPlaying;

          // Physics scroll inertia animation
          const inputRange = [
            (index - 1) * CARD_SNAP_WIDTH,
            index * CARD_SNAP_WIDTH,
            (index + 1) * CARD_SNAP_WIDTH,
          ];

          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.94, 1.0, 0.94],
            extrapolate: 'clamp',
          });

          const translateY = scrollX.interpolate({
            inputRange,
            outputRange: [2, 0, 2],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={item.id}
              style={{
                transform: [{ scale }, { translateY }],
              }}
            >
              <LoggedPressable
                style={[styles.card, isPlaying && styles.cardActive]}
                onPress={() => handlePlay(item)}
                accessibilityRole="button"
                accessibilityLabel={`Tocar ${item.title} de ${item.artist}`}
              >
                {/* Full-bleed Artwork Background */}
                <ImageBackground
                  source={{ uri: item.imageUrl }}
                  style={styles.cardImageBackground}
                  imageStyle={styles.cardImageRadius}
                >
                  <LinearGradient
                    colors={[
                      'rgba(0,0,0,0.2)',
                      'transparent',
                      'rgba(0,0,0,0.92)',
                    ]}
                    locations={[0, 0.35, 1.0]}
                    style={styles.gradientOverlay}
                  >
                    {/* Top Row: Explicit Badge */}
                    <View style={styles.topRow}>
                      {item.explicit && (
                        <View style={styles.explicitBadge}>
                          <Text style={styles.explicitText}>E</Text>
                        </View>
                      )}
                    </View>

                    {/* Bottom Row: Left-Aligned Text + Play Button */}
                    <View style={styles.bottomRow}>
                      <View style={styles.infoContainer}>
                        <MarqueeText
                          text={item.title}
                          style={styles.titleText}
                          align="left"
                          fadeWidth={8}
                        />
                        <MarqueeText
                          text={item.artist}
                          style={styles.artistText}
                          align="left"
                          fadeWidth={8}
                        />
                      </View>

                      {/* Circular White Play Button */}
                      <View style={styles.playButton}>
                        <Ionicons
                          name={isPlaying ? 'pause' : 'play'}
                          size={15}
                          color="#000000"
                          style={{ marginLeft: isPlaying ? 0 : 2 }}
                        />
                      </View>
                    </View>
                  </LinearGradient>
                </ImageBackground>
              </LoggedPressable>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'SF-Bold',
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  seeAllText: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 13,
    fontFamily: 'SF-Regular',
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 14,
  },
  card: {
    width: 156,
    height: 195,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  cardActive: {
    borderColor: '#FFFFFF',
  },
  cardImageBackground: {
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
  },
  cardImageRadius: {
    borderRadius: 18,
  },
  gradientOverlay: {
    ...(StyleSheet.absoluteFill as any),
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 18,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  explicitBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  explicitText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: 'SF-Bold',
    fontWeight: '800',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
  },
  infoContainer: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 2,
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
    letterSpacing: 0.1,
    textAlign: 'left',
  },
  artistText: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 11.5,
    fontFamily: 'SF-Regular',
    textAlign: 'left',
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    flexShrink: 0,
    marginBottom: 2,
  },
});
