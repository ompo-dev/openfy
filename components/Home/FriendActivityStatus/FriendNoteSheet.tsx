/**
 * FriendNoteSheet — Bottom sheet when clicking on a friend's note
 * Shows: Header, avatar at the left, full-width note at the right, inline lyrics,
 * playback/download controls and final tail calibration.
 */

import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { usePlayer } from '@context';
import { downloadTrack, isTrackDownloaded, resolveAudioUrl } from '@services';
import type { FriendNoteItem } from './FriendActivityStatus';
import { NoteLyricInline } from './NoteLyricLine';
import { NoteBubbleFullWidth } from './NoteBubble';
import { resolveNoteTailTuning } from './noteTailTuning';
import type { NoteTailTuning } from './noteTailTuning';

const PLAYBACK_BUTTON_SIZE = 36;
const PLAYBACK_RING_RADIUS = 15;
const PLAYBACK_RING_LENGTH = 2 * Math.PI * PLAYBACK_RING_RADIUS;

const FRIEND_NOTE_SHEET_TAIL_TUNING: Partial<NoteTailTuning> = {
  colorReferenceInset: 0,
  mainStartFine: -0.182,
  mainEndFine: -0.15,
  smallStartFine: -0.2,
  smallEndFine: -0.2,
  orbitAngle: 174,
  mainDistance: 1,
  smallAngleOffset: 2,
  smallDistance: 18,
};

const clamp = (value: number) => Math.max(0, Math.min(value, 1));

const PlaybackButton = ({
  isPlaying,
  progress,
  onPress,
}: {
  isPlaying: boolean;
  progress: number;
  onPress: () => void;
}) => (
  <TouchableOpacity
    style={S.playbackButton}
    activeOpacity={0.78}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={isPlaying ? 'Pausar música' : 'Tocar música'}
  >
    <Svg
      width={PLAYBACK_BUTTON_SIZE}
      height={PLAYBACK_BUTTON_SIZE}
      style={S.playbackRing}
    >
      <Circle
        cx={PLAYBACK_BUTTON_SIZE / 2}
        cy={PLAYBACK_BUTTON_SIZE / 2}
        r={PLAYBACK_RING_RADIUS}
        stroke="rgba(255,255,255,0.24)"
        strokeWidth={2}
        fill="transparent"
      />
      <Circle
        cx={PLAYBACK_BUTTON_SIZE / 2}
        cy={PLAYBACK_BUTTON_SIZE / 2}
        r={PLAYBACK_RING_RADIUS}
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={`${PLAYBACK_RING_LENGTH} ${PLAYBACK_RING_LENGTH}`}
        strokeDashoffset={PLAYBACK_RING_LENGTH * (1 - clamp(progress))}
        fill="transparent"
        transform={`rotate(-90 ${PLAYBACK_BUTTON_SIZE / 2} ${PLAYBACK_BUTTON_SIZE / 2})`}
      />
    </Svg>
    <Ionicons
      name={isPlaying ? 'pause' : 'play'}
      size={14}
      color="#FFFFFF"
      style={!isPlaying ? S.playIcon : undefined}
    />
  </TouchableOpacity>
);

interface FriendNoteSheetProps {
  visible: boolean;
  note: FriendNoteItem | null;
  onClose: () => void;
}

