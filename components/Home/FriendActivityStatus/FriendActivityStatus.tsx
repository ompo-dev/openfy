/**
 * FriendActivityStatus — Instagram Music Notes
 *
 * Tilt physics: velocity-based — all notes share the same animated tilt value.
 * Notes lean opposite to scroll direction while moving, spring back to 0° when stopped.
 * Bubble: compact, single-line marquee for title/artist/text.
 */

import * as React from 'react';
import {
  Animated,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
    note: { type: 'text', title: 'Deixe uma nota...' },
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

const MY_NOTE_KEY = 'openfy_my_note';

// ── Animated 3-bar wave icon ─────────────────────────────────────────────────
const SoundWaveIcon = ({ color = '#FFFFFF' }: { color?: string }) => {
  const a1 = React.useRef(new Animated.Value(7)).current;
  const a2 = React.useRef(new Animated.Value(13)).current;
  const a3 = React.useRef(new Animated.Value(8)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(a1, { toValue: 14, duration: 300, useNativeDriver: false }),
        Animated.timing(a2, { toValue: 7, duration: 280, useNativeDriver: false }),
        Animated.timing(a3, { toValue: 16, duration: 320, useNativeDriver: false }),
      ]),
      Animated.parallel([
        Animated.timing(a1, { toValue: 7, duration: 300, useNativeDriver: false }),
        Animated.timing(a2, { toValue: 16, duration: 320, useNativeDriver: false }),
        Animated.timing(a3, { toValue: 8, duration: 280, useNativeDriver: false }),
      ]),
    ]));
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

