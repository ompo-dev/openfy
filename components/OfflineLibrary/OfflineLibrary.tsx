/** Local songs and imported playlists shown in the Library tab. */

import * as React from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';

import {
  deleteDownloadedTrack,
  getDownloadedTracks,
  getLocalPlaylists,
  removeTrackFromLocalPlaylists,
  type DownloadedTrack,
  type LocalPlaylist,
} from '@services';
import { useLibrarySelectedCategory, usePlayer } from '@context';
import { BOTTOM_NAVIGATION_HEIGHT } from '@config';
import { LoggedPressable } from '../native';
import { PlaylistMosaic } from '../PlaylistMosaic';
import { SoundWaveIcon } from '../Home/FriendActivityStatus/NoteBubble';

type LocalCollection = {
  id: string;
  title: string;
  subtitle: string;
  imageURL: string;
  tracks: DownloadedTrack[];
};

const toPlayerTrack = (track: DownloadedTrack) => ({
  spotifyId: track.spotifyId,
  title: track.title,
  artistName: track.artistName,
  albumName: track.albumName,
  imageURL: track.localImagePath || track.imageURL,
  localAudioPath: track.localAudioPath,
  streamUrl: track.audioUrl,
  duration_ms: track.duration_ms,
});

export const OfflineLibrary = () => {
  const router = useRouter();
  const [tracks, setTracks] = React.useState<DownloadedTrack[]>([]);
  const [playlists, setPlaylists] = React.useState<LocalPlaylist[]>([]);
  const { playDownloadedTrack, playWithQueue, currentTrack, playerState } = usePlayer();
  const {
    libraryRevision,
    librarySearchQuery,
    librarySort,
    libraryView,
  } = useLibrarySelectedCategory();

  const loadLibrary = React.useCallback(async () => {
    const [downloaded, localPlaylists] = await Promise.all([
      getDownloadedTracks(),
      getLocalPlaylists(),
    ]);
    setTracks([...downloaded].reverse());
    setPlaylists(
      [...localPlaylists].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      )
    );
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadLibrary();
    }, [loadLibrary])
  );

  React.useEffect(() => {
    loadLibrary();
  }, [libraryRevision, loadLibrary]);

  const handlePlay = async (track: DownloadedTrack) => {
    await playDownloadedTrack(track);
  };

  const handleDelete = async (spotifyId: string) => {
    await deleteDownloadedTrack(spotifyId);
    await removeTrackFromLocalPlaylists(spotifyId);
    await loadLibrary();
  };

  const normalizedQuery = librarySearchQuery.trim().toLocaleLowerCase();
  const visibleTracks = React.useMemo(() => {
    const filtered = normalizedQuery
      ? tracks.filter((track) =>
          `${track.title} ${track.artistName}`
            .toLocaleLowerCase()
            .includes(normalizedQuery)
        )
      : tracks;

    return librarySort === 'title'
      ? [...filtered].sort((a, b) => a.title.localeCompare(b.title))
      : filtered;
  }, [librarySort, normalizedQuery, tracks]);
  const visiblePlaylists = React.useMemo(() => {
    const filtered = normalizedQuery
      ? playlists.filter((playlist) =>
          playlist.title.toLocaleLowerCase().includes(normalizedQuery)
        )
      : playlists;

    return librarySort === 'title'
      ? [...filtered].sort((a, b) => a.title.localeCompare(b.title))
      : filtered;
  }, [librarySort, normalizedQuery, playlists]);
  const tracksById = React.useMemo(
    () => new Map(tracks.map((track) => [track.spotifyId, track])),
    [tracks]
  );
  const localAlbums = React.useMemo<LocalCollection[]>(() => {
    const grouped = new Map<string, LocalCollection>();
    tracks.forEach((track) => {
      const title = track.albumName.trim() || 'Singles';
      const id = `${title}\u0000${track.artistName}`.toLocaleLowerCase();
      const current = grouped.get(id);
      grouped.set(
        id,
        current
          ? { ...current, tracks: [...current.tracks, track] }
          : {
              id,
              title,
              subtitle: track.artistName,
              imageURL: track.localImagePath || track.imageURL,
              tracks: [track],
            }
      );
    });
    return [...grouped.values()];
  }, [tracks]);
  const localArtists = React.useMemo<LocalCollection[]>(() => {
    const grouped = new Map<string, LocalCollection>();
    tracks.forEach((track) => {
      track.artistName
        .split(/\s*(?:,|&| feat\.?)\s*/i)
        .filter(Boolean)
        .forEach((artistName) => {
          const title = artistName.trim();
          const id = title.toLocaleLowerCase();
          const current = grouped.get(id);
          grouped.set(
            id,
            current
              ? { ...current, tracks: [...current.tracks, track] }
              : {
                  id,
                  title,
                  subtitle: `${track.albumName || 'Single'}`,
                  imageURL: track.localImagePath || track.imageURL,
                  tracks: [track],
                }
          );
        });
    });
    return [...grouped.values()];
  }, [tracks]);
  const visibleCollections = React.useMemo(() => {
    const collections = libraryView === 'albums' ? localAlbums : localArtists;
    const filtered = normalizedQuery
      ? collections.filter((collection) =>
          `${collection.title} ${collection.subtitle}`
            .toLocaleLowerCase()
            .includes(normalizedQuery)
        )
      : collections;
    return librarySort === 'title'
      ? [...filtered].sort((first, second) => first.title.localeCompare(second.title))
      : filtered;
  }, [librarySort, libraryView, localAlbums, localArtists, normalizedQuery]);

  const renderTrack = ({ item }: { item: DownloadedTrack }) => {
    const isCurrentTrack = currentTrack?.spotifyId === item.spotifyId;
    const isPlaying = isCurrentTrack && playerState.isPlaying;

    return (
      <Swipeable
        overshootRight={false}
        rightThreshold={40}
        renderRightActions={() => (
          <LoggedPressable
            accessibilityRole="button"
            accessibilityLabel={`Excluir ${item.title}`}
            onPress={() => handleDelete(item.spotifyId)}
            style={styles.deleteAction}
          >
            <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
            <Text style={styles.deleteActionLabel}>Excluir</Text>
          </LoggedPressable>
        )}
      >
        <LoggedPressable
          style={styles.trackItem}
          onPress={() => handlePlay(item)}
          accessibilityLabel={`Tocar ${item.title}`}
        >
          <View style={styles.trackContent}>
            {item.imageURL ? (
              <Image source={{ uri: item.imageURL }} style={styles.cover} />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}>
                <Ionicons name="musical-note" size={22} color="#888" />
              </View>
            )}

            <View style={styles.info}>
              <View style={styles.titleRow}>
                {isPlaying ? <SoundWaveIcon color="#1DB954" size={15} /> : null}
                <Text
                  style={[styles.title, isCurrentTrack && styles.titleActive]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
              </View>
              <Text style={styles.artist} numberOfLines={1}>
                {item.artistName}
              </Text>
            </View>

            <View style={styles.actionButton}>
              <Ionicons name="ellipsis-horizontal" size={21} color="#B8B8B8" />
            </View>
          </View>
        </LoggedPressable>
      </Swipeable>
    );
  };

  const renderPlaylist = ({ item }: { item: LocalPlaylist }) => {
    const playlistTracks = item.trackIds
      .map((trackId) => tracksById.get(trackId))
      .filter((track): track is DownloadedTrack => Boolean(track));
    const imageURLs = [
      ...playlistTracks.map((track) => track.imageURL),
      ...(item.coverImageURLs || []),
    ].filter(Boolean);

    return (
      <LoggedPressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir playlist ${item.title}`}
        onPress={() => router.push(`/library/playlist/${item.id}`)}
        style={styles.playlistItem}
      >
        <PlaylistMosaic imageURLs={imageURLs} size={62} />
        <View style={styles.playlistInfo}>
          <Text style={styles.playlistTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.playlistMeta} numberOfLines={1}>
            {playlistTracks.length} de {item.trackIds.length} músicas baixadas
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#8B8B8B" />
      </LoggedPressable>
    );
  };

  const renderCollection = ({ item }: { item: LocalCollection }) => {
    const isArtist = libraryView === 'artists';
    return (
      <LoggedPressable
        accessibilityRole="button"
        accessibilityLabel={`${isArtist ? 'Abrir artista' : 'Tocar álbum'} ${item.title}`}
        onPress={() => {
          if (isArtist) {
            router.push(`/library/artist/local_artist_${encodeURIComponent(item.title)}` as Href);
            return;
          }
          void playWithQueue(item.tracks.map(toPlayerTrack));
        }}
        style={styles.playlistItem}
      >
        {item.imageURL ? (
          <Image source={{ uri: item.imageURL }} style={[styles.collectionCover, isArtist && styles.artistCover]} />
        ) : (
          <View style={[styles.collectionCover, styles.coverFallback, isArtist && styles.artistCover]}>
            <Ionicons name={isArtist ? 'person' : 'disc'} size={22} color="#888" />
          </View>
        )}
        <View style={styles.playlistInfo}>
          <Text style={styles.playlistTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.playlistMeta} numberOfLines={1}>
            {isArtist ? `${item.tracks.length} músicas` : item.subtitle}
          </Text>
        </View>
        <Ionicons name={isArtist ? 'chevron-forward' : 'play'} size={18} color={isArtist ? '#8B8B8B' : '#1DB954'} />
      </LoggedPressable>
    );
  };

  const noResults = (
    <View style={styles.searchEmpty}>
      <Text style={styles.searchEmptyText}>
        {libraryView === 'songs'
          ? 'Nenhuma música encontrada'
          : libraryView === 'playlists'
            ? 'Nenhuma playlist encontrada'
            : libraryView === 'albums'
              ? 'Nenhum álbum encontrado'
              : 'Nenhum artista encontrado'}
      </Text>
    </View>
  );

  if (libraryView === 'songs' && tracks.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="download-outline" size={56} color="#666" />
        <Text style={styles.emptyTitle}>Nenhuma música baixada</Text>
        <Text style={styles.emptySubtitle}>
          Toque no botão + para importar e baixar músicas, playlists e álbuns
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {libraryView === 'songs' ? (
        <FlatList
          data={visibleTracks}
          renderItem={renderTrack}
          keyExtractor={(item) => item.spotifyId}
          contentContainerStyle={[
            styles.list,
            visibleTracks.length === 0 && styles.listEmpty,
          ]}
          ListEmptyComponent={noResults}
          showsVerticalScrollIndicator={false}
        />
      ) : libraryView === 'playlists' ? (
        <FlatList
          data={visiblePlaylists}
          renderItem={renderPlaylist}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            visiblePlaylists.length === 0 && styles.listEmpty,
          ]}
          ListEmptyComponent={noResults}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={visibleCollections}
          renderItem={renderCollection}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            visibleCollections.length === 0 && styles.listEmpty,
          ]}
          ListEmptyComponent={noResults}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: BOTTOM_NAVIGATION_HEIGHT + 96,
  },
  listEmpty: {
    flexGrow: 1,
  },
  trackItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  trackContent: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 62,
    paddingVertical: 9,
    gap: 10,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 4,
  },
  collectionCover: {
    width: 62,
    height: 62,
    borderRadius: 5,
  },
  artistCover: {
    borderRadius: 31,
  },
  coverFallback: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'SF-Semibold',
    fontWeight: '600',
    flexShrink: 1,
  },
  titleActive: {
    color: '#1DB954',
  },
  artist: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    fontFamily: 'SF-Regular',
    flex: 1,
  },
  actionButton: {
    width: 42,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteAction: {
    width: 82,
    marginBottom: StyleSheet.hairlineWidth,
    backgroundColor: '#E5484D',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  deleteActionLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'SF-Semibold',
  },
  playlistItem: {
    minHeight: 82,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  playlistInfo: {
    flex: 1,
    gap: 4,
  },
  playlistTitle: {
    color: '#FFFFFF',
    fontFamily: 'SF-Semibold',
    fontSize: 16,
  },
  playlistMeta: {
    color: 'rgba(255,255,255,0.62)',
    fontFamily: 'SF-Regular',
    fontSize: 12,
  },
  searchEmpty: {
    alignItems: 'center',
    paddingTop: 36,
  },
  searchEmptyText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'SF-Regular',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'SF-Semibold',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    fontFamily: 'SF-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
});
