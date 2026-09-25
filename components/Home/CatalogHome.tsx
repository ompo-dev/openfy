import * as React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { usePlayer } from '@context';
import { useDetailNavigation } from '@hooks';
import type {
  LibraryTrack,
  LocalAlbumCollection,
  LocalPlaylist,
  PersonalizedHomeArtist,
  PersonalizedHomeSnapshot,
  PersonalizedHomeTrack,
} from '@services';
import { LoggedPressable } from '../native';
import { PlaylistMosaic } from '../PlaylistMosaic';
import { SoundWaveIcon } from './FriendActivityStatus/NoteBubble';

const toPlayerTrack = (track: PersonalizedHomeTrack) => ({
  spotifyId: track.spotifyId,
  title: track.title,
  artistName: track.artistName,
  albumName: track.albumName,
  imageURL: track.localImagePath || track.imageURL,
  localAudioPath: track.localAudioPath,
  streamUrl: track.streamUrl,
  streamExpiresAt: track.streamExpiresAt,
  duration_ms: track.duration_ms,
  artists: track.artists,
  albumId: track.albumId,
  albumArtists: track.albumArtists,
  youtubeVideoId: track.youtubeVideoId,
  youtubeUrl: track.youtubeUrl,
});

const TrackShelf = ({
  sourceId,
  title,
  tracks,
}: {
  sourceId: string;
  title: string;
  tracks: PersonalizedHomeTrack[];
}) => {
  const { currentTrack, playerState, playWithQueue } = usePlayer();
  if (!tracks.length) return null;

  const play = (index: number) =>
    playWithQueue(tracks.map(toPlayerTrack), index, sourceId);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView
        contentContainerStyle={styles.horizontalContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {tracks.map((track, index) => {
          const isPlaying =
            currentTrack?.spotifyId === track.spotifyId && playerState.isPlaying;
          return (
            <LoggedPressable
              accessibilityLabel={`Tocar ${track.title}`}
              key={track.spotifyId}
              onPress={() => void play(index)}
              style={styles.trackTile}
            >
              <View style={styles.artworkFrame}>
                {track.localImagePath || track.imageURL ? (
                  <Image
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    source={{ uri: track.localImagePath || track.imageURL }}
                    style={styles.artwork}
                  />
                ) : (
                  <View style={[styles.artwork, styles.fallback]}>
                    <Ionicons color="#929292" name="musical-note" size={28} />
                  </View>
                )}
                {isPlaying ? (
                  <View style={styles.playingBadge}>
                    <SoundWaveIcon color="#101010" size={16} />
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} style={styles.itemTitle}>{track.title}</Text>
              <Text numberOfLines={1} style={styles.itemSubtitle}>{track.artistName}</Text>
            </LoggedPressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const AlbumShelf = ({ albums }: { albums: LocalAlbumCollection[] }) => {
  const { openDetail } = useDetailNavigation();
  if (!albums.length) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Álbuns na sua biblioteca</Text>
      <ScrollView
        contentContainerStyle={styles.horizontalContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {albums.map((album) => (
          <LoggedPressable
            accessibilityLabel={`Abrir álbum ${album.title}`}
            key={album.id}
            onPress={() =>
              openDetail(
                'album',
                `local_album_${encodeURIComponent(album.id)}`,
                'home'
              )
            }
            style={styles.collectionTile}
          >
            {album.imageURL ? (
              <Image
                cachePolicy="memory-disk"
                contentFit="cover"
                source={{ uri: album.imageURL }}
                style={styles.artwork}
              />
            ) : (
              <View style={[styles.artwork, styles.fallback]}>
                <Ionicons color="#929292" name="disc-outline" size={30} />
              </View>
            )}
            <Text numberOfLines={1} style={styles.itemTitle}>{album.title}</Text>
            <Text numberOfLines={1} style={styles.itemSubtitle}>{album.subtitle}</Text>
          </LoggedPressable>
        ))}
      </ScrollView>
    </View>
  );
};

const ArtistShelf = ({ artists }: { artists: PersonalizedHomeArtist[] }) => {
  const { openDetail } = useDetailNavigation();
  if (!artists.length) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Artistas para você</Text>
      <ScrollView
        contentContainerStyle={styles.horizontalContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {artists.map((artist) => (
          <LoggedPressable
            accessibilityLabel={`Abrir artista ${artist.title}`}
            key={artist.id}
            onPress={() =>
              openDetail('artist', artist.spotifyArtistId, 'home')
            }
            style={styles.collectionTile}
          >
            {artist.imageURL ? (
              <Image
                cachePolicy="memory-disk"
                contentFit="cover"
                source={{ uri: artist.imageURL }}
                style={[styles.artwork, styles.artistArtwork]}
              />
            ) : (
              <View style={[styles.artwork, styles.artistArtwork, styles.fallback]}>
                <Ionicons color="#929292" name="person" size={30} />
              </View>
            )}
            <Text numberOfLines={1} style={[styles.itemTitle, styles.artistTitle]}>
              {artist.title}
            </Text>
            <Text numberOfLines={1} style={[styles.itemSubtitle, styles.artistTitle]}>
              Recomendado para você
            </Text>
          </LoggedPressable>
        ))}
      </ScrollView>
    </View>
  );
};

const PlaylistShelf = ({
  playlists,
  tracksById,
}: {
  playlists: LocalPlaylist[];
  tracksById: Map<string, LibraryTrack>;
}) => {
  const { openDetail } = useDetailNavigation();
  if (!playlists.length) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Suas playlists</Text>
      <ScrollView
        contentContainerStyle={styles.horizontalContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {playlists.map((playlist) => {
          const playlistTracks = playlist.trackIds
            .map((id) => tracksById.get(id))
            .filter((track): track is LibraryTrack => Boolean(track));
          const images = [
            ...playlistTracks.map((track) => track.localImagePath || track.imageURL),
            ...(playlist.coverImageURLs || []),
          ].filter((url): url is string => Boolean(url));
          return (
            <LoggedPressable
              accessibilityLabel={`Abrir playlist ${playlist.title}`}
              key={playlist.id}
              onPress={() =>
                openDetail('playlist', playlist.id, 'home')
              }
              style={styles.collectionTile}
            >
              <PlaylistMosaic imageURLs={[...new Set(images)]} size={104} />
              <Text numberOfLines={1} style={styles.itemTitle}>{playlist.title}</Text>
              <Text numberOfLines={1} style={styles.itemSubtitle}>
                {playlistTracks.length} {playlistTracks.length === 1 ? 'música' : 'músicas'}
              </Text>
            </LoggedPressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

export const CatalogHome = ({ home }: { home: PersonalizedHomeSnapshot }) => {
  if (
    !home.continueListening.length &&
    !home.quickPicks.length &&
    !home.albums.length &&
    !home.artists.length &&
    !home.playlists.length
  ) return null;

  return (
    <View style={styles.container}>
      <TrackShelf
        sourceId="home:continue-listening"
        title="Ouça novamente"
        tracks={home.continueListening}
      />
      <TrackShelf
        sourceId="home:quick-picks"
        title="Escolhas rápidas"
        tracks={home.quickPicks}
      />
      <AlbumShelf albums={home.albums} />
      <ArtistShelf artists={home.artists} />
      <PlaylistShelf playlists={home.playlists} tracksById={home.tracksById} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 22,
    paddingBottom: 18,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontFamily: 'SF-Bold',
    fontSize: 18,
    paddingHorizontal: 16,
  },
  horizontalContent: {
    gap: 12,
    paddingHorizontal: 16,
  },
  trackTile: {
    gap: 4,
    width: 104,
  },
  collectionTile: {
    gap: 4,
    width: 104,
  },
  artworkFrame: {
    height: 104,
    position: 'relative',
    width: 104,
  },
  artwork: {
    borderRadius: 6,
    height: 104,
    width: 104,
  },
  artistArtwork: { borderRadius: 52 },
  artistTitle: { textAlign: 'center' },
  fallback: {
    alignItems: 'center',
    backgroundColor: '#282828',
    justifyContent: 'center',
  },
  playingBadge: {
    alignItems: 'center',
    backgroundColor: '#1ED760',
    borderRadius: 18,
    bottom: 6,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    right: 6,
    width: 30,
  },
  itemTitle: {
    color: '#FFFFFF',
    fontFamily: 'SF-Semibold',
    fontSize: 14,
    paddingTop: 3,
  },
  itemSubtitle: {
    color: 'rgba(255,255,255,0.62)',
    fontFamily: 'SF-Regular',
    fontSize: 12,
  },
});
