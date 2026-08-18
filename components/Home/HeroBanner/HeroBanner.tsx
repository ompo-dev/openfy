/**
 * HeroBanner Component
 * Featured hero carousel with huge artwork, Play / My List action pills with tactile feedback.
 * Uses exact Spotify IDs for authentic playback.
 */

import * as React from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePlayer } from '@context';
import { downloadTrack } from '@services';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
const CARD_HEIGHT = CARD_WIDTH * 1.15;

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
      // Ignore
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
                {/* Subtle top and bottom dark gradient overlay */}
                <LinearGradient
                  colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.85)']}
                  locations={[0, 0.45, 1.0]}
                  style={styles.gradientOverlay}
                >
                  {/* Header text on artwork */}
                  <View style={styles.headerTextContainer}>
                    <Text style={styles.artistSubtitle}>{item.artist}</Text>
                    <Text
                      style={[styles.mainHeadline, { color: item.titleColor }]}
                    >
                      {item.title}
                    </Text>
                  </View>

                  {/* Bottom Action Pills with Touch Feedback */}
                  <View style={styles.actionsContainer}>
                    <Pressable
                      onPress={() => handlePlay(item)}
                      style={({ pressed }) => [
                        styles.playButton,
                        { transform: [{ scale: pressed ? 0.94 : 1 }] },
                      ]}
                      hitSlop={4}
                    >
                      <Ionicons
                        name={isCurrentPlaying ? 'pause' : 'play'}
                        size={20}
                        color="#000000"
                      />
                      <Text style={styles.playButtonText}>
                        {isCurrentPlaying ? 'Pause' : 'Play'}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleAddToList(item)}
                      style={({ pressed }) => [
                        styles.myListButton,
                        isAdded && styles.myListButtonAdded,
                        { transform: [{ scale: pressed ? 0.94 : 1 }] },
                      ]}
                      hitSlop={4}
                    >
                      {isAdding ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Ionicons
                          name={isAdded ? 'checkmark' : 'add'}
                          size={20}
                          color="#FFFFFF"
                        />
                      )}
                      <Text style={styles.myListButtonText}>
                        {isAdded ? 'Saved' : 'My List'}
                      </Text>
                    </Pressable>
                  </View>
                </LinearGradient>
              </ImageBackground>
            </View>
          );
        })}
      </ScrollView>

      {/* Pagination Indicators (Bar + Dots) */}
      <View style={styles.paginationContainer}>
        {FEATURED_ITEMS.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === activeIndex ? styles.dotActive : styles.dotInactive,
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
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1E1E1E',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
  },
  imageBorderRadius: {
    borderRadius: 20,
  },
  gradientOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 20,
    borderRadius: 20,
  },
  headerTextContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  artistSubtitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SF-Bold',
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  mainHeadline: {
    fontSize: 32,
    fontFamily: 'SF-Bold',
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 6,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  playButtonText: {
    color: '#000000',
    fontSize: 16,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
  },
  myListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(18, 18, 18, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 30,
  },
  myListButtonAdded: {
    backgroundColor: 'rgba(29, 185, 84, 0.4)',
    borderColor: '#1DB954',
  },
  myListButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'SF-Bold',
    fontWeight: '600',
  },
  paginationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 22,
    backgroundColor: '#FFFFFF',
  },
  dotInactive: {
    width: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
});
