/**
 * Home Component
 * Modern SwiftUI & Spotify layout with HeroBanner, YourFavourites, Top Albums, and Playlists.
 */

import * as React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { HeroBanner } from './HeroBanner/HeroBanner';
import { YourFavourites } from './YourFavourites/YourFavourites';
import { RecentlyPlayed } from './RecentlyPlayed';
import { TopAlbums } from './TopAlbums';
import { TopArtists } from './TopArtists';
import { YourPlaylists } from './YourPlaylists';
import { FeaturedPlaylists } from './FeaturedPlaylists';
import { EmptySection } from '../EmptySection';
import { BOTTOM_NAVIGATION_HEIGHT, COLORS } from '@config';
import { useApplicationDimensions } from '@hooks';

export const Home = () => {
  const { height } = useApplicationDimensions();

  return (
    <View
      style={[
        styles.container,
        {
          height: height - BOTTOM_NAVIGATION_HEIGHT - 60,
        },
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 1. Featured Hero Carousel */}
        <HeroBanner />

        {/* 2. Your favourites row */}
        <YourFavourites />

        {/* 3. Recently Played grid */}
        <RecentlyPlayed />

        {/* 4. Top Albums & Artists */}
        <TopAlbums />
        <TopArtists />

        {/* 5. Playlists */}
        <YourPlaylists />
        <FeaturedPlaylists />

        <EmptySection />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#121212',
  },
  scrollContent: {
    paddingBottom: 40,
  },
});
