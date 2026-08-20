/**
 * FriendActivityStatus — Instagram Music Notes
 *
 * Behavior:
 * - Notes tilt ONLY during scroll movement, spring back to 0° when stopped
 * - Wave icon (animated) ONLY shown when that note's song is playing
 * - Default bubble: dark graphite (#1C1E24), no color override
 * - "Sua nota": opens MyNoteModal editor/viewer
 * - Other notes: plays song + opens FriendNoteSheet with lyrics
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePlayer } from '@context';
import { LoggedPressable } from '../../native';
import { MarqueeText } from '../../common/MarqueeText';
import { MyNoteModal, MyNote } from './MyNoteModal';
import { FriendNoteSheet } from './FriendNoteSheet';

export interface FriendNoteItem {
  id: string;
  user: {
    name: string;
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
  };
}

const DEFAULT_BUBBLE_COLOR = '#1C1E24';

const FRIEND_NOTES: FriendNoteItem[] = [
  {
    id: 'note_user',
    user: {
      name: 'Sua nota',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      isCurrentUser: true,
    },
    note: { type: 'text', title: 'Toque para adicionar' },
  },
  {
    id: 'note_flavia',
    user: {
      name: 'Flavia Helena',
      avatarUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=200&auto=format&fit=crop&q=80',
      nameStyle: 'italic',
    },
    note: {
      type: 'music', iconType: 'wave',
      title: 'Canned Heat', subtitle: 'Jamiroquai',
      spotifyId: '0VjIjW4GlUZAMYd2vXMi3b',
      artist: 'Jamiroquai', duration_ms: 397000,
    },
  },
  {
    id: 'note_pedro',
    user: {
      name: 'Pedro Henrique',
      avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&auto=format&fit=crop&q=80',
    },
    note: {
      type: 'music', iconType: 'wave',
      title: 'Show Me You Do',
      subtitle: 'Alicia Keys',
      spotifyId: '6DCZcSspjsKoFjzjrWoCdn',
      artist: 'Alicia Keys', duration_ms: 242000,
    },
  },
  {
    id: 'note_peixe',
    user: {
      name: 'Peixe',
      avatarUrl: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&auto=format&fit=crop&q=80',
    },
    note: {
      type: 'music', iconType: 'wave',
      title: 'Quando Bate Aquela Saudade',
      subtitle: 'Rubel',
      spotifyId: '4w47dntseeMeuLPzFTKKB9',
      artist: 'Rubel', duration_ms: 198000,
    },
  },
  {
    id: 'note_lucas',
    user: {
      name: 'Lucas Pontes',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    },
    note: {
      type: 'music', iconType: 'wave',
      title: 'Lonely Day', subtitle: 'System Of A Down',
      spotifyId: '0d28khcov9ApubBr0GQbfS',
      artist: 'System Of A Down', duration_ms: 167000,
    },
  },
  {
    id: 'note_maria',
    user: {
      name: 'Maria Duda',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
    },
    note: {
      type: 'music', iconType: 'wave',
      title: 'Elvira Pagã', subtitle: 'Rita Lee',
      spotifyId: '6dOtVTDmmpzgGQ9qd0RMiZ',
      artist: 'Rita Lee', duration_ms: 195000,
    },
  },
  {
    id: 'note_igor',
    user: {
      name: 'igor★',
      avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=200&auto=format&fit=crop&q=80',
      nameStyle: 'star',
    },
    note: {
      type: 'music', iconType: 'wave',
      title: 'Ave Maria', subtitle: 'MysticFall27',
      spotifyId: '2plbrEY59IikOBB5X7x5eG',
      artist: 'MysticFall27', duration_ms: 215000,
    },
  },
];

const ITEM_WIDTH = 112;
const MY_NOTE_KEY = 'openfy_my_note';

// ── Animated 3-bar equalizer (always animating when shown) ──────────────────
const SoundWaveIcon = ({ color = '#FFFFFF' }: { color?: string }) => {
  const a1 = React.useRef(new Animated.Value(8)).current;
  const a2 = React.useRef(new Animated.Value(14)).current;
  const a3 = React.useRef(new Animated.Value(9)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(a1, { toValue: 15, duration: 300, useNativeDriver: false }),
          Animated.timing(a2, { toValue: 8, duration: 280, useNativeDriver: false }),
          Animated.timing(a3, { toValue: 17, duration: 320, useNativeDriver: false }),
        ]),
        Animated.parallel([
          Animated.timing(a1, { toValue: 8, duration: 300, useNativeDriver: false }),
          Animated.timing(a2, { toValue: 17, duration: 320, useNativeDriver: false }),
          Animated.timing(a3, { toValue: 9, duration: 280, useNativeDriver: false }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={styles.waveContainer}>
      <Animated.View style={[styles.waveBar, { height: a1, backgroundColor: color }]} />
      <Animated.View style={[styles.waveBar, { height: a2, backgroundColor: color }]} />
      <Animated.View style={[styles.waveBar, { height: a3, backgroundColor: color }]} />
    </View>
  );
};

// ── Main Component ──────────────────────────────────────────────────────────
export const FriendActivityStatus = () => {
  const { playTrack, currentTrack, playerState } = usePlayer();
  const scrollX = React.useRef(new Animated.Value(0)).current;

  // My note persisted state
  const [myNote, setMyNote] = React.useState<MyNote | null>(null);
  const [isNoteModalVisible, setIsNoteModalVisible] = React.useState(false);

  // Friend note sheet state
  const [friendSheetNote, setFriendSheetNote] = React.useState<FriendNoteItem | null>(null);

  React.useEffect(() => {
    AsyncStorage.getItem(MY_NOTE_KEY)
      .then((raw) => { if (raw) setMyNote(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  const handleSaveNote = (note: MyNote) => {
    setMyNote(note);
    AsyncStorage.setItem(MY_NOTE_KEY, JSON.stringify(note)).catch(() => {});
  };

  const handleDeleteNote = () => {
    setMyNote(null);
    AsyncStorage.removeItem(MY_NOTE_KEY).catch(() => {});
  };

  const handlePressNote = (item: FriendNoteItem) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}

    if (item.user.isCurrentUser) {
      setIsNoteModalVisible(true);
      return;
    }

    // Play the song and open friend note sheet
    if (item.note.spotifyId) {
      playTrack({
        spotifyId: item.note.spotifyId,
        title: item.note.title,
        artistName: item.note.artist || item.note.subtitle || 'Artista',
        albumName: 'Nota Musical',
        imageURL: item.user.avatarUrl,
        duration_ms: item.note.duration_ms || 200000,
      });
    }
    setFriendSheetNote(item);
  };

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        decelerationRate="fast"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: Platform.OS !== 'web' }
        )}
      >
        {FRIEND_NOTES.map((item, index) => {
          const isThisSongPlaying =
            !!item.note.spotifyId &&
            currentTrack?.spotifyId === item.note.spotifyId &&
            playerState.isPlaying;

          const inputRange = [
            (index - 1) * ITEM_WIDTH,
            index * ITEM_WIDTH,
            (index + 1) * ITEM_WIDTH,
          ];

          // Tilt ONLY during movement (baseTilt = 0, returns straight when centered/stopped)
          const dynamicRotate = scrollX.interpolate({
            inputRange,
            outputRange: ['-9deg', '0deg', '9deg'],
            extrapolate: 'clamp',
          });

          const translateY = scrollX.interpolate({
            inputRange,
            outputRange: [3, 0, 3],
            extrapolate: 'clamp',
          });

          // Determine content for "Sua nota"
          const isCurrentUser = item.user.isCurrentUser;
          let bubbleColor = item.note.bubbleColor || DEFAULT_BUBBLE_COLOR;
          let noteTitle = item.note.title;
          let noteSubtitle = item.note.subtitle;
          let showWave = isThisSongPlaying;

          if (isCurrentUser) {
            if (myNote) {
              bubbleColor = myNote.bubbleColor || DEFAULT_BUBBLE_COLOR;
              noteTitle = myNote.songTitle || myNote.text || 'Toque para editar';
              noteSubtitle = myNote.songArtist;
              showWave =
                !!myNote.songSpotifyId &&
                currentTrack?.spotifyId === myNote.songSpotifyId &&
                playerState.isPlaying;
            } else {
              bubbleColor = DEFAULT_BUBBLE_COLOR;
              noteTitle = 'Deixe uma nota...';
              noteSubtitle = undefined;
            }
          }

          return (
            <View key={item.id} style={styles.itemWrapper}>
              <LoggedPressable
                style={styles.pressableItem}
                onPress={() => handlePressNote(item)}
                accessibilityRole="button"
              >
                {/* Speech Bubble */}
                <Animated.View
                  style={[
                    styles.noteBubble,
                    { backgroundColor: bubbleColor },
                    { transform: [{ rotate: dynamicRotate }, { translateY }] },
                    isThisSongPlaying && styles.noteBubblePlaying,
                  ]}
                >
                  <View style={styles.bubbleInner}>
                    {/* Wave icon: ONLY when this note's song is actively playing */}
                    {showWave && <SoundWaveIcon color="#FFFFFF" />}

                    <View style={styles.textContainer}>
                      <MarqueeText
                        text={noteTitle}
                        style={styles.noteTitle}
                        align="left"
                        fadeWidth={5}
                      />
                      {noteSubtitle ? (
                        <MarqueeText
                          text={noteSubtitle}
                          style={styles.noteSubtitle}
                          align="left"
                          fadeWidth={5}
                        />
                      ) : null}
                    </View>
                  </View>

                  {/* Instagram speech tail dots */}
                  <View style={[styles.tailDotMain, { backgroundColor: bubbleColor }]} />
                  <View style={[styles.tailDotSmall, { backgroundColor: bubbleColor }]} />
                </Animated.View>

                {/* Stable circular avatar */}
                <View style={styles.avatarContainer}>
                  <Image source={{ uri: item.user.avatarUrl }} style={styles.avatarImage} />
                </View>

                {/* Name */}
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

      {/* My Note Modal */}
      <MyNoteModal
        visible={isNoteModalVisible}
        onClose={() => setIsNoteModalVisible(false)}
        currentNote={myNote}
        avatarUrl={FRIEND_NOTES[0].user.avatarUrl}
        onSave={handleSaveNote}
        onDelete={handleDeleteNote}
      />

      {/* Friend Note Sheet */}
      <FriendNoteSheet
        visible={!!friendSheetNote}
        note={friendSheetNote}
        onClose={() => setFriendSheetNote(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginVertical: 10 },
  scrollContent: { paddingHorizontal: 16, gap: 10, alignItems: 'flex-start' },
  itemWrapper: { alignItems: 'center', width: 100 },
  pressableItem: { alignItems: 'center', width: '100%' },

  noteBubble: {
    width: 102,
    minHeight: 46,
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    zIndex: 2,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    marginBottom: -6,
    position: 'relative',
  },
  noteBubblePlaying: {
    borderColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
  },
  bubbleInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 18,
    width: 12,
    justifyContent: 'center',
    flexShrink: 0,
  },
  waveBar: { width: 2.5, borderRadius: 1.25 },
  textContainer: { flex: 1, gap: 1, justifyContent: 'center' },

  noteTitle: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
    letterSpacing: 0.05,
  },
  noteSubtitle: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 9.5,
    fontFamily: 'SimplyRounded',
  },

  tailDotMain: {
    position: 'absolute', bottom: -5, left: 18,
    width: 7, height: 7, borderRadius: 3.5, zIndex: 3,
  },
  tailDotSmall: {
    position: 'absolute', bottom: -9, left: 13,
    width: 4, height: 4, borderRadius: 2, zIndex: 3,
  },

  avatarContainer: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#1E1E22',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#1E2024',
    zIndex: 1, overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },

  userNameText: {
    color: '#E4E4E7', fontSize: 12,
    fontFamily: 'SimplyRounded',
    marginTop: 6, textAlign: 'center',
  },
  userNameItalic: { fontFamily: 'SimplyRounded-Italic', fontStyle: 'italic' },
  userNameBold: { fontFamily: 'SimplyRounded-Bold', fontWeight: '700' },
});
