import * as React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Href, useFocusEffect, useRouter } from 'expo-router';

import { useLibrarySelectedCategory, usePlayer } from '@context';
import type { CanonicalTrack } from '../../models/CanonicalTrack';
import {
  getContinueListening,
  getLibraryTracks,
  getLocalPlaylists,
  groupLocalAlbums,
  type LibraryTrack,
  type LocalAlbumCollection,
  type LocalPlaylist,
} from '@services';
import { LoggedPressable } from '../native';
import { PlaylistMosaic } from '../PlaylistMosaic';
import { SoundWaveIcon } from './FriendActivityStatus/NoteBubble';

type CatalogHomeState = {
  continueListening: LibraryTrack[];
  quickPicks: LibraryTrack[];
  albums: LocalAlbumCollection[];
  playlists: LocalPlaylist[];
};

const EMPTY_STATE: CatalogHomeState = {
  continueListening: [],
  quickPicks: [],
  albums: [],
  playlists: [],
};

const toPlayerTrack = (track: LibraryTrack) => ({
  spotifyId: track.spotifyId,
  title: track.title,
  artistName: track.artistName,
  albumName: track.albumName,
  imageURL: track.localImagePath || track.imageURL,
  localAudioPath: track.localAudioPath,
  streamUrl: track.audioUrl,
  duration_ms: track.duration_ms,
  artists: track.artists,
  albumId: track.albumId,
  albumArtists: track.albumArtists,
  youtubeVideoId: track.youtubeVideoId,
  youtubeUrl: track.youtubeUrl,
});

const diverseTracks = (tracks: LibraryTrack[], limit: number) => {
  const result: LibraryTrack[] = [];
  const seenArtists = new Set<string>();
  for (const track of tracks) {
    const artist = track.artistName.trim().toLocaleLowerCase();
    if (seenArtists.has(artist)) continue;
    seenArtists.add(artist);
    result.push(track);
    if (result.length === limit) return result;
  }
  for (const track of tracks) {
    if (result.some((candidate) => candidate.spotifyId === track.spotifyId)) continue;
    result.push(track);
    if (result.length === limit) break;
  }
  return result;
};

const recentTrack = (
  track: CanonicalTrack,
  saved?: LibraryTrack
): LibraryTrack => saved || {
  id: `recent_${track.spotifyId}`,
  spotifyId: track.spotifyId,
  title: track.title,
  artistName: track.primaryArtist || track.artists.join(', '),
  artists: track.artists.map((name) => ({ id: '', name })),
  albumName: track.albumName || 'Single',
  imageURL: track.imageURL || '',
  duration_ms: track.durationMs || 0,
  sourcePlatform: track.spotifyId.startsWith('yt_') ? 'youtube' : 'spotify',
  addedAt: track.createdAt,
  updatedAt: track.updatedAt,
  localAudioPath: track.localAudioPath,
  localImagePath: track.localImagePath,
  isDownloaded: Boolean(track.localAudioPath),
};

const TrackShelf = ({
  sourceId,
  title,
  tracks,
}: {
  sourceId: string;
  title: string;
  tracks: LibraryTrack[];
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
  const router = useRouter();
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
              router.push(
                `/(tabs)/home/album/local_album_${encodeURIComponent(album.id)}` as Href
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

const PlaylistShelf = ({
  playlists,
  tracksById,
}: {
  playlists: LocalPlaylist[];
  tracksById: Map<string, LibraryTrack>;
}) => {
  const router = useRouter();
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
                router.push(`/(tabs)/home/playlist/${playlist.id}` as Href)
              }
              style={styles.collectionTile}
            >
              <PlaylistMosaic imageURLs={[...new Set(images)]} size={142} />
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

export const CatalogHome = () => {
  const { libraryRevision } = useLibrarySelectedCategory();
  const [state, setState] = React.useState<CatalogHomeState>(EMPTY_STATE);
  const [tracksById, setTracksById] = React.useState(new Map<string, LibraryTrack>());

  const load = React.useCallback(async () => {
    const [tracks, playlists, recent] = await Promise.all([
      getLibraryTracks(),
      getLocalPlaylists(),
      getContinueListening(),
    ]);
    const byId = new Map(tracks.map((track) => [track.spotifyId, track]));
    const recentTracks = recent
      .map((track) => recentTrack(track, byId.get(track.spotifyId)));
    const latest = [...tracks].sort((first, second) =>
      second.updatedAt.localeCompare(first.updatedAt)
    );
    const recentIds = new Set(recentTracks.map((track) => track.spotifyId));
    const quickPool = latest.filter((track) => !recentIds.has(track.spotifyId));
    const albums = groupLocalAlbums(tracks)
      .sort((first, second) => {
        const firstDate = Math.max(...first.tracks.map((track) => Date.parse(track.updatedAt) || 0));
        const secondDate = Math.max(...second.tracks.map((track) => Date.parse(track.updatedAt) || 0));
        return secondDate - firstDate;
      })
      .slice(0, 10);
    setTracksById(byId);
    setState({
      continueListening: recentTracks.slice(0, 10),
      quickPicks: diverseTracks(quickPool.length ? quickPool : latest, 10),
      albums,
      playlists: [...playlists]
        .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
        .slice(0, 10),
    });
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load])
  );

  React.useEffect(() => {
    void load();
  }, [libraryRevision, load]);

  if (
    !state.continueListening.length &&
    !state.quickPicks.length &&
    !state.albums.length &&
    !state.playlists.length
  ) return null;

  return (
    <View style={styles.container}>
      <TrackShelf
        sourceId="home:continue-listening"
        title="Ouça novamente"
        tracks={state.continueListening}
      />
      <TrackShelf
        sourceId="home:quick-picks"
        title="Escolhas rápidas"
        tracks={state.quickPicks}
      />
      <AlbumShelf albums={state.albums} />
      <PlaylistShelf playlists={state.playlists} tracksById={tracksById} />
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
    fontSize: 20,
    paddingHorizontal: 16,
  },
  horizontalContent: {
    gap: 12,
    paddingHorizontal: 16,
  },
  trackTile: {
    gap: 4,
    width: 142,
  },
  collectionTile: {
    gap: 4,
    width: 142,
  },
  artworkFrame: {
    height: 142,
    position: 'relative',
    width: 142,
  },
  artwork: {
    borderRadius: 6,
    height: 142,
    width: 142,
  },
  fallback: {
    alignItems: 'center',
    backgroundColor: '#282828',
    justifyContent: 'center',
  },
  playingBadge: {
    alignItems: 'center',
    backgroundColor: '#1ED760',
    borderRadius: 18,
    bottom: 8,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    width: 36,
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
