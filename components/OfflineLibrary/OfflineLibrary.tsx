/** Local songs and imported playlists shown in the Library tab. */

import * as React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { getSpotifyArtistImage } from '../../services/metadata/spotifyMetadata';

import {
  deleteDownloadedTrack,
  getCachedArtistImage,
  getLibraryTracks,
  repairDownloadedTrackMetadata,
  groupLocalAlbums,
  groupLocalArtists,
  getLocalPlaylists,
  toDownloadTrackInput,
  type LibraryTrack,
  type LocalPlaylist,
} from '@services';
import { useDownloads, useLibrarySelectedCategory, usePlayer } from '@context';
import { useDetailNavigation } from '@hooks';
import { BOTTOM_NAVIGATION_HEIGHT } from '@config';
import { LoggedPressable } from '../native';
import { PlaylistMosaic } from '../PlaylistMosaic';
import { SoundWaveIcon } from '../Home/FriendActivityStatus/NoteBubble';

const toPlayerTrack = (track: LibraryTrack) => ({
  ...track,
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
  const { openDetail } = useDetailNavigation();
  const [tracks, setTracks] = React.useState<LibraryTrack[]>([]);
  const [playlists, setPlaylists] = React.useState<LocalPlaylist[]>([]);
  const [artistImageURLs, setArtistImageURLs] = React.useState<Record<string, string>>({});
  const requestedArtistImages = React.useRef(new Set<string>());
  const { playWithQueue, currentTrack, playerState } = usePlayer();
  const { clearCompletedDownloads, downloads, enqueueDownloads } = useDownloads();
  const downloadsById = React.useMemo(
    () => new Map(downloads.map((download) => [download.spotifyId, download])),
    [downloads]
  );
  const {
    libraryRevision,
    librarySearchQuery,
    librarySort,
    libraryView,
  } = useLibrarySelectedCategory();

  const loadLibrary = React.useCallback(async () => {
    const [downloaded, localPlaylists] = await Promise.all([
      getLibraryTracks(),
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

  React.useEffect(() => {
    let active = true;
    void repairDownloadedTrackMetadata(() => {
      if (active) void loadLibrary();
    });
    return () => { active = false; };
  }, [libraryRevision, loadLibrary]);

  const handleDelete = async (spotifyId: string) => {
    await deleteDownloadedTrack(spotifyId);
    clearCompletedDownloads();
    await loadLibrary();
  };

  const handleDownload = React.useCallback(
    (track: LibraryTrack) => {
      if (track.isDownloaded) return;
      enqueueDownloads([toDownloadTrackInput(track)]);
    },
    [enqueueDownloads]
  );

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
  const handlePlay = async (startIndex: number) => {
    await playWithQueue(
      visibleTracks.map(toPlayerTrack),
      startIndex,
      'library:songs'
    );
  };
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
  const localAlbums = React.useMemo(() => groupLocalAlbums(tracks), [tracks]);
  const localArtists = React.useMemo(() => groupLocalArtists(tracks), [tracks]);
  React.useEffect(() => {
    const artistsToLoad = localArtists.filter(
      (artist) =>
        Boolean(artist.spotifyArtistId) &&
        !requestedArtistImages.current.has(artist.id)
    );
    if (artistsToLoad.length === 0) return;

    let active = true;
    void Promise.all(
      artistsToLoad.map(async (artist) => ({
        id: artist.id,
        imageURL: await getCachedArtistImage(artist.id, () =>
          getSpotifyArtistImage(artist.spotifyArtistId!)
        ),
      }))
    ).then((images) => {
      if (!active) return;
      const resolvedImages = images.filter(
        (image): image is { id: string; imageURL: string } => Boolean(image.imageURL)
      );
      if (resolvedImages.length === 0) return;
      images.forEach((image) => requestedArtistImages.current.add(image.id));
      setArtistImageURLs((current) => ({
        ...current,
        ...Object.fromEntries(
          resolvedImages.map((image) => [image.id, image.imageURL])
        ),
      }));
    });

    return () => {
      active = false;
    };
  }, [localArtists]);
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

  const renderTrack = ({ item, index }: { item: LibraryTrack; index: number }) => {
    const isCurrentTrack = currentTrack?.spotifyId === item.spotifyId;
    const isPlaying = isCurrentTrack && playerState.isPlaying;
    const download = downloadsById.get(item.spotifyId);
    const isDownloading =
      download?.status === 'queued' ||
      download?.status === 'resolving' ||
      download?.status === 'downloading';
    const isComplete = item.isDownloaded || download?.status === 'completed';

    const row = (
      <LoggedPressable
        style={styles.trackItem}
        onPress={() => void handlePlay(index)}
        accessibilityLabel={`Tocar ${item.title}`}
      >
        <View style={styles.trackContent}>
          {item.localImagePath || item.imageURL ? (
            <Image
              cachePolicy="memory-disk"
              source={{ uri: item.localImagePath || item.imageURL }}
              style={styles.cover}
            />
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

          <LoggedPressable
            accessibilityRole="button"
            accessibilityLabel={
              isComplete
                ? `${item.title} está baixada`
                : `Baixar ${item.title}`
            }
            disabled={isComplete || isDownloading}
            onPress={(event) => {
              event.stopPropagation();
              handleDownload(item);
            }}
            style={styles.actionButton}
          >
            <Ionicons
              name={
                isComplete
                  ? 'checkmark-circle'
                  : isDownloading
                    ? 'time-outline'
                    : 'download-outline'
              }
              size={21}
              color={isComplete ? '#1DB954' : '#B8B8B8'}
            />
          </LoggedPressable>
        </View>
      </LoggedPressable>
    );

    if (!item.isDownloaded) return row;
    return (
      <Swipeable
        overshootRight={false}
        rightThreshold={40}
        renderRightActions={() => (
          <LoggedPressable
            accessibilityRole="button"
            accessibilityLabel={`Remover download de ${item.title}`}
            onPress={() => handleDelete(item.spotifyId)}
            style={styles.deleteAction}
          >
            <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
            <Text style={styles.deleteActionLabel}>Remover download</Text>
          </LoggedPressable>
        )}
      >
        {row}
      </Swipeable>
    );
  };

  const renderPlaylist = ({ item }: { item: LocalPlaylist }) => {
    const playlistTracks = item.trackIds
      .map((trackId) => tracksById.get(trackId))
      .filter((track): track is LibraryTrack => Boolean(track));
    const imageURLs = [...new Set([
      ...playlistTracks.map((track) => track.localImagePath || track.imageURL),
      ...(item.coverImageURLs || []),
    ].filter((url): url is string => Boolean(url)))];

    return (
      <LoggedPressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir playlist ${item.title}`}
        onPress={() => openDetail('playlist', item.id, 'library')}
        style={styles.playlistItem}
      >
        <PlaylistMosaic imageURLs={imageURLs} size={62} />
        <View style={styles.playlistInfo}>
          <Text style={styles.playlistTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.playlistMeta} numberOfLines={1}>
            {playlistTracks.length} {playlistTracks.length === 1 ? 'música' : 'músicas'} ·{' '}
            {playlistTracks.filter((track) => track.isDownloaded).length} baixadas
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#8B8B8B" />
      </LoggedPressable>
    );
  };

  const renderCollection = ({ item }: { item: (typeof visibleCollections)[number] }) => {
    const isArtist = libraryView === 'artists';
    const imageURL = isArtist ? artistImageURLs[item.id] || '' : item.imageURL;
    return (
      <LoggedPressable
        accessibilityRole="button"
        accessibilityLabel={`${isArtist ? 'Abrir artista' : 'Abrir álbum'} ${item.title}`}
        onPress={() => {
          if (isArtist) {
            openDetail(
              'artist',
              `local_artist_${encodeURIComponent(item.id)}`,
              'library'
            );
            return;
          }
          openDetail(
            'album',
            `local_album_${encodeURIComponent(item.id)}`,
            'library'
          );
        }}
        style={styles.playlistItem}
      >
        {imageURL ? (
          <Image
            cachePolicy="memory-disk"
            source={{ uri: imageURL }}
            style={[styles.collectionCover, isArtist && styles.artistCover]}
          />
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
        <Ionicons name="chevron-forward" size={18} color="#8B8B8B" />
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
        <Ionicons name="musical-notes-outline" size={56} color="#666" />
        <Text style={styles.emptyTitle}>Sua biblioteca está vazia</Text>
        <Text style={styles.emptySubtitle}>
          Toque no botão + para adicionar músicas, playlists e álbuns. O download é opcional.
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
    width: 112,
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
