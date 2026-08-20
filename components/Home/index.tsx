/**
 * Home Component
 * Home layout with friend notes.
 */

import * as React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { FriendActivityStatus } from './FriendActivityStatus';
import { CompactMusicCarousel } from './CompactMusicCarousel';
import { HeroBanner } from './HeroBanner/HeroBanner';
import { BOTTOM_NAVIGATION_HEIGHT } from '@config';

export { FriendActivityStatus } from './FriendActivityStatus';
export { CompactMusicCarousel } from './CompactMusicCarousel';

export const Home = () => {
  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 1. Friend Activity Listening Status (Stories / Speech Bubbles) */}
        <FriendActivityStatus />

        {/* 2. Compact music banner */}
        <CompactMusicCarousel />

        {/* 3. Featured music banner */}
        <HeroBanner />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollContent: {
    paddingBottom: BOTTOM_NAVIGATION_HEIGHT + 80,
  },
});
