import * as React from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import {
  getDownloadedTracks,
  getLocalPlaylist,
  type DownloadedTrack,
  type LocalPlaylist as LocalPlaylistModel,
} from '@services';
import { usePlayer } from '@context';
import { BOTTOM_NAVIGATION_HEIGHT } from '@config';
import { LoggedPressable, NativeIconButton } from '../native';
import { PlaylistMosaic } from '../PlaylistMosaic';

export const LocalPlaylist = ({ playlistId }: { playlistId: string }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { playDownloadedTrack, playWithQueue, currentTrack, playerState } = usePlayer();
  const [playlist, setPlaylist] = React.useState<LocalPlaylistModel | null>(null);
  const [tracks, setTracks] = React.useState<DownloadedTrack[]>([]);

  const loadPlaylist = React.useCallback(async () => {
    const [localPlaylist, downloaded] = await Promise.all([
      getLocalPlaylist(playlistId),
      getDownloadedTracks(),
    ]);
    setPlaylist(localPlaylist);
    const downloadedById = new Map(
      downloaded.map((track) => [track.spotifyId, track])
    );
    setTracks(
      localPlaylist
        ? localPlaylist.trackIds
            .map((trackId) => downloadedById.get(trackId))
            .filter((track): track is DownloadedTrack => Boolean(track))
        : []
    );
  }, [playlistId]);

  useFocusEffect(
    React.useCallback(() => {
      loadPlaylist();
    }, [loadPlaylist])
  );

  const handlePlay = async (track: DownloadedTrack) => {
    await playDownloadedTrack(track);
  };

  const handlePlayPlaylist = async () => {
    if (tracks.length === 0) return;
    await playWithQueue(
      tracks.map((track) => ({
        spotifyId: track.spotifyId,
        title: track.title,
        artistName: track.artistName,
        albumName: track.albumName,
        imageURL: track.localImagePath || track.imageURL,
        localAudioPath: track.localAudioPath,
        duration_ms: track.duration_ms,
      }))
    );
  };

  if (!playlist) {
    return <View style={styles.container} />;
  }

  const imageURLs = [
    ...tracks.map((track) => track.imageURL),
    ...(playlist.coverImageURLs || []),
  ].filter(Boolean);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#3A3A3A', '#171717', '#121212']}
        locations={[0, 0.58, 1]}
        style={styles.background}
      />
      <FlatList
        data={tracks}
        keyExtractor={(item) => item.spotifyId}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 10 },
          tracks.length === 0 && styles.contentEmpty,
        ]}
        ListHeaderComponent={
          <>
            <View style={styles.topBar}>
              <NativeIconButton
                systemImage="chevron.left"
                iconName="chevron-back"
                label="Voltar"
                size={38}
                onPress={() => router.back()}
              />
            </View>
            <View style={styles.hero}>
              <PlaylistMosaic imageURLs={imageURLs} size={148} />
              <Text style={styles.title}>{playlist.title}</Text>
              <Text style={styles.subtitle}>
                Playlist importada · {tracks.length} de {playlist.trackIds.length} músicas baixadas
              </Text>
              <View style={styles.playRow}>
                <View style={styles.sourcePill}>
                  <Ionicons name="musical-notes" size={15} color="#D0D0D0" />
                  <Text style={styles.sourceText}>
                    {playlist.sourcePlatform === 'spotify' ? 'Spotify' : 'YouTube'}
                  </Text>
                </View>
                <NativeIconButton
                  systemImage="play.fill"
                  iconName="play"
                  label="Tocar playlist"
                  size={48}
                  onPress={handlePlayPlaylist}
                />
              </View>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Baixe músicas desta playlist para ouvir aqui.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isCurrent = currentTrack?.spotifyId === item.spotifyId;
          return (
            <LoggedPressable
              onPress={() => handlePlay(item)}
              accessibilityLabel={`Tocar ${item.title}`}
              style={styles.trackRow}
            >
              {item.imageURL ? (
                <Image source={{ uri: item.imageURL }} style={styles.trackCover} />
              ) : (
                <PlaylistMosaic imageURLs={[]} size={48} />
              )}
              <View style={styles.trackInfo}>
                <Text
                  numberOfLines={1}
                  style={[styles.trackTitle, isCurrent && styles.trackTitleActive]}
                >
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={styles.trackArtist}>
                  {item.artistName}
                </Text>
              </View>
              {isCurrent && playerState.isPlaying ? (
                <Ionicons name="volume-high" size={19} color="#1DB954" />
              ) : null}
            </LoggedPressable>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  background: {
    ...(StyleSheet.absoluteFill as any),
    height: 470,
  },
  content: {
    paddingHorizontal: 14,
    paddingBottom: BOTTOM_NAVIGATION_HEIGHT + 96,
  },
  contentEmpty: {
    flexGrow: 1,
  },
  topBar: {
    height: 42,
    alignItems: 'flex-start',
  },
  hero: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 20,
    gap: 8,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'SF-Bold',
    fontSize: 25,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: 'SF-Regular',
    fontSize: 13,
    textAlign: 'center',
  },
  playRow: {
    width: '100%',
    minHeight: 52,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  sourceText: {
    color: '#E0E0E0',
    fontFamily: 'SF-Semibold',
    fontSize: 12,
  },
  trackRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.13)',
  },
  trackInfo: {
    flex: 1,
    gap: 3,
  },
  trackCover: {
    width: 48,
    height: 48,
    borderRadius: 4,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontFamily: 'SF-Semibold',
    fontSize: 15,
  },
  trackTitleActive: {
    color: '#1DB954',
  },
  trackArtist: {
    color: 'rgba(255,255,255,0.62)',
    fontFamily: 'SF-Regular',
    fontSize: 12,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 42,
    paddingHorizontal: 36,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'SF-Regular',
    fontSize: 14,
    textAlign: 'center',
  },
});
