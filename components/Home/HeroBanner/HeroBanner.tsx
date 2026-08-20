/**
 * HeroBanner Component
 * Featured hero carousel with compact modern artwork, centered headlines,
 * and horizontally centered Play / My List Liquid Glass action pills with tactile feedback.
 * Uses exact Spotify IDs for authentic playback.
 */

import * as React from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePlayer } from '@context';
import { downloadTrack } from '@services';
import { GlassSurface, LoggedPressable } from '../../native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
const CARD_HEIGHT = Math.min(CARD_WIDTH * 0.95, 340); // Slightly more compact

const FEATURED_ITEMS = [
  {
    id: '2plbrEY59IikOBB5X7x5eG',
    spotifyId: '2plbrEY59IikOBB5X7x5eG',
    artist: 'LADY GAGA & BRUNO MARS',
    title: 'DIE WITH A SMILE',
    imageUrl:
      'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b2738278b782c429712cf757e754',
    titleColor: '#FF1E27',
    duration_ms: 251000,
  },
  {
    id: '6dOtVTDmmpzgGQ9qd0RMiZ',
    spotifyId: '6dOtVTDmmpzgGQ9qd0RMiZ',
    artist: 'BILLIE EILISH',
    title: 'BIRDS OF A FEATHER',
    imageUrl:
      'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27371d62ea7ea8a5be92d3c1f62',
    titleColor: '#38BDF8',
    duration_ms: 194000,
  },
  {
    id: '0VjIjW4GlUZAMYd2vXMi3b',
    spotifyId: '0VjIjW4GlUZAMYd2vXMi3b',
    artist: 'THE WEEKND',
    title: 'BLINDING LIGHTS',
    imageUrl:
      'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36',
    titleColor: '#FB923C',
    duration_ms: 200000,
  },
];

export const HeroBanner = () => {
  const { playTrack, currentTrack, playerState } = usePlayer();
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [addingId, setAddingId] = React.useState<string | null>(null);
  const [addedIds, setAddedIds] = React.useState<Record<string, boolean>>({});

  const handleScroll = (event: any) => {
    const slide = Math.round(event.nativeEvent.contentOffset.x / CARD_WIDTH);
    if (slide !== activeIndex && slide >= 0 && slide < FEATURED_ITEMS.length) {
      setActiveIndex(slide);
    }
  };

  const handlePlay = (item: (typeof FEATURED_ITEMS)[0]) => {
    playTrack({
      spotifyId: item.spotifyId,
      title: item.title,
      artistName: item.artist,
      albumName: 'Featured Single',
      imageURL: item.imageUrl,
      duration_ms: item.duration_ms,
    });
  };

  const handleAddToList = async (item: (typeof FEATURED_ITEMS)[0]) => {
    if (addedIds[item.id] || addingId === item.id) return;
    setAddingId(item.id);
    try {
      await downloadTrack({
        spotifyId: item.spotifyId,
        title: item.title,
        artistName: item.artist,
        albumName: 'Featured Single',
        imageURL: item.imageUrl,
        duration_ms: item.duration_ms,
      });
      setAddedIds((prev) => ({ ...prev, [item.id]: true }));
    } catch {
      // ignore
    } finally {
      setAddingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        contentContainerStyle={styles.scrollContent}
      >
        {FEATURED_ITEMS.map((item) => {
          const isCurrentPlaying =
            currentTrack?.spotifyId === item.spotifyId && playerState.isPlaying;
          const isAdded = addedIds[item.id];
          const isAdding = addingId === item.id;

          return (
            <View key={item.id} style={styles.cardWrapper}>
              <ImageBackground
                source={{ uri: item.imageUrl }}
                style={styles.cardImage}
                imageStyle={styles.imageBorderRadius}
              >
                {/* Dark gradient overlay */}
                <LinearGradient
                  colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.88)']}
                  locations={[0, 0.45, 1.0]}
                  style={styles.gradientOverlay}
                >
                  {/* Horizontally centered Header text on artwork */}
                  <View style={styles.headerTextContainer}>
                    <Text style={styles.artistSubtitle}>{item.artist}</Text>
                    <Text
                      style={[styles.mainHeadline, { color: item.titleColor }]}
                    >
                      {item.title}
                    </Text>
                  </View>

                  {/* Horizontally centered Bottom Action Pills */}
                  <View style={styles.actionsContainer}>
                    <LoggedPressable
                      onPress={() => handlePlay(item)}
                      style={styles.playButton}
                      accessibilityRole="button"
                      accessibilityLabel={isCurrentPlaying ? 'Pausar' : 'Tocar'}
                    >
                      <Ionicons
                        name={isCurrentPlaying ? 'pause' : 'play'}
                        size={18}
                        color="#000000"
                      />
                      <Text style={styles.playButtonText}>
                        {isCurrentPlaying ? 'Pause' : 'Play'}
                      </Text>
                    </LoggedPressable>

                    <LoggedPressable
                      onPress={() => handleAddToList(item)}
                      accessibilityRole="button"
                      accessibilityLabel="Adicionar à lista"
                    >
                      <GlassSurface
                        glass="regular"
                        isInteractive
                        style={[
                          styles.myListGlassButton,
                          isAdded && styles.myListButtonAdded,
                        ]}
                      >
                        {isAdding ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Ionicons
                            name={isAdded ? 'checkmark' : 'add'}
                            size={18}
                            color="#FFFFFF"
                          />
                        )}
                        <Text style={styles.myListButtonText}>
                          {isAdded ? 'Salvo' : 'Minha Lista'}
                        </Text>
                      </GlassSurface>
                    </LoggedPressable>
                  </View>
                </LinearGradient>
              </ImageBackground>
            </View>
          );
        })}
      </ScrollView>

      {/* Slide Indicators */}
      <View style={styles.indicatorContainer}>
        {FEATURED_ITEMS.map((_, index) => (
          <View
            key={index}
            style={[
              styles.indicatorDot,
              index === activeIndex && styles.indicatorDotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
  },
  imageBorderRadius: {
    borderRadius: 24,
  },
  gradientOverlay: {
    ...(StyleSheet.absoluteFill as any),
    justifyContent: 'space-between',
    padding: 20,
    borderRadius: 24,
  },
  headerTextContainer: {
    marginTop: 6,
    alignItems: 'center',
    width: '100%',
  },
  artistSubtitle: {
    color: '#E5E5E5',
    fontSize: 12,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  mainHeadline: {
    fontSize: 24,
    fontFamily: 'SF-Bold',
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 4,
    width: '100%',
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 22,
    gap: 7,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  playButtonText: {
    color: '#000000',
    fontSize: 13.5,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
  },
  myListGlassButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    gap: 6,
    overflow: 'hidden',
  },
  myListButtonAdded: {
    borderColor: '#1DB954',
  },
  myListButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
  },
  indicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  indicatorDotActive: {
    width: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
  },
});
