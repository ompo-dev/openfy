/**
 * YourFavourites Component
 * Horizontal favorites section with square album cards and circular artist avatars.
 * Uses LoggedPressable for tactile spring scaling.
 */

import * as React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { usePlayer } from '@context';
import type { PersonalizedHomeTrack } from '@services';
import { LoggedPressable } from '../../native';

export type FavouriteItem = PersonalizedHomeTrack & {
  type?: 'album' | 'artist' | 'track';
};

export const YourFavourites = ({
  items,
  title = 'Seus favoritos',
}: {
  items: FavouriteItem[];
  title?: string;
}) => {
  const { playWithQueue } = usePlayer();

  if (!items.length) return null;

  const queue = items.map((item) => ({
    spotifyId: item.spotifyId,
    title: item.title,
    artistName: item.artistName,
    albumName: item.albumName,
    imageURL: item.localImagePath || item.imageURL,
    duration_ms: item.duration_ms,
    artists: item.artists,
    albumId: item.albumId,
    albumArtists: item.albumArtists,
    youtubeVideoId: item.youtubeVideoId,
    youtubeUrl: item.youtubeUrl,
    localAudioPath: item.localAudioPath,
    localImagePath: item.localImagePath,
    streamUrl: item.streamUrl,
    streamExpiresAt: item.streamExpiresAt,
  }));

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{title}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bounces={true}
        alwaysBounceHorizontal={true}
        overScrollMode="always"
      >
        {items.map((item, index) => {
          const isArtist = item.type === 'artist';
          return (
            <LoggedPressable
              key={item.id}
              onPress={() => void playWithQueue(queue, index, 'home:favourites')}
              style={styles.itemWrapper}
              accessibilityRole="button"
              accessibilityLabel={`Tocar ${item.title}`}
            >
              <View
                style={[
                  styles.imageContainer,
                  isArtist
                    ? styles.artistImageContainer
                    : styles.albumImageContainer,
                ]}
              >
                <Image
                  source={{ uri: item.localImagePath || item.imageURL }}
                  style={styles.image}
                  contentFit="cover"
                />
              </View>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {item.title}
              </Text>
            </LoggedPressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const ITEM_SIZE = 96;

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
    backgroundColor: '#1E1E24',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  albumImageContainer: {
    borderRadius: 16,
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
    marginTop: 2,
  },
});
