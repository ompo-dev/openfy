/**
 * Home Component
 * Home layout with friend notes.
 */

import * as React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  FriendActivityStatus,
  type FriendNoteItem,
} from './FriendActivityStatus';
import { ListeningFeed } from './ListeningFeed';
import {
  CompactMusicCarousel,
  type CompactTrackItem,
} from './CompactMusicCarousel';
import { HeroBanner, type FeaturedItem } from './HeroBanner/HeroBanner';
import { CatalogHome } from './CatalogHome';
import { BOTTOM_NAVIGATION_HEIGHT } from '@config';
import { useUserData, type PlayerTrack } from '@context';
import { usePersonalizedHome } from '@hooks';
import type { PersonalizedHomeTrack } from '@services';

export { FriendActivityStatus } from './FriendActivityStatus';
export { CompactMusicCarousel } from './CompactMusicCarousel';

const NOTE_COLORS = ['#EC4899', '#0EA5E9', '#22C55E', '#F59E0B', '#8B5CF6', '#EF4444'];
const HERO_COLORS = ['#38BDF8', '#FF5C7A', '#F7B955', '#63D9A0', '#C08BFF'];

const toPlayerTrack = (track: PersonalizedHomeTrack): PlayerTrack => ({
  spotifyId: track.spotifyId,
  title: track.title,
  artistName: track.artistName,
  albumName: track.albumName,
  imageURL: track.localImagePath || track.imageURL,
  duration_ms: track.duration_ms,
  artists: track.artists,
  albumId: track.albumId,
  albumArtists: track.albumArtists,
  youtubeVideoId: track.youtubeVideoId,
  youtubeUrl: track.youtubeUrl,
  localAudioPath: track.localAudioPath,
  localImagePath: track.localImagePath,
  streamUrl: track.streamUrl,
  streamExpiresAt: track.streamExpiresAt,
});

const toCompactTrack = (track: PersonalizedHomeTrack): CompactTrackItem => ({
  id: track.id,
  spotifyId: track.spotifyId,
  title: track.title,
  artist: track.artistName,
  albumName: track.albumName,
  imageUrl: track.localImagePath || track.imageURL,
  duration_ms: track.duration_ms,
  explicit: track.explicit,
  artists: track.artists,
  albumId: track.albumId,
  albumArtists: track.albumArtists,
  youtubeVideoId: track.youtubeVideoId,
  youtubeUrl: track.youtubeUrl,
  localAudioPath: track.localAudioPath,
  localImagePath: track.localImagePath,
  streamUrl: track.streamUrl,
  streamExpiresAt: track.streamExpiresAt,
});

export const Home = () => {
  const { top } = useSafeAreaInsets();
  const { userData } = useUserData();
  const { home, isLoading } = usePersonalizedHome();
  const recommendationTracks = home.discoveries.length
    ? home.discoveries
    : home.quickPicks;
  const compactTracks = recommendationTracks.slice(0, 8).map(toCompactTrack);
  const queueTracks = (home.featured.length ? home.featured : home.quickPicks)
    .slice(0, 6)
    .map(toPlayerTrack);
  const lyricTrack = (home.continueListening[0] || home.quickPicks[0]);
  const featuredItems: FeaturedItem[] = home.featured.slice(0, 5).map((track, index) => ({
    id: track.id,
    spotifyId: track.spotifyId,
    artist: track.artistName,
    title: track.title,
    albumName: track.albumName,
    imageUrl: track.localImagePath || track.imageURL,
    titleColor: HERO_COLORS[index % HERO_COLORS.length],
    duration_ms: track.duration_ms,
    streamUrl: track.streamUrl,
    streamExpiresAt: track.streamExpiresAt,
    artists: track.artists,
    albumId: track.albumId,
    albumArtists: track.albumArtists,
    youtubeVideoId: track.youtubeVideoId,
    youtubeUrl: track.youtubeUrl,
    localAudioPath: track.localAudioPath,
    localImagePath: track.localImagePath,
    isSaved: home.tracksById.has(track.spotifyId),
  }));
  const noteTracks = [...home.continueListening, ...recommendationTracks]
    .filter((track, index, tracks) =>
      tracks.findIndex((candidate) =>
        (candidate.artists?.[0]?.name || candidate.artistName).toLocaleLowerCase() ===
        (track.artists?.[0]?.name || track.artistName).toLocaleLowerCase()
      ) === index
    )
    .slice(0, 6);
  const notes: FriendNoteItem[] = noteTracks.length ? [
    {
      id: 'note_user',
      user: {
        name: 'Sua nota',
        avatarUrl:
          userData.imageURL ||
          noteTracks[0].localImagePath ||
          noteTracks[0].imageURL,
        isCurrentUser: true,
      },
      note: {
        type: 'text',
        title: 'Deixe uma nota...',
        bubbleColor: '#1C1E24',
      },
    },
    ...noteTracks.map((track, index): FriendNoteItem => ({
      id: `recommendation_${track.spotifyId}`,
      user: {
        name: track.artists?.[0]?.name || track.artistName,
        avatarUrl: track.localImagePath || track.imageURL,
      },
      note: {
        type: 'music',
        iconType: 'wave',
        title: track.title,
        subtitle: track.artistName,
        spotifyId: track.spotifyId,
        artist: track.artistName,
        imageUrl: track.localImagePath || track.imageURL,
        duration_ms: track.duration_ms,
        streamUrl: track.streamUrl,
        streamExpiresAt: track.streamExpiresAt,
        artists: track.artists,
        albumId: track.albumId,
        albumArtists: track.albumArtists,
        youtubeVideoId: track.youtubeVideoId,
        youtubeUrl: track.youtubeUrl,
        localAudioPath: track.localAudioPath,
        localImagePath: track.localImagePath,
        bubbleColor: NOTE_COLORS[index % NOTE_COLORS.length],
      },
    })),
  ] : [];
  const hasContent =
    home.continueListening.length ||
    home.quickPicks.length ||
    home.albums.length ||
    home.playlists.length;

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: top + 8 }]}
      >
        {/* 1. Friend Activity Listening Status (Stories / Speech Bubbles) */}
        {notes.length ? <FriendActivityStatus notes={notes} /> : null}

        <CatalogHome home={home} />

        {/* 2. Music posts */}
        <ListeningFeed
          lyricTrack={lyricTrack ? toPlayerTrack(lyricTrack) : undefined}
          queueTracks={queueTracks}
          shelfTitle={home.seeds[0]
            ? `Porque você ouve ${home.seeds[0].name}`
            : 'Escolhas da sua biblioteca'}
          shelfTracks={compactTracks.slice(0, 3)}
        />

        {/* 3. Compact music banner */}
        <CompactMusicCarousel title={home.discoveryTitle} tracks={compactTracks} />

        {/* 4. Featured music banner */}
        <HeroBanner featuredItems={featuredItems} />

        {!isLoading && !hasContent ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Sua Home começa com você</Text>
            <Text style={styles.emptyText}>
              Adicione músicas, álbuns ou playlists à Biblioteca para criar recomendações locais.
            </Text>
          </View>
        ) : null}
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
  emptyState: { gap: 7, paddingHorizontal: 24, paddingVertical: 64 },
  emptyTitle: { color: '#FFFFFF', fontFamily: 'SF-Bold', fontSize: 21, textAlign: 'center' },
  emptyText: { color: '#8E8E93', fontFamily: 'SF-Regular', fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
