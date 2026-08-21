/**
 * HeroBanner Component
 * Featured hero carousel with centered compact modern cards,
 * smooth carousel pass animations with centered snapping,
 * and animated pagination indicators.
 */

import * as React from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
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
import { useHomeTrackRefresh } from '@hooks';
import { downloadTrack } from '@services';
import { GlassSurface, LoggedPressable } from '../../native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 52, 335); // Less wide, nicely centered
const CARD_HEIGHT = 310;
const CARD_GAP = 14;
const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;
const SIDE_PADDING = (SCREEN_WIDTH - CARD_WIDTH) / 2;

type FeaturedItem = {
  id: string;
  spotifyId: string;
  artist: string;
  title: string;
  imageUrl: string;
  titleColor: string;
  duration_ms: number;
  streamUrl?: string;
};

const FEATURED_ITEMS: FeaturedItem[] = [
  {
    id: 'hero_die_with_a_smile',
    spotifyId: '0SiywuOBRcynK0uKGWdCnn',
    artist: 'LADY GAGA',
    title: 'BAD ROMANCE',
    imageUrl: 'https://i.ytimg.com/vi/NlK9u6a69Dg/maxresdefault.jpg',
    titleColor: '#FF1E27',
    duration_ms: 295000,
  },
  {
    id: 'hero_birds_of_a_feather',
    spotifyId: '6dOtVTDmmpzgGQ9qd0RMiZ',
    artist: 'BILLIE EILISH',
    title: 'BIRDS OF A FEATHER',
    imageUrl:
      'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27371d62ea7ea8a5be92d3c1f62',
    titleColor: '#38BDF8',
    duration_ms: 194000,
  },
  {
    id: 'hero_blinding_lights',
    spotifyId: '0VjIjW4GlUZAMYd2vXMi3b',
    artist: 'THE WEEKND',
    title: 'BLINDING LIGHTS',
    imageUrl:
      'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36',
    titleColor: '#FB923C',
    duration_ms: 200000,
  },
];

const FEATURED_TRACK_SEEDS = FEATURED_ITEMS.map((item) => ({
  key: item.id,
  spotifyId: item.spotifyId,
  title: item.title,
  artistName: item.artist,
  albumName: 'Featured Single',
  imageURL: item.imageUrl,
  duration_ms: item.duration_ms,
}));

export const HeroBanner = () => {
  const { playTrack, currentTrack, playerState, togglePlayPause } = usePlayer();
  const refreshedTracks = useHomeTrackRefresh(FEATURED_TRACK_SEEDS);
  const featuredItems = React.useMemo(
    () =>
      FEATURED_ITEMS.map((item) => {
        const refreshed = refreshedTracks[item.id];
        return refreshed
          ? {
              ...item,
              title: refreshed.title,
              artist: refreshed.artistName,
              imageUrl: refreshed.imageURL,
              duration_ms: refreshed.duration_ms,
              streamUrl: refreshed.streamUrl,
            }
          : item;
      }),
    [refreshedTracks]
  );
  const [addingId, setAddingId] = React.useState<string | null>(null);
  const [addedIds, setAddedIds] = React.useState<Record<string, boolean>>({});
  const scrollX = React.useRef(new Animated.Value(0)).current;

  const handlePlay = (item: FeaturedItem) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    if (currentTrack?.spotifyId === item.spotifyId) {
      togglePlayPause();
      return;
    }

    playTrack({
      spotifyId: item.spotifyId,
      title: item.title,
      artistName: item.artist,
      albumName: 'Featured Single',
      imageURL: item.imageUrl,
      duration_ms: item.duration_ms,
      streamUrl: item.streamUrl,
    });
  };

  const handleAddToList = async (item: FeaturedItem) => {
    if (addedIds[item.id] || addingId === item.id) return;
    setAddingId(item.id);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    try {
      await downloadTrack({
        spotifyId: item.spotifyId,
        title: item.title,
        artistName: item.artist,
        albumName: 'Featured Single',
        imageURL: item.imageUrl,
        duration_ms: item.duration_ms,
      }, item.streamUrl);
      setAddedIds((prev) => ({ ...prev, [item.id]: true }));
    } catch {
      // ignore
    } finally {
      setAddingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP_INTERVAL}
        snapToAlignment="center"
        decelerationRate="fast"
        bounces={true}
        alwaysBounceHorizontal={true}
        overScrollMode="always"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: SIDE_PADDING },
        ]}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: Platform.OS !== 'web' }
        )}
      >
        {featuredItems.map((item, index) => {
          const isCurrentPlaying =
            currentTrack?.spotifyId === item.spotifyId && playerState.isPlaying;
          const isAdded = addedIds[item.id];
          const isAdding = addingId === item.id;

          const inputRange = [
            (index - 1) * SNAP_INTERVAL,
            index * SNAP_INTERVAL,
            (index + 1) * SNAP_INTERVAL,
          ];

          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.93, 1.0, 0.93],
            extrapolate: 'clamp',
          });

          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.75, 1.0, 0.75],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={item.id}
              style={[
                styles.cardWrapper,
                {
                  transform: [{ scale }],
                  opacity,
                },
              ]}
            >
              <ImageBackground
                source={{ uri: item.imageUrl }}
                style={styles.cardImage}
                imageStyle={styles.imageBorderRadius}
              >
                {/* Dark gradient overlay */}
                <LinearGradient
                  colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.92)']}
                  locations={[0, 0.42, 1.0]}
                  style={styles.gradientOverlay}
                >
                  {/* Horizontally centered Header text on artwork */}
                  <View style={styles.headerTextContainer}>
                    <Text style={styles.artistSubtitle}>{item.artist}</Text>
                    <Text style={[styles.mainHeadline, { color: item.titleColor }]}>
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
                        size={17}
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
                            size={17}
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
            </Animated.View>
          );
        })}
      </Animated.ScrollView>

      {/* Smooth animated slide indicators */}
      <View style={styles.indicatorContainer}>
        {featuredItems.map((_, index) => {
          const inputRange = [
            (index - 1) * SNAP_INTERVAL,
            index * SNAP_INTERVAL,
            (index + 1) * SNAP_INTERVAL,
          ];

          const dotWidth = scrollX.interpolate({
            inputRange,
            outputRange: [6, 18, 6],
            extrapolate: 'clamp',
          });

          const dotOpacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1.0, 0.3],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={index}
              style={[
                styles.indicatorDot,
                {
                  width: dotWidth,
                  opacity: dotOpacity,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  scrollContent: {
    gap: CARD_GAP,
    alignItems: 'center',
  },
  cardWrapper: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 22,
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
    borderRadius: 22,
  },
  gradientOverlay: {
    ...(StyleSheet.absoluteFill as any),
    justifyContent: 'space-between',
    padding: 18,
    borderRadius: 22,
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
    fontSize: 23,
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
    marginBottom: 2,
    width: '100%',
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 22,
    gap: 6,
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
    paddingVertical: 10,
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
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
});