export const FriendNoteSheet = ({
  visible,
  note,
  onClose,
}: FriendNoteSheetProps) => {
  const { playerState, currentTrack, lyricsData, togglePlayPause, playTrack } =
    usePlayer();
  const [isDownloaded, setIsDownloaded] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const noteSpotifyId = note?.note.spotifyId;
  const sheetTailTuning = resolveNoteTailTuning(FRIEND_NOTE_SHEET_TAIL_TUNING);

  React.useEffect(() => {
    let isCurrent = true;
    setIsDownloaded(false);
    setIsDownloading(false);

    if (!noteSpotifyId)
      return () => {
        isCurrent = false;
      };

    isTrackDownloaded(noteSpotifyId)
      .then((downloaded) => {
        if (isCurrent) setIsDownloaded(downloaded);
      })
      .catch(() => {});

    return () => {
      isCurrent = false;
    };
  }, [noteSpotifyId]);

  const segments =
    currentTrack?.spotifyId === note?.note.spotifyId
      ? (lyricsData?.segments ?? [])
      : [];
  const displayLyric = React.useMemo(() => {
    if (segments.length === 0) return null;
    const active = segments.find(
      (s) =>
        playerState.positionMs >= s.startTimeMs &&
        playerState.positionMs < s.endTimeMs
    );
    return active ? active.text : segments[0]?.text;
  }, [segments, playerState.positionMs]);

  if (!note) return null;

  const isThisSongPlaying =
    !!note.note.spotifyId &&
    currentTrack?.spotifyId === note.note.spotifyId &&
    playerState.isPlaying;

  const handleClose = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    // Pause audio when closing friend note sheet
    if (playerState.isPlaying) {
      togglePlayPause();
    }
    onClose();
  };

  const handlePlayPauseTap = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    if (currentTrack?.spotifyId === note.note.spotifyId) {
      togglePlayPause();
    } else if (note.note.spotifyId) {
      playTrack({
        spotifyId: note.note.spotifyId,
        title: note.note.title,
        artistName: note.note.artist || note.note.subtitle || 'Artista',
        albumName: 'Nota',
        imageURL: note.note.imageUrl || note.user.avatarUrl,
        duration_ms: note.note.duration_ms || 200000,
        streamUrl: note.note.streamUrl,
        streamExpiresAt: note.note.streamExpiresAt,
      });
    }
  };

  const handleDownload = async () => {
    if (!note.note.spotifyId || isDownloaded || isDownloading) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    setIsDownloading(true);
    try {
      if (await isTrackDownloaded(note.note.spotifyId)) {
        setIsDownloaded(true);
        return;
      }

      const resolved = await resolveAudioUrl(
        note.note.title,
        note.note.artist || note.note.subtitle || 'Artista',
        note.note.spotifyId,
        note.note.duration_ms
      );
      if (!resolved) {
        Alert.alert(
          'Música indisponível',
          'Não foi possível localizar o áudio.'
        );
        return;
      }

      const savedTrack = await downloadTrack(
        {
          spotifyId: note.note.spotifyId,
          title: note.note.title,
          artistName: note.note.artist || note.note.subtitle || 'Artista',
          albumName: 'Nota',
          imageURL: note.note.imageUrl || note.user.avatarUrl,
          duration_ms: note.note.duration_ms || 0,
        },
        resolved.url,
        resolved.format
      );
      if (savedTrack) {
        setIsDownloaded(true);
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        ).catch(() => {});
      } else {
        Alert.alert('Download falhou', 'Tente salvar a música novamente.');
      }
    } catch {
      Alert.alert('Download falhou', 'Tente salvar a música novamente.');
    } finally {
      setIsDownloading(false);
    }
  };

  const isThisTrackActive = currentTrack?.spotifyId === note.note.spotifyId;
  const playbackDurationMs =
    (isThisTrackActive ? playerState.durationMs : 0) ||
    note.note.duration_ms ||
    1;
  const playbackProgress = isThisTrackActive
    ? clamp(playerState.positionMs / playbackDurationMs)
    : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={S.overlay} onPress={handleClose}>
        <Pressable style={S.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView
            contentContainerStyle={S.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Drag handle */}
            <View style={S.handle} />

            {/* Header: "Flavia Helena · 4 h · Ouvindo no Spotify" */}
            <Text style={S.header} numberOfLines={1}>
              <Text style={S.headerName}>{note.user.name}</Text>
              <Text style={S.headerMeta}>{' · 4 h · Ouvindo no '}</Text>
              <Text style={S.headerSpotify}>Spotify</Text>
            </Text>

            {/* Avatar left, full note right; tail points toward the avatar. */}
            <View style={S.avatarRow}>
              <View style={S.avatarWrap}>
                <Image source={{ uri: note.user.avatarUrl }} style={S.avatar} />
                <View style={S.greenDot} />
              </View>

              <View style={S.notePressable}>
                <NoteBubbleFullWidth
                  color={note.note.bubbleColor || '#1C1E24'}
                  title={note.note.title}
                  subtitle={note.note.artist || note.note.subtitle}
                  tailTuning={sheetTailTuning}
                  leading={
                    note.note.type === 'music' ? (
                      <PlaybackButton
                        isPlaying={isThisSongPlaying}
                        progress={playbackProgress}
                        onPress={handlePlayPauseTap}
                      />
                    ) : undefined
                  }
                  trailing={
                    note.note.type === 'music' ? (
                      <TouchableOpacity
                        style={S.downloadButton}
                        activeOpacity={0.78}
                        onPress={handleDownload}
                        disabled={isDownloaded || isDownloading}
                        accessibilityRole="button"
                        accessibilityLabel={
                          isDownloaded
                            ? 'Música salva em downloads'
                            : 'Salvar música em downloads'
                        }
                      >
                        {isDownloading ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Ionicons
                            name={isDownloaded ? 'heart' : 'heart-outline'}
                            size={19}
                            color={isDownloaded ? '#FF5575' : '#FFFFFF'}
                          />
                        )}
                      </TouchableOpacity>
                    ) : undefined
                  }
                />
              </View>
            </View>

            <NoteLyricInline text={displayLyric} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const S = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    minHeight: 240,
    maxHeight: '82%',
    overflow: 'hidden',
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#48484A',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    fontSize: 14,
    marginBottom: 18,
    textAlign: 'left',
  },
  headerName: {
    color: '#FFFFFF',
    fontFamily: 'SimplyRounded-Italic',
    fontStyle: 'italic',
    fontWeight: '600',
  },
  headerMeta: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'SimplyRounded',
  },
  headerSpotify: {
    color: '#FFFFFF',
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  notePressable: {
    flex: 1,
    borderRadius: 16,
  },
  playbackButton: {
    width: PLAYBACK_BUTTON_SIZE,
    height: PLAYBACK_BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  playbackRing: {
    position: 'absolute',
  },
  playIcon: {
    marginLeft: 2,
  },
  downloadButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarWrap: {
    width: 60,
    height: 60,
    position: 'relative',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#2C2C2E',
  },
  greenDot: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2ECC40',
    borderWidth: 2,
    borderColor: '#1C1C1E',
  },
});
