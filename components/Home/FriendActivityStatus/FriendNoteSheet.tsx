/**
 * FriendNoteSheet — Bottom sheet when clicking on a friend's note
 * Shows: Header (name · time · "Ouvindo no Spotify"), avatar with green dot,
 * track pill with pause icon, and lyrics (♪ ♪ ♪ or synced lines)
 */

import * as React from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '@context';
import { FriendNoteItem } from './FriendActivityStatus';

interface FriendNoteSheetProps {
  visible: boolean;
  note: FriendNoteItem | null;
  onClose: () => void;
}

export const FriendNoteSheet = ({ visible, note, onClose }: FriendNoteSheetProps) => {
  const { playerState, currentTrack, lyricsData } = usePlayer();

  if (!note) return null;

  const isThisSongPlaying =
    !!note.note.spotifyId &&
    currentTrack?.spotifyId === note.note.spotifyId &&
    playerState.isPlaying;

  // Get active lyric segments from the store
  const segments = lyricsData?.segments ?? [];
  const hasLyrics = segments.length > 0;

  // Active lyric line
  const activeLine = React.useMemo(() => {
    if (!hasLyrics) return null;
    return segments.find(
      (s) => playerState.positionMs >= s.startTimeMs && playerState.positionMs < s.endTimeMs
    ) ?? null;
  }, [segments, playerState.positionMs, hasLyrics]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={S.overlay} onPress={onClose}>
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

            {/* Track pill */}
            {note.note.type === 'music' ? (
              <View style={S.trackPill}>
                <Ionicons
                  name={isThisSongPlaying ? 'pause-circle' : 'play-circle'}
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={S.trackPillText} numberOfLines={1}>
                  {note.note.title}
                  {note.note.subtitle || note.note.artist
                    ? ` · ${note.note.subtitle || note.note.artist}`
                    : ''}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Lyrics or musical note icons */}
          <View style={S.lyricsArea}>
            {hasLyrics ? (
              <ScrollView style={S.lyricsScroll} showsVerticalScrollIndicator={false}>
                {segments.slice(0, 12).map((seg, i) => (
                  <Text
                    key={i}
                    style={[
                      S.lyricLine,
                      activeLine === seg && S.lyricLineActive,
                    ]}
                  >
                    {seg.text}
                  </Text>
                ))}
              </ScrollView>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingBottom: 48,
    paddingTop: 12,
    minHeight: 260,
  },
  handle: {
    width: 36, height: 4, backgroundColor: '#48484A',
    borderRadius: 2, alignSelf: 'center', marginBottom: 18,
  },
  header: {
    fontSize: 14,
    marginBottom: 20,
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
    gap: 14,
    marginBottom: 28,
  },
  avatarWrap: {
    width: 64,
    height: 64,
    position: 'relative',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  trackPillText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
    flex: 1,
  },
  lyricsArea: {
    alignItems: 'center',
    minHeight: 80,
  },
  lyricsScroll: {
    width: '100%',
    maxHeight: 180,
  },
  lyricLine: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontFamily: 'SimplyRounded',
    textAlign: 'center',
    lineHeight: 24,
    paddingVertical: 2,
  },
  lyricLineActive: {
    color: '#FFFFFF',
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
    fontSize: 15,
  },
  notesRow: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  musicNote: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 28,
  },
});