// ── Main Component ────────────────────────────────────────────────────────────
export const FriendActivityStatus = () => {
  const { playTrack, currentTrack, playerState } = usePlayer();

  // Velocity-based tilt: single Animated.Value shared by all notes
  const tiltAnim = React.useRef(new Animated.Value(0)).current;
  const lastScrollX = React.useRef(0);
  const lastScrollTime = React.useRef(Date.now());
  const decayTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = React.useCallback((e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const now = Date.now();
    const dt = Math.max(1, now - lastScrollTime.current);
    const velocity = (x - lastScrollX.current) / dt; // px per ms

    // Scrolling right → velocity > 0 → lean LEFT (negative deg)
    // Scrolling left  → velocity < 0 → lean RIGHT (positive deg)
    // Clamp to ±9 degrees
    const targetDeg = Math.max(-9, Math.min(9, -velocity * 12));

    Animated.spring(tiltAnim, {
      toValue: targetDeg,
      useNativeDriver: true,
      tension: 500,
      friction: 22,
      overshootClamping: true,
    }).start();

    lastScrollX.current = x;
    lastScrollTime.current = now;

    // Spring back to 0 when scroll stops
    if (decayTimer.current) clearTimeout(decayTimer.current);
    decayTimer.current = setTimeout(() => {
      Animated.spring(tiltAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 180,
        friction: 18,
        overshootClamping: false,
      }).start();
    }, 50);
  }, [tiltAnim]);

  // Rotation string interpolation
  const tiltRotation = tiltAnim.interpolate({
    inputRange: [-9, 0, 9],
    outputRange: ['-9deg', '0deg', '9deg'],
    extrapolate: 'clamp',
  });

  // My note persistent state
  const [myNote, setMyNote] = React.useState<MyNote | null>(null);
  const [isNoteModalVisible, setIsNoteModalVisible] = React.useState(false);
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={8}
        onScroll={handleScroll}
      >
        {FRIEND_NOTES.map((item) => {
          const isThisSongPlaying =
            !!item.note.spotifyId &&
            currentTrack?.spotifyId === item.note.spotifyId &&
            playerState.isPlaying;

          const isCurrentUser = item.user.isCurrentUser;
          let bubbleColor = item.note.bubbleColor || DEFAULT_BUBBLE_COLOR;
          let noteTitle = item.note.title;
          let noteArtist = item.note.subtitle;
          let noteText: string | undefined;
          let showWave = isThisSongPlaying;

          if (isCurrentUser) {
            if (myNote) {
              bubbleColor = myNote.bubbleColor || DEFAULT_BUBBLE_COLOR;
              noteTitle = myNote.songTitle || myNote.text || 'Deixe uma nota...';
              noteArtist = myNote.songSpotifyId ? myNote.songArtist : undefined;
              // Show custom text below artist only when there's also a song
              noteText = myNote.songSpotifyId && myNote.text ? myNote.text : undefined;
              showWave =
                !!myNote.songSpotifyId &&
                currentTrack?.spotifyId === myNote.songSpotifyId &&
                playerState.isPlaying;
            } else {
              bubbleColor = DEFAULT_BUBBLE_COLOR;
              noteTitle = 'Deixe uma nota...';
            }
          }

          return (
            <View key={item.id} style={styles.itemWrapper}>
              <LoggedPressable
                style={styles.pressableItem}
                onPress={() => handlePressNote(item)}
                accessibilityRole="button"
              >
                {/* Speech Bubble — tilt shared by all */}
                <Animated.View
                  style={[
                    styles.noteBubble,
                    { backgroundColor: bubbleColor },
                    { transform: [{ rotate: tiltRotation }] },
                    isThisSongPlaying && styles.noteBubblePlaying,
                  ]}
                >
                  {/* Row 1: wave icon + title marquee */}
                  <View style={styles.bubbleRow}>
                    {showWave && <SoundWaveIcon color="#FFFFFF" />}
                    <View style={styles.textFlex}>
                      <MarqueeText
                        text={noteTitle}
                        style={styles.noteTitle}
                        align="left"
                        fadeWidth={4}
                      />
                    </View>
                  </View>

                  {/* Row 2: artist marquee */}
                  {noteArtist ? (
                    <MarqueeText
                      text={noteArtist}
                      style={styles.noteArtist}
                      align="left"
                      fadeWidth={4}
                    />
                  ) : null}

                  {/* Row 3: user custom text (max 30 chars) */}
                  {noteText ? (
                    <MarqueeText
                      text={noteText.slice(0, 30)}
                      style={styles.noteCustomText}
                      align="left"
                      fadeWidth={4}
                    />
                  ) : null}

                  {/* Speech tail dots */}
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
      </ScrollView>

      <MyNoteModal
        visible={isNoteModalVisible}
        onClose={() => setIsNoteModalVisible(false)}
        currentNote={myNote}
        avatarUrl={FRIEND_NOTES[0].user.avatarUrl}
        onSave={handleSaveNote}
        onDelete={handleDeleteNote}
      />

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
    width: 97,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    zIndex: 2,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
    marginBottom: -6,
    position: 'relative',
    overflow: 'visible',
  },
  noteBubblePlaying: {
    borderColor: 'rgba(255,255,255,0.28)',
    borderWidth: 1,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  textFlex: { flex: 1, overflow: 'hidden' },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 16,
    width: 11,
    flexShrink: 0,
  },
  waveBar: { width: 2.5, borderRadius: 1.25 },

  noteTitle: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
    letterSpacing: 0.05,
  },
  noteArtist: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontFamily: 'SimplyRounded',
    marginTop: 1,
  },
  noteCustomText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9.5,
    fontFamily: 'SimplyRounded',
    fontStyle: 'italic',
    marginTop: 1,
  },

  tailDotMain: {
    position: 'absolute', bottom: -5, left: 16,
    width: 7, height: 7, borderRadius: 3.5, zIndex: 3,
  },
  tailDotSmall: {
    position: 'absolute', bottom: -9, left: 11,
    width: 4, height: 4, borderRadius: 2, zIndex: 3,
  },

  avatarContainer: {
    width: 70, height: 70, borderRadius: 35,
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
