/**
 * CompactMusicCarousel Component
 * Compact modern track carousel cards with album art, parental advisory badge,
 * bold typography, and floating circular Spotify play action button.
 */

import * as React from 'react';
import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePlayer } from '@context';
import { LoggedPressable } from '../../native';

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
    spotifyId: '6DCZcSspjsKoFjzjrWoCdn',
    title: 'Headlines',
    artist: 'Drake',
    albumName: 'Take Care',
    imageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27326f7f19c7f0381e56156c94a',
    duration_ms: 236000,
    explicit: true,
  },
  {
    id: 'compact_dietrying',
    spotifyId: '2plbrEY59IikOBB5X7x5eG',
    title: 'DIE TRYING',
    artist: 'PARTYNEXTDOOR, Drake, Yebba',
    albumName: 'PARTYMOBILE',
    imageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b2738278b782c429712cf757e754',
    duration_ms: 204000,
    explicit: true,
  },
  {
    id: 'compact_poetas',
    spotifyId: '4w47dntseeMeuLPzFTKKB9',
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

export const CompactMusicCarousel = () => {
  const { playTrack, currentTrack, playerState } = usePlayer();

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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {COMPACT_TRACKS.map((item) => {
          const isPlaying =
            currentTrack?.spotifyId === item.spotifyId && playerState.isPlaying;

          return (
            <LoggedPressable
              key={item.id}
              style={[styles.card, isPlaying && styles.cardActive]}
              onPress={() => handlePlay(item)}
              accessibilityRole="button"
              accessibilityLabel={`Tocar ${item.title} de ${item.artist}`}
            >
              {/* Square Album Cover with Explicit Badge */}
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: item.imageUrl }}
                  style={styles.artworkImage}
                />

                {item.explicit && (
                  <View style={styles.explicitBadge}>
                    <Text style={styles.explicitText}>E</Text>
                  </View>
                )}
              </View>

              {/* Title & Artist */}
              <View style={styles.infoContainer}>
                <Text style={styles.titleText} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.artistText} numberOfLines={1}>
                  {item.artist}
                </Text>
              </View>

              {/* Bottom Footer: Spotify branding + Circular White Play Button */}
              <View style={styles.cardFooter}>
                <View style={styles.spotifyBranding}>
                  <FontAwesome5 name="spotify" size={14} color="#FFFFFF" />
                  <Text style={styles.spotifyText}>Spotify</Text>
                </View>

                <View style={styles.playButton}>
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={16}
                    color="#000000"
                    style={{ marginLeft: isPlaying ? 0 : 2 }}
                  />
                </View>
              </View>
            </LoggedPressable>
          );
        })}
      </ScrollView>
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
    width: 172,
    backgroundColor: '#161618',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'space-between',
  },
  cardActive: {
    borderColor: '#1DB954',
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#27272A',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  explicitBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
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
  infoContainer: {
    marginTop: 10,
    gap: 2,
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  artistText: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 12,
    fontFamily: 'SF-Regular',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 4,
  },
  spotifyBranding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    opacity: 0.9,
  },
  spotifyText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
  },
  playButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
});
