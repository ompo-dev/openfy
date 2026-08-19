/**
 * OfflineLibrary screen
 * Shows all locally downloaded tracks with play button and Liquid Glass item styling
 */

import * as React from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { getDownloadedTracks, deleteDownloadedTrack, DownloadedTrack } from '@services';
import { usePlayer } from '@context';
import { useFocusEffect } from 'expo-router';
import { GlassSurface, LoggedPressable } from '../native';

export const OfflineLibrary = () => {
  const [tracks, setTracks] = React.useState<DownloadedTrack[]>([]);
  const { playDownloadedTrack, currentTrack, playerState } = usePlayer();

  const loadTracks = React.useCallback(async () => {
    const downloaded = await getDownloadedTracks();
    // Sort by most recently downloaded
    setTracks([...downloaded].reverse());
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadTracks();
    }, [loadTracks])
  );

  const handlePlay = async (track: DownloadedTrack) => {
    await playDownloadedTrack(track);
  };

  const handleDelete = async (spotifyId: string) => {
    await deleteDownloadedTrack(spotifyId);
    await loadTracks();
  };

  const renderItem = ({ item }: { item: DownloadedTrack }) => {
    const isCurrentTrack = currentTrack?.spotifyId === item.spotifyId;
    const isPlaying = isCurrentTrack && playerState.isPlaying;

    return (
      <LoggedPressable
        style={styles.trackItem}
        onPress={() => handlePlay(item)}
        accessibilityLabel={`Tocar ${item.title}`}
      >
        <GlassSurface glass="regular" isInteractive style={styles.trackGlass}>
          <View style={styles.trackContent}>
            {item.imageURL ? (
              <Image source={{ uri: item.imageURL }} style={styles.cover} />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}>
                <Ionicons name="musical-note" size={20} color="#888" />
              </View>
            )}

            <View style={styles.info}>
              <Text
                style={[styles.title, isCurrentTrack && styles.titleActive]}
                numberOfLines={1}
              >
                {isCurrentTrack && (
                  <Ionicons
                    name={isPlaying ? 'volume-high' : 'pause'}
                    size={12}
                    color="#1DB954"
                  />
                )}{' '}
                {item.title}
              </Text>
              <View style={styles.meta}>
                <MaterialCommunityIcons
                  name="arrow-down-bold"
                  size={12}
                  color="#1DB954"
                />
                <Text style={styles.artist} numberOfLines={1}>
                  {item.artistName} • {item.albumName}
                </Text>
              </View>
            </View>

            <LoggedPressable
              onPress={() => handlePlay(item)}
              style={styles.playIconButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pausar' : 'Tocar'}
            >
              <Ionicons
                name={isPlaying ? 'pause-circle' : 'play-circle'}
                size={32}
                color="#1DB954"
              />
            </LoggedPressable>

            <LoggedPressable
              onPress={() => handleDelete(item.spotifyId)}
              style={styles.deleteButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Excluir música baixada"
            >
              <Ionicons name="trash-outline" size={18} color="#FF4444" />
            </LoggedPressable>
          </View>
        </GlassSurface>
      </LoggedPressable>
    );
  };

  if (tracks.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="download-outline" size={56} color="#666" />
        <Text style={styles.emptyTitle}>Nenhuma música baixada</Text>
        <Text style={styles.emptySubtitle}>
          Toque no botão + na Library para importar e baixar músicas, playlists e álbuns
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        {tracks.length} {tracks.length === 1 ? 'música' : 'músicas'} baixada
        {tracks.length !== 1 ? 's' : ''} • Offline
      </Text>
      <FlatList
        data={tracks}
        renderItem={renderItem}
        keyExtractor={(item) => item.spotifyId}
        contentContainerStyle={styles.list}
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
  header: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    fontFamily: 'SF-Semibold',
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 110,
    gap: 8,
  },
  trackItem: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  trackGlass: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  trackContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 12,
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  coverFallback: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SF-Semibold',
    fontWeight: '600',
  },
  titleActive: {
    color: '#1DB954',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  artist: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    fontFamily: 'SF-Regular',
    flex: 1,
  },
  playIconButton: {
    padding: 4,
  },
  deleteButton: {
    padding: 6,
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
