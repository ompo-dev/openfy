/**
 * YourFavourites Component
 * Horizontal favorites section with square album cards and circular artist avatars.
 * Uses exact Spotify IDs and artist titles for authentic playback.
 */

import * as React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { usePlayer } from '@context';

const FAVOURITE_ITEMS = [
  {
    id: 'fav_1',
    spotifyId: '6dOtVTDmmpzgGQ9qd0RMiZ',
    title: 'BIRDS OF A FEATHER',
    artist: 'Billie Eilish',
    type: 'album',
    imageUrl:
      'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27371d62ea7ea8a5be92d3c1f62',
    duration_ms: 194000,
  },
  {
    id: 'fav_2',
    spotifyId: '1dGr1c8CrMLDpV6mPb2Ovg',
    title: 'Lover',
    artist: 'Taylor Swift',
    type: 'album',
    imageUrl:
      'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b273e787cffec20aa2a396a61647',
    duration_ms: 221000,
  },
  {
    id: 'fav_3',
    spotifyId: '0VjIjW4GlUZAMYd2vXMi3b',
    title: 'The Weeknd',
    artist: 'The Weeknd',
    type: 'artist',
    imageUrl:
      'https://image-cdn-fa.spotifycdn.com/image/ab6761610000e5eb989ed050d24c084ad9a50242',
    duration_ms: 200000,
  },
  {
    id: 'fav_4',
    spotifyId: '4MjDJD8cW7iVeWInc2BdyM',
    title: 'Bad Bunny',
    artist: 'Bad Bunny',
    type: 'artist',
    imageUrl:
      'https://image-cdn-fa.spotifycdn.com/image/ab6761610000e5eb9ad50e478a469448c6f369df',
    duration_ms: 267000,
  },
  {
    id: 'fav_5',
    spotifyId: '7qiZfU4dY1lWllzX7mPBI3',
    title: 'Ed Sheeran',
    artist: 'Ed Sheeran',
    type: 'artist',
    imageUrl:
      'https://image-cdn-fa.spotifycdn.com/image/ab6761610000e5eb12a2efab5f1ddab967406a4b',
    duration_ms: 233000,
  },
];

export const YourFavourites = () => {
  const { playTrack } = usePlayer();

  const handlePress = (item: (typeof FAVOURITE_ITEMS)[0]) => {
    playTrack({
      spotifyId: item.spotifyId,
      title: item.title,
      artistName: item.artist,
      albumName: item.title,
      imageURL: item.imageUrl,
      duration_ms: item.duration_ms,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Your favourites</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {FAVOURITE_ITEMS.map((item) => {
          const isArtist = item.type === 'artist';
          return (
            <Pressable
              key={item.id}
              onPress={() => handlePress(item)}
              style={({ pressed }) => [
                styles.itemWrapper,
                { transform: [{ scale: pressed ? 0.94 : 1 }] },
              ]}
              hitSlop={4}
            >
              <View
                style={[
                  styles.imageContainer,
                  isArtist ? styles.artistImageContainer : styles.albumImageContainer,
                ]}
              >
                <Image
                  source={{ uri: item.imageUrl }}
                  style={styles.image}
                  contentFit="cover"
                />
              </View>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {item.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const ITEM_SIZE = 88;

const styles = StyleSheet.create({
  container: {
    marginVertical: 14,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'SF-Bold',
    fontWeight: '800',
    paddingHorizontal: 16,
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  itemWrapper: {
    width: ITEM_SIZE,
    alignItems: 'center',
    gap: 8,
  },
  imageContainer: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    overflow: 'hidden',
    backgroundColor: '#282828',
  },
  albumImageContainer: {
    borderRadius: 8,
  },
  artistImageContainer: {
    borderRadius: ITEM_SIZE / 2,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  itemTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'SF-Semibold',
    fontWeight: '600',
    textAlign: 'center',
  },
});
