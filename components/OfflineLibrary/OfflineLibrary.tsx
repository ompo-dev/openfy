/**
 * OfflineLibrary screen
 * Shows all locally downloaded tracks with play button
 */

import * as React from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { getDownloadedTracks, deleteDownloadedTrack, DownloadedTrack } from '@services';
import { usePlayer } from '@context';
import { COLORS } from '@config';
import { useFocusEffect } from 'expo-router';

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
      <Pressable
        style={styles.trackItem}
        onPress={() => handlePlay(item)}
      >
        {item.imageURL ? (
          <Image source={{ uri: item.imageURL }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <Ionicons name="musical-note" size={20} color="#555" />
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
              size={10}
              color="#1DB954"
            />
            <Text style={styles.artist} numberOfLines={1}>
              {item.artistName} • {item.albumName}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => handlePlay(item)}
          style={styles.playIconButton}
          hitSlop={8}
        >
          <Ionicons
            name={isPlaying ? 'pause-circle' : 'play-circle'}
            size={28}
            color="#1DB954"
          />
        </Pressable>

        <Pressable
          onPress={() => handleDelete(item.spotifyId)}
          style={styles.deleteButton}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={18} color="#FF4444" />
        </Pressable>
      </Pressable>
    );
  };

  if (tracks.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="download-outline" size={52} color="#555" />
        <Text style={styles.emptyTitle}>Nenhuma música baixada</Text>
        <Text style={styles.emptySubtitle}>
          Use o botão + para importar e baixar músicas do Spotify
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        {tracks.length} {tracks.length === 1 ? 'música' : 'músicas'} baixada
        {tracks.length !== 1 ? 's' : ''}
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
    color: '#A0A0A0',
    fontSize: 13,
    fontFamily: 'SF-Regular',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#282828',
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 4,
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
    color: '#A0A0A0',
    fontSize: 12,
    fontFamily: 'SF-Regular',
    flex: 1,
  },
  playIconButton: {
    padding: 6,
    marginRight: 4,
  },
  deleteButton: {
    padding: 8,
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
    color: '#A0A0A0',
    fontSize: 14,
    fontFamily: 'SF-Regular',
    textAlign: 'center',
  },
});
