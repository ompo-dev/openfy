/**
 * FriendNoteSheet — Bottom sheet when clicking on a friend's note
 * Shows: Header (name · time · "Ouvindo no Spotify"), avatar with green dot,
 * track pill with interactive play/pause button, title marquee (top row), artist marquee (bottom row),
 * and ONLY 1 line of lyrics (active line or first line). Stops audio when closing.
 */

import * as React from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePlayer } from '@context';
import { FriendNoteItem } from './FriendActivityStatus';
import { MarqueeText } from '../../common/MarqueeText';

interface FriendNoteSheetProps {
  visible: boolean;
  note: FriendNoteItem | null;
  onClose: () => void;
}

export const FriendNoteSheet = ({ visible, note, onClose }: FriendNoteSheetProps) => {
  const { playerState, currentTrack, lyricsData, togglePlayPause, playTrack } = usePlayer();

  if (!note) return null;

  const isThisSongPlaying =
    !!note.note.spotifyId &&
    currentTrack?.spotifyId === note.note.spotifyId &&
    playerState.isPlaying;

  // Active lyric line or first line (Display ONLY 1 line at a time)
  const segments = lyricsData?.segments ?? [];

  const displayLyric = React.useMemo(() => {
    if (!segments || segments.length === 0) return null;
    const active = segments.find(
      (s) => playerState.positionMs >= s.startTimeMs && playerState.positionMs < s.endTimeMs
    );
    return active ? active.text : segments[0]?.text;
  }, [segments, playerState.positionMs]);

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
      });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={S.overlay} onPress={handleClose}>
        <Pressable style={S.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Drag handle */}
          <View style={S.handle} />

          {/* Header: "Flavia Helena · 4 h · Ouvindo no Spotify" */}
          <Text style={S.header} numberOfLines={1}>
            <Text style={S.headerName}>{note.user.name}</Text>
            <Text style={S.headerMeta}>{' · 4 h · Ouvindo no '}</Text>
            <Text style={S.headerSpotify}>Spotify</Text>
          </Text>

          {/* Avatar + Track pill row */}
          <View style={S.avatarRow}>
            {/* Avatar with green dot */}
            <View style={S.avatarWrap}>
              <Image source={{ uri: note.user.avatarUrl }} style={S.avatar} />
              <View style={S.greenDot} />
            </View>

            {/* Track pill with interactive play/pause and two-line typography */}
            {note.note.type === 'music' ? (
              <View style={S.trackPill}>
                <TouchableOpacity
                  style={S.playBtnWrap}
                  activeOpacity={0.7}
                  onPress={handlePlayPauseTap}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={isThisSongPlaying ? 'pause-circle' : 'play-circle'}
                    size={32}
                    color="#FFFFFF"
                  />
                </TouchableOpacity>

                <View style={S.trackInfoContainer}>
                  {/* Top row: Title marquee */}
                  <MarqueeText
                    text={note.note.title}
                    style={S.trackTitleText}
                    align="left"
                    fadeWidth={8}
                  />
                  {/* Bottom row: Artist marquee */}
                  <MarqueeText
                    text={note.note.artist || note.note.subtitle || ''}
                    style={S.trackArtistText}
                    align="left"
                    fadeWidth={8}
                  />
                </View>
              </View>
            ) : null}
          </View>

          {/* Display ONLY 1 line of lyrics (active or first) */}
          <View style={S.lyricsArea}>
            {displayLyric ? (
              <Text style={S.singleLyricText} numberOfLines={2}>
                {displayLyric}
              </Text>
            ) : (
              <View style={S.notesRow}>
                <Text style={S.musicNote}>♪</Text>
                <Text style={S.musicNote}>♪</Text>
                <Text style={S.musicNote}>♪</Text>
              </View>
            )}
          </View>
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
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    minHeight: 240,
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
    gap: 12,
    marginBottom: 24,
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
  trackPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    overflow: 'hidden',
  },
  playBtnWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackInfoContainer: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trackTitleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
  },
  trackArtistText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontFamily: 'SimplyRounded',
  },
  lyricsArea: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 10,
  },
  singleLyricText: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 14.5,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  notesRow: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  musicNote: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 26,
  },
});
