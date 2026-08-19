/**
 * FriendActivityStatus Component
 * Real-time friend listening status with enlarged avatar circles, floating speech bubbles,
 * physics-based scroll inertia animations, and centered marquee titles with lateral fade.
 */

import * as React from 'react';
import {
  Animated,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePlayer } from '@context';
import { LoggedPressable } from '../../native';
import { MarqueeText } from '../../common/MarqueeText';

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

const ITEM_WIDTH = 112; // 96 card width + 16 gap

export const FriendActivityStatus = () => {
  const { playTrack, currentTrack, playerState } = usePlayer();
  const scrollX = React.useRef(new Animated.Value(0)).current;

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
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: Platform.OS !== 'web' }
        )}
      >
        {FRIEND_STATUSES.map((item, index) => {
          const isPlaying =
            currentTrack?.spotifyId === item.track.spotifyId &&
            playerState.isPlaying;

          // Physics-based scroll inertia interpolation
          const inputRange = [
            (index - 1) * ITEM_WIDTH,
            index * ITEM_WIDTH,
            (index + 1) * ITEM_WIDTH,
          ];

          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.93, 1.0, 0.93],
            extrapolate: 'clamp',
          });

          const rotate = scrollX.interpolate({
            inputRange,
            outputRange: ['-2.5deg', '0deg', '2.5deg'],
            extrapolate: 'clamp',
          });

          const translateY = scrollX.interpolate({
            inputRange,
            outputRange: [3, 0, 3],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={item.id}
              style={[
                styles.itemWrapper,
                {
                  transform: [{ scale }, { rotate }, { translateY }],
                },
              ]}
            >
              <LoggedPressable
                style={styles.pressableItem}
                onPress={() => handlePressStatus(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.user.username} está ouvindo ${item.track.title} de ${item.track.artist}`}
              >
                {/* Floating Listening Bubble without Spotify Icon & Strictly Centered */}
                <View
                  style={[
                    styles.speechBubble,
                    { backgroundColor: item.track.bubbleColor },
                    isPlaying && styles.speechBubblePlaying,
                  ]}
                >
                  <View style={styles.textContainer}>
                    <MarqueeText
                      text={item.track.title}
                      style={styles.trackTitle}
                      fadeWidth={6}
                    />
                    <MarqueeText
                      text={item.track.artist}
                      style={styles.artistName}
                      fadeWidth={6}
                    />
                  </View>
                </View>

                {/* Enlarged Avatar Circle Container */}
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
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
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
    width: 96,
  },
  pressableItem: {
    alignItems: 'center',
    width: '100%',
  },
  speechBubble: {
    width: 90,
    height: 38,
    borderRadius: 15,
    paddingHorizontal: 6,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    marginBottom: -12, // overlap the avatar circle
  },
  speechBubblePlaying: {
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  textContainer: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 1,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  artistName: {
    color: 'rgba(255, 255, 255, 0.76)',
    fontSize: 9.5,
    fontFamily: 'SF-Regular',
    textAlign: 'center',
  },
  avatarContainer: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#2A2A2E',
    zIndex: 1,
    overflow: 'visible',
  },
  avatarImage: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  userActivityAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userActivityEyes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  eyeCircleOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeCircleInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#000000',
  },
  eyeCircleSolid: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#000000',
  },
  playingBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 22,
    height: 22,
    borderRadius: 11,
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
