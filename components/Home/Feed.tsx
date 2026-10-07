import * as React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getArtistCatalogImage } from '@api';
import { BOTTOM_NAVIGATION_HEIGHT } from '@config';
import { useUserData, type PlayerTrack } from '@context';
import { usePersonalizedHome } from '@hooks';
import { getCachedArtistImage, type PersonalizedHomeTrack } from '@services';

import { ListeningFeed } from './ListeningFeed';
import {
  FriendActivityStatus,
  type FriendNoteItem,
} from './FriendActivityStatus';
import type { CompactTrackItem } from './CompactMusicCarousel';
import { log } from '../../utils/appLogger';

const NOTE_COLORS = ['#EC4899', '#0EA5E9', '#22C55E', '#F59E0B', '#8B5CF6', '#EF4444'];
const normalize = (value: string) =>
  value.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const toPlayerTrack = (track: PersonalizedHomeTrack): PlayerTrack => ({
  spotifyId: track.spotifyId,
  title: track.title,
  artistName: track.artistName,
  albumName: track.albumName,
  imageURL: track.localImagePath || track.imageURL,
  duration_ms: track.duration_ms,
  artists: track.artists,
  albumId: track.albumId,
  albumAssociations: track.albumAssociations,
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
  albumAssociations: track.albumAssociations,
  albumArtists: track.albumArtists,
  youtubeVideoId: track.youtubeVideoId,
  youtubeUrl: track.youtubeUrl,
  localAudioPath: track.localAudioPath,
  localImagePath: track.localImagePath,
  streamUrl: track.streamUrl,
  streamExpiresAt: track.streamExpiresAt,
});

export const Feed = () => {
  const { top } = useSafeAreaInsets();
  const { userData } = useUserData();
  const { home, isLoading, isRefreshing, refresh } = usePersonalizedHome();
  const recommendationTracks = home.discoveries.length
    ? home.discoveries
    : home.quickPicks;
  const noteTracks = React.useMemo(
    () =>
      [...home.continueListening, ...recommendationTracks]
        .filter((track, index, tracks) => {
          const artist = normalize(track.artists?.[0]?.name || track.artistName);
          return tracks.findIndex(
            (candidate) =>
              normalize(candidate.artists?.[0]?.name || candidate.artistName) === artist
          ) === index;
        })
        .slice(0, 8),
    [home.continueListening, recommendationTracks]
  );
  const artists = React.useMemo(() => {
    const unique = new Map<string, { id: string; name: string }>();
    noteTracks.forEach((track) => {
      const artist = track.artists?.[0];
      const name = artist?.name?.trim() || track.artistName.split(',')[0]?.trim() || '';
      if (name) unique.set(normalize(name), { id: artist?.id || '', name });
    });
    return [...unique.values()].slice(0, 6);
  }, [noteTracks]);
  const [artistImages, setArtistImages] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    let active = true;
    artists.forEach((artist) => {
      const key = normalize(artist.name);
      const finishImageLoad = log.time('home', 'feed artist image load', {
        artistId: artist.id || undefined,
        artist: artist.name,
      });
      const imageRequest = (async () => {
        return getCachedArtistImage(artist.name, () =>
          getArtistCatalogImage(artist.id, artist.name),
        [artist.id]);
      })();
      void imageRequest.then((image) => {
        if (active && image) {
          setArtistImages((current) => ({ ...current, [key]: image }));
        }
        finishImageLoad({ ok: Boolean(image), hasImage: Boolean(image) });
      }).catch((error) => {
        finishImageLoad({ ok: false, error: String(error) });
      });
    });
    return () => {
      active = false;
    };
  }, [artists]);

  const notes = React.useMemo<FriendNoteItem[]>(
    () => [
      {
        id: 'note_user',
        user: {
          name: 'Sua nota',
          avatarUrl: userData.imageURL || '',
          isCurrentUser: true,
        },
        note: { type: 'text', title: 'Deixe uma nota...', bubbleColor: '#1C1E24' },
      },
      ...noteTracks.map((track, index): FriendNoteItem => {
        const artistName = track.artists?.[0]?.name || track.artistName.split(',')[0]?.trim() || '';
        return {
          id: `artist_note_${track.spotifyId}`,
          user: {
            name: artistName,
            avatarUrl: artistImages[normalize(artistName)] || '',
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
        };
      }),
    ],
    [artistImages, noteTracks, userData.imageURL]
  );
  const queueTracks = (home.featured.length ? home.featured : home.quickPicks)
    .slice(0, 8)
    .map(toPlayerTrack);
  const compactTracks = recommendationTracks.slice(0, 8).map(toCompactTrack);
  const lyricTrack = home.continueListening[0] || home.quickPicks[0] || home.discoveries[0];

  return (
    <View style={styles.container}>
      <ScrollView
        alwaysBounceVertical
        bounces
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: top + 16 }]}
        refreshControl={
          <RefreshControl
            tintColor="#FFFFFF"
            colors={['#1DB954']}
            progressViewOffset={top + 8}
            refreshing={isRefreshing}
            onRefresh={refresh}
          />
        }
      >
        <FriendActivityStatus notes={notes} />
        <ListeningFeed
          lyricTrack={lyricTrack ? toPlayerTrack(lyricTrack) : undefined}
          queueTracks={queueTracks}
          shelfTitle={home.seeds[0]
            ? `Porque você ouve ${home.seeds[0].name}`
            : 'Seleção para você'}
          shelfTracks={compactTracks.slice(0, 4)}
          viewerAvatarUrl={userData.imageURL || undefined}
          artistAvatarUrls={artistImages}
        />
        {isLoading && !noteTracks.length ? (
          <ActivityIndicator color="#1DB954" style={styles.loading} />
        ) : null}
        {!isLoading && !noteTracks.length ? (
          <Text style={styles.empty}>Novas seleções aparecem aqui conforme você ouve música.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  content: { paddingBottom: BOTTOM_NAVIGATION_HEIGHT + 72 },
  loading: { marginTop: 48 },
  empty: {
    color: '#8E8E93',
    fontSize: 14,
    fontFamily: 'SF-Regular',
    lineHeight: 20,
    paddingHorizontal: 24,
    paddingVertical: 48,
    textAlign: 'center',
  },
});
