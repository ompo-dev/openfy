/**
 * Home Component
 * Modern SwiftUI & Spotify layout with FriendActivityStatus, CompactMusicCarousel,
 * HeroBanner, YourFavourites, Top Albums, and Playlists.
 */

import * as React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { FriendActivityStatus } from './FriendActivityStatus';
import { CompactMusicCarousel } from './CompactMusicCarousel';
import { HeroBanner } from './HeroBanner/HeroBanner';
import { YourFavourites } from './YourFavourites/YourFavourites';
import { RecentlyPlayed } from './RecentlyPlayed';
import { TopAlbums } from './TopAlbums';
import { TopArtists } from './TopArtists';
import { YourPlaylists } from './YourPlaylists';
import { FeaturedPlaylists } from './FeaturedPlaylists';
import { EmptySection } from '../EmptySection';
import { BOTTOM_NAVIGATION_HEIGHT } from '@config';
import { useApplicationDimensions } from '@hooks';

export { FriendActivityStatus } from './FriendActivityStatus';
export { CompactMusicCarousel } from './CompactMusicCarousel';

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
        {/* 1. Friend Activity Listening Status (Stories / Speech Bubbles) */}
        <FriendActivityStatus />

        {/* 2. Compact Music Carousel Cards (Album Art + Explicit + Play Button) */}
        <CompactMusicCarousel />

        {/* 3. Featured Hero Carousel */}
        <HeroBanner />

        {/* 4. Your favourites row */}
        <YourFavourites />

        {/* 5. Recently Played grid */}
        <RecentlyPlayed />

        {/* 6. Top Albums & Artists */}
        <TopAlbums />
        <TopArtists />

        {/* 7. Playlists */}
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
