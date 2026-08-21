/**
 * FriendActivityStatus — Instagram Music Notes
 *
 * Physics:
 * - Velocity-based dynamic tilt during movement, springing back to 0° when stopped.
 * - Elastic horizontal scroll bounce at start/end.
 * - Bubbles aligned to bottom above avatar head so varying heights remain perfectly anchored.
 * - Genuine album covers passed to player (never user avatar).
 * - MarqueeText with edge fades on title, artist, and user note.
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
import { useHomeTrackRefresh } from '@hooks';
import { LoggedPressable } from '../../native';
import { MyNoteModal, MyNote } from './MyNoteModal';
import { FriendNoteSheet } from './FriendNoteSheet';
import { NoteBubble } from './NoteBubble';
import { resolveNoteTailTuning } from './noteTailTuning';
import type { NoteTailTuning, NoteTailTuningById } from './noteTailTuning';

export type { NoteTailTuning, NoteTailTuningById } from './noteTailTuning';

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
    streamUrl?: string;
  };
}

const DEFAULT_BUBBLE_COLOR = '#1C1E24';
const NOTE_ASSEMBLY_WIDTH = 100;

const FRIEND_NOTES: FriendNoteItem[] = [
  {
    id: 'note_user',
    user: {
      name: 'Sua nota',
      avatarUrl:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      isCurrentUser: true,
    },
    note: {
      type: 'text',
      title: 'Deixe uma nota...',
      bubbleColor: '#1C1E24',
    },
  },
  {
    id: 'note_flavia',
    user: {
      name: 'Flavia Helena',
      avatarUrl:
        'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=200&auto=format&fit=crop&q=80',
      nameStyle: 'italic',
    },
    note: {
      type: 'music',
      iconType: 'wave',
      title: 'Canned Heat',
      subtitle: 'Jamiroquai',
      spotifyId: '1A7ODrG8Zg38f1Aee0wZ11',
      artist: 'Jamiroquai',
      imageUrl:
        'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27341ea22e92c68e146eb4a7812',
      duration_ms: 330000,
      bubbleColor: '#EC4899',
    },
  },
  {
    id: 'note_pedro',
    user: {
      name: 'Pedro Henrique',
      avatarUrl:
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&auto=format&fit=crop&q=80',
    },
    note: {
      type: 'music',
      iconType: 'wave',
      title: "If I Ain't Got You",
      subtitle: 'Alicia Keys',
      spotifyId: 'yt_h5EwdeOwcGU',
      artist: 'Alicia Keys',
      imageUrl:
        'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27376a91eb0625902047ff6535d',
      duration_ms: 228000,
      bubbleColor: '#0EA5E9',
    },
  },
  {
    id: 'note_peixe',
    user: {
      name: 'Peixe',
      avatarUrl:
        'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&auto=format&fit=crop&q=80',
    },
    note: {
      type: 'music',
      iconType: 'wave',
      title: 'Quando Bate Aquela Saudade',
      subtitle: 'Rubel',
      spotifyId: '4g4b4a3N9J9g8s7d8f9a2b',
      artist: 'Rubel',
      imageUrl:
        'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b273d22eb74f32ba56e9cce35b1c',
      duration_ms: 198000,
      bubbleColor: '#22C55E',
    },
  },
  {
    id: 'note_lucas',
    user: {
      name: 'Lucas Pontes',
      avatarUrl:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    },
    note: {
      type: 'music',
      iconType: 'wave',
      title: 'Lonely Day',
      subtitle: 'System Of A Down',
      spotifyId: 'yt_DnGdoEa1tPg',
      artist: 'System Of A Down',
      imageUrl:
        'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b273397982f1b4028448ea92c903',
      duration_ms: 167000,
      bubbleColor: '#F59E0B',
    },
  },
  {
    id: 'note_maria',
    user: {
      name: 'Maria Duda',
      avatarUrl:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
    },
    note: {
      type: 'music',
      iconType: 'wave',
      title: 'Elvira Pagã',
      subtitle: 'Rita Lee',
      spotifyId: 'yt_c6jDf1r_de0',
      artist: 'Rita Lee',
      imageUrl:
        'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b2738faea51fe535bb1dc74c2d43',
      duration_ms: 195000,
      bubbleColor: '#8B5CF6',
    },
  },
  {
    id: 'note_igor',
    user: {
      name: 'igor★',
      avatarUrl:
        'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=200&auto=format&fit=crop&q=80',
      nameStyle: 'star',
    },
    note: {
      type: 'music',
      iconType: 'wave',
      title: 'Willy Wonka',
      subtitle: 'Akashi Cruz',
      spotifyId: 'yt_b14l17iFqyI',
      artist: 'Akashi Cruz',
      imageUrl:
        'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b273c52a3be631df815bc1458e0a',
      duration_ms: 185000,
      bubbleColor: '#EF4444',
    },
  },
];

const FRIEND_NOTE_TRACKS = FRIEND_NOTES.flatMap((item) =>
  item.note.spotifyId
    ? [
        {
          key: item.id,
          spotifyId: item.note.spotifyId,
          title: item.note.title,
          artistName: item.note.artist || item.note.subtitle || 'Artista',
          albumName: 'Nota Musical',
          imageURL: item.note.imageUrl || '',
          duration_ms: item.note.duration_ms || 0,
        },
      ]
    : []
);

const MY_NOTE_KEY = 'openfy_my_note';

// ── Main Component ────────────────────────────────────────────────────────────
export interface FriendActivityStatusProps {
  tailTuning?: Partial<NoteTailTuning>;
  tailTuningByNoteId?: NoteTailTuningById;
}

export const FriendActivityStatus = ({
  tailTuning,
  tailTuningByNoteId,
}: FriendActivityStatusProps) => {
  const { playTrack, currentTrack, playerState } = usePlayer();
  const refreshedNotes = useHomeTrackRefresh(FRIEND_NOTE_TRACKS);
  const notes = React.useMemo(
    () =>
      FRIEND_NOTES.map((item) => {
        const refreshed = refreshedNotes[item.id];
        if (!refreshed) return item;

        return {
          ...item,
          note: {
            ...item.note,
            title: refreshed.title,
            subtitle: refreshed.artistName,
            artist: refreshed.artistName,
            imageUrl: refreshed.imageURL,
            duration_ms: refreshed.duration_ms,
            streamUrl: refreshed.streamUrl,
          },
        };
      }),
    [refreshedNotes]
  );

  // Each note has its own native-driven spring so drag inertia travels through
  // the row instead of rotating every bubble at the same instant.
  const tiltAnimations = React.useRef(
    FRIEND_NOTES.map(() => new Animated.Value(0))
  ).current;
  const lastScrollX = React.useRef(0);
  const lastScrollTime = React.useRef(Date.now());
  const lastTiltDirection = React.useRef(0);
  const lastTiltTarget = React.useRef(0);
  const decayTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const animateTilt = React.useCallback(
    (velocity: number) => {
      const isIos = Platform.OS === 'ios';
      const maximumTilt = isIos ? 8 : 4.5;
      const velocityScale = isIos ? 25 : 10;
      const targetDeg = Math.max(
        -maximumTilt,
        Math.min(maximumTilt, -velocity * velocityScale)
      );
      const direction = Math.sign(targetDeg);
      const orderedAnimations =
        direction < 0 ? [...tiltAnimations].reverse() : tiltAnimations;
      const createSpring = (animation: Animated.Value, toValue: number) =>
        Animated.spring(animation, {
          toValue,
          useNativeDriver: Platform.OS !== 'web',
          tension: isIos ? 460 : 360,
          friction: isIos ? 17 : 20,
          overshootClamping: true,
        });

      const shouldCascade =
        direction !== 0 &&
        (direction !== lastTiltDirection.current ||
          Math.abs(targetDeg - lastTiltTarget.current) >= 1.25);
      const animation =
        shouldCascade
          ? Animated.stagger(
              isIos ? 24 : 16,
              orderedAnimations.map((value) => createSpring(value, targetDeg))
            )
          : Animated.parallel(
              tiltAnimations.map((value) => createSpring(value, targetDeg))
            );
      animation.start();
      lastTiltDirection.current = direction;
      lastTiltTarget.current = targetDeg;
    },
    [tiltAnimations]
  );

  const handleScroll = React.useCallback(
    (e: any) => {
      const x = e.nativeEvent.contentOffset.x;
      const now = Date.now();
      const dt = Math.max(1, now - lastScrollTime.current);
      const velocity = (x - lastScrollX.current) / dt; // px per ms

      // Scrolling right tilts left; scrolling left tilts right.
      animateTilt(velocity);

      lastScrollX.current = x;
      lastScrollTime.current = now;

      // Spring back to 0 when scroll stops
      if (decayTimer.current) clearTimeout(decayTimer.current);
      decayTimer.current = setTimeout(() => {
        Animated.stagger(
          10,
          tiltAnimations.map((animation) =>
            Animated.spring(animation, {
              toValue: 0,
              useNativeDriver: Platform.OS !== 'web',
              tension: 180,
              friction: 18,
              overshootClamping: false,
            })
          )
        ).start();
        lastTiltDirection.current = 0;
        lastTiltTarget.current = 0;
      }, 90);
    },
    [animateTilt, tiltAnimations]
  );

  const tiltRotations = tiltAnimations.map((animation) =>
    animation.interpolate({
      inputRange: [-8, 0, 8],
      outputRange: ['-8deg', '0deg', '8deg'],
      extrapolate: 'clamp',
    })
  );

  // My note persistent state
  const [myNote, setMyNote] = React.useState<MyNote | null>(null);
  const [isNoteModalVisible, setIsNoteModalVisible] = React.useState(false);
  const [friendSheetNote, setFriendSheetNote] =
    React.useState<FriendNoteItem | null>(null);

  const getTailTuning = React.useCallback(
    (noteId: string) =>
      resolveNoteTailTuning(tailTuning, tailTuningByNoteId?.[noteId]),
    [tailTuning, tailTuningByNoteId]
  );

  React.useEffect(() => {
    AsyncStorage.getItem(MY_NOTE_KEY)
      .then((raw) => {
        if (raw) setMyNote(JSON.parse(raw));
      })
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
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

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
        imageURL:
          item.note.imageUrl ||
          'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27341ea22e92c68e146eb4a7812',
        duration_ms: item.note.duration_ms || 200000,
        streamUrl: item.note.streamUrl,
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
        bounces={true}
        alwaysBounceHorizontal={true}
        overScrollMode="always"
      >
        {notes.map((item, index) => {
          const isThisSongPlaying =
            !!item.note.spotifyId &&
            currentTrack?.spotifyId === item.note.spotifyId &&
            playerState.isPlaying;
          const noteTailTuning = getTailTuning(item.id);

          const isCurrentUser = item.user.isCurrentUser;
          let bubbleColor = item.note.bubbleColor || DEFAULT_BUBBLE_COLOR;
          let noteTitle = item.note.title;
          let noteArtist = item.note.subtitle;
          let noteText: string | undefined;
          let showWave = isThisSongPlaying;

          if (isCurrentUser) {
            if (myNote) {
              bubbleColor = myNote.bubbleColor || DEFAULT_BUBBLE_COLOR;
              noteTitle =
                myNote.songTitle || myNote.text || 'Deixe uma nota...';
              noteArtist = myNote.songSpotifyId ? myNote.songArtist : undefined;
              noteText =
                myNote.songSpotifyId && myNote.text ? myNote.text : undefined;
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
                {/* Bubble Container: anchored to bottom right above avatar */}
                <View style={styles.bubbleAnchorContainer}>
                  <Animated.View
                    style={{
                      transform: [
                        { translateY: 5 },
                        { rotate: tiltRotations[index] },
                      ],
                    }}
                  >
                    <NoteBubble
                      color={bubbleColor}
                      title={noteTitle}
                      subtitle={noteArtist}
                      text={noteText}
                      showWave={showWave}
                      tailTuning={noteTailTuning}
                    />
                  </Animated.View>
                </View>

                {/* Stable circular avatar */}
                <View style={styles.avatarContainer}>
                  <Image
                    source={{ uri: item.user.avatarUrl }}
                    style={styles.avatarImage}
                  />
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
        avatarUrl={notes[0].user.avatarUrl}
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
  container: {
    marginVertical: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 10,
    alignItems: 'flex-start',
  },
  itemWrapper: {
    alignItems: 'center',
    width: NOTE_ASSEMBLY_WIDTH,
  },
  pressableItem: {
    alignItems: 'center',
    width: '100%',
  },
  // Anchors all bubbles to bottom right above avatar head
  bubbleAnchorContainer: {
    minHeight: 44,
    maxHeight: 68,
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
    zIndex: 2,
    marginBottom: -6,
    position: 'relative',
  },
  avatarContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
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
