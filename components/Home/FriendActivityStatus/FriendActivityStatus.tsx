/**
 * FriendActivityStatus Component
 * Real-time friend listening status with floating speech bubbles and avatar circles.
 * Inspired by Instagram Stories & Spotify Social Listening.
 */

import * as React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePlayer } from '@context';
import { LoggedPressable } from '../../native';

export interface FriendStatusItem {
  id: string;
  user: {
    name: string;
    username: string;
    avatarUrl: string;
    isCurrentUser?: boolean;
  };
  track: {
    spotifyId: string;
    title: string;
    artist: string;
    albumName?: string;
    imageUrl: string;
    duration_ms: number;
    bubbleColor: string;
  };
}

const FRIEND_STATUSES: FriendStatusItem[] = [
  {
    id: 'status_user',
    user: {
      name: 'Você',
      username: 'Your Activity',
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      isCurrentUser: true,
    },
    track: {
      spotifyId: '0VjIjW4GlUZAMYd2vXMi3b',
      title: 'Too Late',
      artist: 'The Weeknd',
      albumName: 'After Hours',
      imageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36',
      duration_ms: 239000,
      bubbleColor: '#A15D25', // Warm caramel amber
    },
  },
  {
    id: 'status_tyler',
    user: {
      name: 'Tyler',
      username: 'tylerthedev',
      avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
    },
    track: {
      spotifyId: '4w47dntseeMeuLPzFTKKB9',
      title: 'Who Knows',
      artist: 'Daniel Caesar',
      albumName: 'NEVER ENOUGH',
      imageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b2737e10812d9b103f2656dc91c6',
      duration_ms: 198000,
      bubbleColor: '#7A0C1E', // Deep crimson wine
    },
  },
  {
    id: 'status_southwest',
    user: {
      name: 'Southwest',
      username: 'southwest',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    },
    track: {
      spotifyId: '0d28khcov9ApubBr0GQbfS',
      title: 'Big Brother',
      artist: 'Kanye West',
      albumName: 'Graduation',
      imageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27326f7f19c7f0381e56156c94a',
      duration_ms: 287000,
      bubbleColor: '#511C40', // Deep plum/violet
    },
  },
  {
    id: 'status_kali',
    user: {
      name: 'Kali',
      username: 'cowbokali',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    },
    track: {
      spotifyId: '6dOtVTDmmpzgGQ9qd0RMiZ',
      title: 'Lose My Cool',
      artist: 'Kali Uchis',
      albumName: 'ORQUÍDEAS',
      imageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27371d62ea7ea8a5be92d3c1f62',
      duration_ms: 195000,
      bubbleColor: '#A85B6B', // Dusty Rose / Mauve
    },
  },
  {
    id: 'status_drake',
    user: {
      name: 'Aubrey',
      username: 'champagnepapi',
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    },
    track: {
      spotifyId: '6DCZcSspjsKoFjzjrWoCdn',
      title: 'Headlines',
      artist: 'Drake',
      albumName: 'Take Care',
      imageUrl: 'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27326f7f19c7f0381e56156c94a',
      duration_ms: 236000,
      bubbleColor: '#1E3A8A', // Deep Midnight Blue
    },
  },
];

export const FriendActivityStatus = () => {
  const { playTrack, currentTrack, playerState } = usePlayer();

  const handlePressStatus = (item: FriendStatusItem) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    playTrack({
      spotifyId: item.track.spotifyId,
      title: item.track.title,
      artistName: item.track.artist,
      albumName: item.track.albumName || 'Single',
      imageURL: item.track.imageUrl,
      duration_ms: item.track.duration_ms,
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {FRIEND_STATUSES.map((item) => {
          const isPlaying =
            currentTrack?.spotifyId === item.track.spotifyId &&
            playerState.isPlaying;

          return (
            <LoggedPressable
              key={item.id}
              style={styles.itemWrapper}
              onPress={() => handlePressStatus(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.user.username} está ouvindo ${item.track.title} de ${item.track.artist}`}
            >
              {/* Floating Listening Bubble */}
              <View
                style={[
                  styles.speechBubble,
                  { backgroundColor: item.track.bubbleColor },
                  isPlaying && styles.speechBubblePlaying,
                ]}
              >
                <View style={styles.bubbleContent}>
                  <FontAwesome5
                    name="spotify"
                    size={13}
                    color="#FFFFFF"
                    style={styles.spotifyIcon}
                  />
                  <View style={styles.textContainer}>
                    <Text style={styles.trackTitle} numberOfLines={1}>
                      {item.track.title}
                    </Text>
                    <Text style={styles.artistName} numberOfLines={1}>
                      {item.track.artist}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Avatar Circle Container */}
              <View style={styles.avatarContainer}>
                {item.user.isCurrentUser ? (
                  <View style={styles.userActivityAvatar}>
                    <View style={styles.userActivityEyes}>
                      <View style={styles.eyeCircleOuter}>
                        <View style={styles.eyeCircleInner} />
                      </View>
                      <View style={styles.eyeCircleSolid} />
                    </View>
                  </View>
                ) : (
                  <Image
                    source={{ uri: item.user.avatarUrl }}
                    style={styles.avatarImage}
                  />
                )}

                {/* Animated listening equalizer badge if playing */}
                {isPlaying && (
                  <View style={styles.playingBadge}>
                    <Ionicons name="volume-high" size={11} color="#FFFFFF" />
                  </View>
                )}
              </View>

              {/* Username text */}
              <Text style={styles.usernameText} numberOfLines={1}>
                {item.user.username}
              </Text>
            </LoggedPressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 14,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 16,
    alignItems: 'flex-start',
  },
  itemWrapper: {
    alignItems: 'center',
    width: 104,
  },
  speechBubble: {
    width: 104,
    height: 48,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    zIndex: 2,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    marginBottom: -14, // overlap the avatar circle
  },
  speechBubblePlaying: {
    borderWidth: 1.5,
    borderColor: '#1DB954',
  },
  bubbleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  spotifyIcon: {
    opacity: 0.95,
  },
  textContainer: {
    flex: 1,
    gap: 1,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  artistName: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 10,
    fontFamily: 'SF-Regular',
  },
  avatarContainer: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#262626',
    zIndex: 1,
    overflow: 'visible',
  },
  avatarImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  userActivityAvatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userActivityEyes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eyeCircleOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeCircleInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#000000',
  },
  eyeCircleSolid: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#000000',
  },
  playingBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#121212',
  },
  usernameText: {
    color: '#E4E4E7',
    fontSize: 12,
    fontFamily: 'SF-Regular',
    marginTop: 6,
    textAlign: 'center',
  },
});
