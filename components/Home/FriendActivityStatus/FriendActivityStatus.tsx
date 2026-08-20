/**
 * FriendActivityStatus Component — Instagram Music Notes Style
 * Floating music notes with directional drag physics tilt, audio wave / headphone icons,
 * speech bubble tail dots, and authentic rounded typography (Simply Rounded).
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
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePlayer } from '@context';
import { LoggedPressable } from '../../native';
import { MarqueeText } from '../../common/MarqueeText';

export interface FriendNoteItem {
  id: string;
  user: {
    name: string;
    username: string;
    avatarUrl: string;
    nameStyle?: 'normal' | 'italic' | 'star';
    isCurrentUser?: boolean;
  };
  note: {
    type: 'music' | 'text';
    iconType?: 'wave' | 'headphone' | 'text';
    title: string;
    subtitle?: string;
    bubbleColor?: string;
    spotifyId?: string;
    artist?: string;
    imageUrl?: string;
    duration_ms?: number;
    baseTilt?: number;
  };
}

const FRIEND_NOTES: FriendNoteItem[] = [
  {
    id: 'note_user',
    user: {
      name: 'Sua nota',
      username: 'Sua nota',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      isCurrentUser: true,
    },
    note: {
      type: 'text',
      iconType: 'text',
      title: 'Novo dia,',
      subtitle: 'nova nota...',
      bubbleColor: '#25272D',
      baseTilt: -1.5,
    },
  },
  {
    id: 'note_peixe',
    user: {
      name: 'Peixe',
      username: 'Peixe',
      avatarUrl: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&auto=format&fit=crop&q=80',
    },
    note: {
      type: 'music',
      iconType: 'wave',
      title: 'Quando Bate Aquela Saudade',
      subtitle: 'Rubel',
      spotifyId: '4w47dntseeMeuLPzFTKKB9',
      artist: 'Rubel',
      imageUrl: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&auto=format&fit=crop&q=80',
      duration_ms: 198000,
      bubbleColor: '#25272D',
      baseTilt: 2,
    },
  },
  {
    id: 'note_flavia',
    user: {
      name: 'Flavia Helena',
      username: 'Flavia Helena',
      nameStyle: 'italic',
      avatarUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=200&auto=format&fit=crop&q=80',
    },
    note: {
      type: 'music',
      iconType: 'headphone',
      title: 'That\'s The Way Love Goes',
      subtitle: 'Ouvindo agora',
      spotifyId: '0VjIjW4GlUZAMYd2vXMi3b',
      artist: 'Janet Jackson',
      imageUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=200&auto=format&fit=crop&q=80',
      duration_ms: 265000,
      bubbleColor: '#25272D',
      baseTilt: -2,
    },
  },
  {
    id: 'note_pedro',
    user: {
      name: 'Pedro Henrique',
      username: 'Pedro Henrique',
      avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&auto=format&fit=crop&q=80',
    },
    note: {
      type: 'music',
      iconType: 'wave',
      title: 'My Name Is...',
      subtitle: 'Alicia Keys',
      spotifyId: '6DCZcSspjsKoFjzjrWoCdn',
      artist: 'Alicia Keys',
      imageUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&auto=format&fit=crop&q=80',
      duration_ms: 242000,
      bubbleColor: '#25272D',
      baseTilt: 2.5,
    },
  },
  {
    id: 'note_lucas',
    user: {
      name: 'Lucas Pontes',
      username: 'Lucas Pontes',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    },
    note: {
      type: 'music',
      iconType: 'wave',
      title: 'Lonely Day',
      subtitle: 'System Of A Down',
      spotifyId: '0d28khcov9ApubBr0GQbfS',
      artist: 'System Of A Down',
      imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
      duration_ms: 167000,
      bubbleColor: '#25272D',
      baseTilt: -2,
    },
  },
  {
    id: 'note_maria',
    user: {
      name: 'Maria Duda',
      username: 'Maria Duda',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
    },
    note: {
      type: 'music',
      iconType: 'wave',
      title: 'Elvira Pagã',
      subtitle: 'Rita Lee, Roberto de Carvalho',
      spotifyId: '6dOtVTDmmpzgGQ9qd0RMiZ',
      artist: 'Rita Lee',
      imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
      duration_ms: 195000,
      bubbleColor: '#C81423', // Vibrant Red from screenshot
      baseTilt: 3,
    },
  },
  {
    id: 'note_igor',
    user: {
      name: 'igor★',
      username: 'igor★',
      nameStyle: 'star',
      avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=200&auto=format&fit=crop&q=80',
    },
    note: {
      type: 'music',
      iconType: 'wave',
      title: 'Ave Maria',
      subtitle: 'MysticFall27',
      spotifyId: '2plbrEY59IikOBB5X7x5eG',
      artist: 'MysticFall27',
      imageUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=200&auto=format&fit=crop&q=80',
      duration_ms: 215000,
      bubbleColor: '#25272D',
      baseTilt: -2.5,
    },
  },
];

const ITEM_WIDTH = 110;

/**
 * Animated 3-Bar Equalizer Icon
 */
const SoundWaveIcon = ({ isPlaying, color = '#FFFFFF' }: { isPlaying: boolean; color?: string }) => {
  return (
    <View style={styles.waveContainer}>
      <View style={[styles.waveBar, { height: isPlaying ? 13 : 8, backgroundColor: color }]} />
      <View style={[styles.waveBar, { height: isPlaying ? 16 : 14, backgroundColor: color }]} />
      <View style={[styles.waveBar, { height: isPlaying ? 10 : 9, backgroundColor: color }]} />
    </View>
  );
};

export const FriendActivityStatus = () => {
  const { playTrack, currentTrack, playerState } = usePlayer();
  const scrollX = React.useRef(new Animated.Value(0)).current;

  const handlePressNote = (item: FriendNoteItem) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    if (item.note.spotifyId) {
      playTrack({
        spotifyId: item.note.spotifyId,
        title: item.note.title,
        artistName: item.note.subtitle || item.note.artist || 'Artista',
        albumName: 'Instagram Note',
        imageURL: item.note.imageUrl || item.user.avatarUrl,
        duration_ms: item.note.duration_ms || 200000,
      });
    }
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
        {FRIEND_NOTES.map((item, index) => {
          const isCurrentNotePlaying =
            !!item.note.spotifyId &&
            currentTrack?.spotifyId === item.note.spotifyId &&
            playerState.isPlaying;

          // Dynamic directional drag tilt: Leans in direction of drag/motion
          const inputRange = [
            (index - 1) * ITEM_WIDTH,
            index * ITEM_WIDTH,
            (index + 1) * ITEM_WIDTH,
          ];

          const baseTilt = item.note.baseTilt || 0;

          const dynamicRotate = scrollX.interpolate({
            inputRange,
            outputRange: [
              `${baseTilt - 7}deg`,
              `${baseTilt}deg`,
              `${baseTilt + 7}deg`,
            ],
            extrapolate: 'clamp',
          });

          const translateY = scrollX.interpolate({
            inputRange,
            outputRange: [2, 0, 2],
            extrapolate: 'clamp',
          });

          const bubbleBg = isCurrentNotePlaying
            ? '#C81423'
            : item.note.bubbleColor || '#25272D';

          return (
            <View key={item.id} style={styles.itemWrapper}>
              <LoggedPressable
                style={styles.pressableItem}
                onPress={() => handlePressNote(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.user.name}: ${item.note.title}`}
              >
                {/* Floating Instagram Note Speech Bubble */}
                <Animated.View
                  style={[
                    styles.noteBubble,
                    {
                      backgroundColor: bubbleBg,
                      transform: [
                        { rotate: dynamicRotate },
                        { translateY },
                      ],
                    },
                    isCurrentNotePlaying && styles.noteBubblePlaying,
                  ]}
                >
                  <View style={styles.bubbleInner}>
                    {/* Left Icon: Sound Wave Equalizer, Headphone or Text */}
                    {item.note.iconType === 'headphone' ? (
                      <Ionicons
                        name="headset"
                        size={14}
                        color="#FFFFFF"
                        style={styles.iconStyle}
                      />
                    ) : item.note.iconType === 'wave' || item.note.type === 'music' ? (
                      <SoundWaveIcon
                        isPlaying={isCurrentNotePlaying}
                        color="#FFFFFF"
                      />
                    ) : null}

                    {/* Text block: Title + Subtitle */}
                    <View style={styles.textContainer}>
                      <MarqueeText
                        text={item.note.title}
                        style={styles.noteTitle}
                        align="left"
                        fadeWidth={6}
                      />
                      {item.note.subtitle ? (
                        <MarqueeText
                          text={item.note.subtitle}
                          style={styles.noteSubtitle}
                          align="left"
                          fadeWidth={6}
                        />
                      ) : null}
                    </View>
                  </View>

                  {/* Speech Tail Dots (Instagram Notes style) */}
                  <View style={[styles.tailDotMain, { backgroundColor: bubbleBg }]} />
                  <View style={[styles.tailDotSmall, { backgroundColor: bubbleBg }]} />
                </Animated.View>

                {/* Completely Stable Circular Avatar */}
                <View style={styles.avatarContainer}>
                  <Image
                    source={{ uri: item.user.avatarUrl }}
                    style={styles.avatarImage}
                  />

                  {/* Active soundwave equalizer badge if currently playing */}
                  {isCurrentNotePlaying && (
                    <View style={styles.playingDotBadge}>
                      <View style={styles.playingDotInner} />
                    </View>
                  )}
                </View>

                {/* User Name Label */}
                <Text
                  style={[
                    styles.userNameText,
                    item.user.nameStyle === 'italic' && styles.userNameItalic,
                    item.user.nameStyle === 'star' && styles.userNameBold,
                  ]}
                  numberOfLines={1}
                >
                  {item.user.name}
                </Text>
              </LoggedPressable>
            </View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 12,
    alignItems: 'flex-start',
  },
  itemWrapper: {
    alignItems: 'center',
    width: 98,
  },
  pressableItem: {
    alignItems: 'center',
    width: '100%',
  },
  noteBubble: {
    width: 100,
    minHeight: 44,
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 5,
    justifyContent: 'center',
    zIndex: 2,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    marginBottom: -6, // overlaps avatar top
    position: 'relative',
  },
  noteBubblePlaying: {
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 1,
  },
  bubbleInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconStyle: {
    flexShrink: 0,
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 16,
    width: 10,
    justifyContent: 'center',
    flexShrink: 0,
  },
  waveBar: {
    width: 2.2,
    borderRadius: 1,
  },
  textContainer: {
    flex: 1,
    gap: 1,
    justifyContent: 'center',
  },
  noteTitle: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  noteSubtitle: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 9.5,
    fontFamily: 'SimplyRounded',
  },
  tailDotMain: {
    position: 'absolute',
    bottom: -5,
    left: 18,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    zIndex: 3,
  },
  tailDotSmall: {
    position: 'absolute',
    bottom: -9,
    left: 13,
    width: 4,
    height: 4,
    borderRadius: 2,
    zIndex: 3,
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1E1E22',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1E2024',
    zIndex: 1,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  playingDotBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  playingDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C81423',
  },
  userNameText: {
    color: '#E4E4E7',
    fontSize: 12,
    fontFamily: 'SimplyRounded',
    marginTop: 6,
    textAlign: 'center',
  },
  userNameItalic: {
    fontFamily: 'SimplyRounded-Italic',
    fontStyle: 'italic',
  },
  userNameBold: {
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
  },
});
