/**
 * MyNoteModal — Instagram-style Music Notes editor, pixel-perfect.
 *
 * Screens:
 *  1. "editor"      — Black screen: balloon (with inline text input) + avatar,
 *                     music and color buttons attached to avatar, share bar at bottom.
 *  2. "colorPicker" — Full screen: header "< Editor de balão", preview center,
 *                     6 swatches row, 5 page dots, Aplicar/Limpar.
 *  3. "musicPicker" — Bottom sheet: search + tabs + downloaded tracks list.
 *  4. "published"   — Bottom sheet: avatar, song info, "Deixar nova nota", "Excluir nota".
 *                     (NO "Ver comentários")
 */

import * as React from 'react';
import {
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePlayer } from '@context';

export interface MyNote {
  text: string;
  songTitle?: string;
  songArtist?: string;
  songSpotifyId?: string;
  songDuration?: number;
  bubbleColor: string;
}

interface MyNoteModalProps {
  visible: boolean;
  onClose: () => void;
  currentNote: MyNote | null;
  avatarUrl: string;
  onSave: (note: MyNote) => void;
  onDelete: () => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// Color palette: 6 per page, 5 pages
// ──────────────────────────────────────────────────────────────────────────────
const COLOR_PAGES = [
  ['#B57BEE', '#8B5CF6', '#6D28D9', '#F472B6', '#EC4899', '#9D174D'],
  ['#EF4444', '#DC2626', '#0EA5E9', '#0284C7', '#10B981', '#059669'],
  ['#F97316', '#EA580C', '#EAB308', '#CA8A04', '#6366F1', '#4338CA'],
  ['#84CC16', '#4D7C0F', '#06B6D4', '#0E7490', '#F43F5E', '#BE123C'],
  ['#64748B', '#475569', '#A16207', '#92400E', '#7C3AED', '#5B21B6'],
];

const DEFAULT_COLOR = '#25272D';

// ──────────────────────────────────────────────────────────────────────────────
// Animated wave icon (3 bars)
// ──────────────────────────────────────────────────────────────────────────────
const WaveIcon = ({ size = 14, color = '#fff' }: { size?: number; color?: string }) => {
  const a1 = React.useRef(new Animated.Value(size * 0.55)).current;
  const a2 = React.useRef(new Animated.Value(size)).current;
  const a3 = React.useRef(new Animated.Value(size * 0.7)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(a1, { toValue: size, duration: 290, useNativeDriver: false }),
        Animated.timing(a2, { toValue: size * 0.4, duration: 310, useNativeDriver: false }),
        Animated.timing(a3, { toValue: size * 0.9, duration: 270, useNativeDriver: false }),
      ]),
      Animated.parallel([
        Animated.timing(a1, { toValue: size * 0.55, duration: 290, useNativeDriver: false }),
        Animated.timing(a2, { toValue: size, duration: 310, useNativeDriver: false }),
        Animated.timing(a3, { toValue: size * 0.7, duration: 270, useNativeDriver: false }),
      ]),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: size + 3, flexShrink: 0 }}>
      {[a1, a2, a3].map((a, i) => (
        <Animated.View key={i} style={{ width: 2.5, borderRadius: 1.25, backgroundColor: color, height: a }} />
      ))}
    </View>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Live balloon preview + avatar (used across screens)
// ──────────────────────────────────────────────────────────────────────────────
const BubblePreview = ({
  text, songTitle, songArtist, bubbleColor, avatarUrl,
}: {
  text: string; songTitle?: string; songArtist?: string;
  bubbleColor: string; avatarUrl: string;
}) => {
  const bg = bubbleColor || DEFAULT_COLOR;
  const line1 = songTitle || text || '';
  const line2 = songTitle ? songArtist : undefined;
  const isEmpty = !songTitle && !text;

  return (
    <View style={bp.wrapper}>
      <View style={[bp.bubble, { backgroundColor: bg }]}>
        <View style={bp.row}>
          {songTitle && <WaveIcon size={13} color="#fff" />}
          <View style={bp.textBlock}>
            <Text style={[bp.line1, isEmpty && bp.placeholder]} numberOfLines={3}>
              {isEmpty ? 'Deixe uma nota...' : line1}
            </Text>
            {line2 ? <Text style={bp.line2} numberOfLines={1}>{line2}</Text> : null}
          </View>
        </View>
        <View style={[bp.dot1, { backgroundColor: bg }]} />
        <View style={[bp.dot2, { backgroundColor: bg }]} />
      </View>
      <View style={bp.avatar}>
        <Image source={{ uri: avatarUrl }} style={bp.avatarImg} />
      </View>
    </View>
  );
};

const bp = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  bubble: {
    minWidth: 130, maxWidth: 190, borderRadius: 20,
    paddingHorizontal: 13, paddingVertical: 10,
    marginBottom: -8, zIndex: 2, position: 'relative',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  textBlock: { flex: 1 },
  line1: { color: '#FFF', fontSize: 14, fontFamily: 'SimplyRounded-Bold', fontWeight: '700', lineHeight: 18 },
  placeholder: { color: 'rgba(255,255,255,0.45)', fontFamily: 'SimplyRounded', fontWeight: '400' },
  line2: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'SimplyRounded', marginTop: 2 },
  dot1: { position: 'absolute', bottom: -5, left: 22, width: 9, height: 9, borderRadius: 4.5, zIndex: 3 },
  dot2: { position: 'absolute', bottom: -10, left: 15, width: 5, height: 5, borderRadius: 2.5, zIndex: 3 },
  avatar: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 2, borderColor: '#1E2024',
    overflow: 'hidden', zIndex: 1, backgroundColor: '#111',
  },
  avatarImg: { width: '100%', height: '100%' },
});

// ──────────────────────────────────────────────────────────────────────────────
// Downloaded track type (simplified)
// ──────────────────────────────────────────────────────────────────────────────
interface DownloadedTrack {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName?: string;
  imageURL?: string;
  localImagePath?: string;
  duration_ms?: number;
}

const MUSIC_TABS = ['Para você', 'Em alta', 'Salvos', 'Áudio original'];

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────
export const MyNoteModal = ({
  visible, onClose, currentNote, avatarUrl, onSave, onDelete,
}: MyNoteModalProps) => {
  const { currentTrack } = usePlayer();

  type ScreenMode = 'editor' | 'colorPicker' | 'musicPicker' | 'published';
  const [mode, setMode] = React.useState<ScreenMode>('editor');

  const [noteText, setNoteText] = React.useState('');
  const [selectedSong, setSelectedSong] = React.useState<DownloadedTrack | null>(null);
  const [bubbleColor, setBubbleColor] = React.useState(DEFAULT_COLOR);
  const [colorPage, setColorPage] = React.useState(0);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [musicTab, setMusicTab] = React.useState(0);
  const [downloadedTracks, setDownloadedTracks] = React.useState<DownloadedTrack[]>([]);

  // Load downloaded tracks from AsyncStorage
  React.useEffect(() => {
    if (mode === 'musicPicker') {
      AsyncStorage.getItem('openfy_downloads').then((raw) => {
        if (raw) {
          try {
            const list = JSON.parse(raw) as DownloadedTrack[];
            setDownloadedTracks(Array.isArray(list) ? list : []);
          } catch {}
        }
      }).catch(() => {});
    }
  }, [mode]);

  React.useEffect(() => {
    if (!visible) return;
    if (currentNote) {
      setMode('published');
      setNoteText(currentNote.text || '');
      setBubbleColor(currentNote.bubbleColor || DEFAULT_COLOR);
      if (currentNote.songTitle) {
        setSelectedSong({
          spotifyId: currentNote.songSpotifyId || '',
          title: currentNote.songTitle,
          artistName: currentNote.songArtist || '',
          duration_ms: currentNote.songDuration,
        });
      } else setSelectedSong(null);
    } else {
      setMode('editor');
      setNoteText('');
      setBubbleColor(DEFAULT_COLOR);
      setSelectedSong(null);
    }
  }, [visible, currentNote]);

  const handleShare = () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    onSave({
      text: noteText,
      songTitle: selectedSong?.title,
      songArtist: selectedSong?.artistName,
      songSpotifyId: selectedSong?.spotifyId,
      songDuration: selectedSong?.duration_ms,
      bubbleColor,
    });
    onClose();
  };

  const handleUseCurrentSong = () => {
    if (currentTrack) {
      setSelectedSong({
        spotifyId: currentTrack.spotifyId,
        title: currentTrack.title,
        artistName: currentTrack.artistName,
        imageURL: currentTrack.imageURL,
        duration_ms: currentTrack.duration_ms,
      });
    }
    setMode('editor');
  };

  const canShare = noteText.trim().length > 0 || selectedSong !== null;
  const filteredTracks = searchQuery.trim()
    ? downloadedTracks.filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.artistName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : downloadedTracks;

  // ── Screen 4: Published bottom sheet (NO "Ver comentários") ────────────────
  if (mode === 'published' && currentNote) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={S.publishedOverlay} onPress={onClose}>
          <Pressable style={S.publishedSheet} onPress={(e) => e.stopPropagation()}>
            <View style={S.handle} />

            {/* Avatar */}
            <View style={S.publishedAvatarWrap}>
              <Image source={{ uri: avatarUrl }} style={S.publishedAvatar} />
            </View>

            {/* Info */}
            <View style={S.publishedInfoBlock}>
              {currentNote.songTitle && (
                <View style={S.publishedSongRow}>
                  <WaveIcon size={13} color="#FFFFFF" />
                  <Text style={S.publishedSongText} numberOfLines={2}>
                    {`${currentNote.songTitle} · ${currentNote.songArtist}`}
                  </Text>
                </View>
              )}
              {currentNote.text ? (
                <Text style={S.publishedNoteText}>{currentNote.text}</Text>
              ) : null}
              <Text style={S.publishedMeta}>Compartilhada com amigos · agora</Text>
            </View>

            {/* Deixar uma nova nota */}
            <TouchableOpacity
              style={S.newNoteBtn}
              onPress={() => {
                setNoteText('');
                setSelectedSong(null);
                setBubbleColor(DEFAULT_COLOR);
                setMode('editor');
              }}
            >
              <Text style={S.newNoteBtnText}>Deixar uma nova nota</Text>
            </TouchableOpacity>

            {/* Excluir */}
            <TouchableOpacity
              style={S.deleteRow}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
                onDelete();
                onClose();
              }}
            >
              <Text style={S.deleteText}>Excluir nota</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  // ── Screen 2: Color picker full screen ─────────────────────────────────────
  if (mode === 'colorPicker') {
    return (
      <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={() => setMode('editor')}>
        <SafeAreaView style={S.colorScreen}>
          {/* Header */}
          <View style={S.colorHeader}>
            <TouchableOpacity style={S.colorBackBtn} onPress={() => setMode('editor')}>
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={S.colorHeaderTitle}>Editor de balão</Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Preview centered */}
          <View style={S.colorPreviewArea}>
            <BubblePreview
              text={noteText}
              songTitle={selectedSong?.title}
              songArtist={selectedSong?.artistName}
              bubbleColor={bubbleColor}
              avatarUrl={avatarUrl}
            />
          </View>

          {/* 6 swatches */}
          <View style={S.swatchRow}>
            {COLOR_PAGES[colorPage].map((color) => (
              <TouchableOpacity
                key={color}
                style={[S.swatch, { backgroundColor: color }, bubbleColor === color && S.swatchSelected]}
                onPress={() => setBubbleColor(color)}
              />
            ))}
          </View>

          {/* Page dots */}
          <View style={S.pageDotsRow}>
            {COLOR_PAGES.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => setColorPage(i)}>
                <View style={[S.pageDot, i === colorPage && S.pageDotActive]} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Aplicar */}
          <TouchableOpacity style={S.applyBtn} onPress={() => setMode('editor')}>
            <Text style={S.applyBtnText}>Aplicar</Text>
          </TouchableOpacity>

          {/* Limpar */}
          <TouchableOpacity
            style={S.limparRow}
            onPress={() => { setBubbleColor(DEFAULT_COLOR); setMode('editor'); }}
          >
            <Text style={S.limparText}>Limpar</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    );
  }

  // ── Screen 3: Music picker bottom sheet (downloaded tracks) ─────────────────
  if (mode === 'musicPicker') {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setMode('editor')}>
        <View style={S.musicOverlay}>
          <View style={S.musicSheet}>
            {/* Handle */}
            <View style={S.musicHandleRow}>
              <View style={S.handle} />
            </View>
            <TouchableOpacity style={S.musicCloseBtn} onPress={() => setMode('editor')}>
              <View style={S.musicCloseCircle}>
                <Ionicons name="close" size={16} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            {/* Search */}
            <View style={S.searchBar}>
              <Ionicons name="search" size={15} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={S.searchInput}
                placeholder="Pesquisar..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Tab pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.tabsRow}>
              {MUSIC_TABS.map((tab, i) => (
                <TouchableOpacity
                  key={tab}
                  style={[S.tabPill, i === musicTab && S.tabPillActive]}
                  onPress={() => setMusicTab(i)}
                >
                  <Text style={[S.tabPillText, i === musicTab && S.tabPillTextActive]}>{tab}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Tracks list */}
            <FlatList
              data={filteredTracks}
              keyExtractor={(t) => t.spotifyId}
              style={S.songList}
              ListHeaderComponent={
                /* Use currently playing song shortcut */
                currentTrack ? (
                  <TouchableOpacity style={S.currentSongRow} onPress={handleUseCurrentSong}>
                    <Image
                      source={{ uri: currentTrack.imageURL }}
                      style={S.songArt}
                    />
                    <View style={S.songInfo}>
                      <Text style={S.songTitle} numberOfLines={1}>
                        {currentTrack.title}
                      </Text>
                      <Text style={S.songMeta} numberOfLines={1}>
                        {currentTrack.artistName} · Tocando agora
                      </Text>
                    </View>
                    <WaveIcon size={13} color="#FFFFFF" />
                  </TouchableOpacity>
                ) : null
              }
              ListEmptyComponent={
                <View style={S.emptyList}>
                  <Text style={S.emptyText}>
                    {downloadedTracks.length === 0
                      ? 'Nenhuma música baixada ainda.'
                      : 'Nenhum resultado para sua busca.'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[S.songRow, selectedSong?.spotifyId === item.spotifyId && S.songRowSelected]}
                  onPress={() => {
                    setSelectedSong(item);
                    setMode('editor');
                  }}
                >
                  <Image
                    source={{ uri: item.localImagePath || item.imageURL || '' }}
                    style={S.songArt}
                  />
                  <View style={S.songInfo}>
                    <Text style={S.songTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={S.songMeta} numberOfLines={1}>{item.artistName}</Text>
                  </View>
                  <Ionicons
                    name={selectedSong?.spotifyId === item.spotifyId ? 'checkmark-circle' : 'bookmark-outline'}
                    size={20}
                    color={selectedSong?.spotifyId === item.spotifyId ? '#5B5BD6' : 'rgba(255,255,255,0.4)'}
                  />
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    );
  }

  // ── Screen 1: Main editor (full black screen) ─────────────────────────────
  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={S.editorScreen}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={S.editorKAV}
        >
          {/* X close button */}
          <TouchableOpacity style={S.editorCloseBtn} onPress={onClose}>
            <View style={S.editorCloseCircle}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          {/* Center: balloon + avatar + inline buttons */}
          <View style={S.editorCenter}>
            {/* Balloon with inline text input */}
            <View style={S.balloonArea}>
              {/* The displayed balloon */}
              <View style={[S.balloonBubble, { backgroundColor: bubbleColor }]}>
                <View style={S.balloonInner}>
                  {selectedSong && <WaveIcon size={13} color="#fff" />}
                  <View style={{ flex: 1 }}>
                    {selectedSong ? (
                      <>
                        <Text style={S.balloonSongTitle} numberOfLines={2}>{selectedSong.title}</Text>
                        <Text style={S.balloonSongArtist} numberOfLines={1}>{selectedSong.artistName}</Text>
                      </>
                    ) : (
                      <TextInput
                        style={S.balloonInput}
                        placeholder="Deixe uma nota..."
                        placeholderTextColor="rgba(255,255,255,0.45)"
                        value={noteText}
                        onChangeText={setNoteText}
                        multiline
                        maxLength={60}
                        returnKeyType="done"
                      />
                    )}
                  </View>
                </View>
                {/* Tail dots */}
                <View style={[S.balloonDot1, { backgroundColor: bubbleColor }]} />
                <View style={[S.balloonDot2, { backgroundColor: bubbleColor }]} />
              </View>

              {/* Avatar with overlaid action buttons */}
              <View style={S.avatarWrap}>
                <Image source={{ uri: avatarUrl }} style={S.avatarImg} />

                {/* Music button — bottom left of avatar */}
                <TouchableOpacity
                  style={[S.overlayBtn, S.overlayBtnLeft]}
                  onPress={() => setMode('musicPicker')}
                >
                  <Ionicons name="musical-notes" size={17} color="#FA2D7F" />
                </TouchableOpacity>

                {/* Color button — bottom right of avatar */}
                <TouchableOpacity
                  style={[S.overlayBtn, S.overlayBtnRight]}
                  onPress={() => setMode('colorPicker')}
                >
                  {bubbleColor !== DEFAULT_COLOR ? (
                    <View style={[S.colorDotBtn, { backgroundColor: bubbleColor }]} />
                  ) : (
                    <MaterialCommunityIcons name="palette" size={17} color="#B57BEE" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Share bar at bottom */}
          <View style={S.shareBar}>
            <View style={S.shareLeftRow}>
              <Ionicons name="people-outline" size={14} color="#FFFFFF" />
              <Text style={S.shareLeftText}>Compartilhar com amigos  ›</Text>
            </View>
            <TouchableOpacity
              style={[S.shareBtn, !canShare && S.shareBtnDisabled]}
              onPress={handleShare}
              disabled={!canShare}
            >
              <Text style={S.shareBtnText}>Compartilhar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  // Published
  publishedOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  publishedSheet: {
    backgroundColor: '#1C1C1E', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingBottom: 40, paddingHorizontal: 22, alignItems: 'center', paddingTop: 12, gap: 4,
  },
  handle: { width: 36, height: 4, backgroundColor: '#48484A', borderRadius: 2, marginBottom: 14, alignSelf: 'center' },
  publishedAvatarWrap: {
    width: 72, height: 72, borderRadius: 36, overflow: 'hidden',
    borderWidth: 2, borderColor: '#2C2C2E', marginBottom: 14,
  },
  publishedAvatar: { width: '100%', height: '100%' },
  publishedInfoBlock: { alignItems: 'center', gap: 4, marginBottom: 14, width: '100%' },
  publishedSongRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingHorizontal: 4 },
  publishedSongText: {
    color: '#FFFFFF', fontSize: 15, fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700', textAlign: 'center', flex: 1,
  },
  publishedNoteText: { color: 'rgba(255,255,255,0.65)', fontSize: 14, fontFamily: 'SimplyRounded', textAlign: 'center' },
  publishedMeta: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'SimplyRounded', marginTop: 2 },
  newNoteBtn: {
    backgroundColor: '#5B5BD6', borderRadius: 14, width: '100%',
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  newNoteBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'SimplyRounded-Bold', fontWeight: '700' },
  deleteRow: { marginTop: 14 },
  deleteText: { color: '#4F86F7', fontSize: 15, fontFamily: 'SimplyRounded' },

  // Color picker
  colorScreen: { flex: 1, backgroundColor: '#0A0A0C', alignItems: 'center' },
  colorHeader: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8,
  },
  colorBackBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#2A2A2E', alignItems: 'center', justifyContent: 'center',
  },
  colorHeaderTitle: { color: '#FFFFFF', fontSize: 17, fontFamily: 'SimplyRounded-Bold', fontWeight: '700' },
  colorPreviewArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  swatchRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 22, marginBottom: 14 },
  swatch: { width: 52, height: 52, borderRadius: 13 },
  swatchSelected: { borderWidth: 3, borderColor: '#FFFFFF' },
  pageDotsRow: { flexDirection: 'row', gap: 7, marginBottom: 22 },
  pageDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#444' },
  pageDotActive: { backgroundColor: '#FFFFFF' },
  applyBtn: {
    backgroundColor: '#5B5BD6', borderRadius: 14,
    width: '90%', paddingVertical: 16, alignItems: 'center', marginBottom: 12,
  },
  applyBtnText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'SimplyRounded-Bold', fontWeight: '700' },
  limparRow: { marginBottom: 24 },
  limparText: { color: '#5B5BD6', fontSize: 15, fontFamily: 'SimplyRounded' },

  // Music picker
  musicOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  musicSheet: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 18, borderTopRightRadius: 18, height: '90%' },
  musicHandleRow: { alignItems: 'center', paddingTop: 12, marginBottom: 6 },
  musicCloseBtn: { position: 'absolute', top: 14, left: 14, zIndex: 10 },
  musicCloseCircle: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#3A3A3C',
    alignItems: 'center', justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#2C2C2E',
    borderRadius: 12, marginHorizontal: 16, paddingHorizontal: 12,
    paddingVertical: 10, gap: 8, marginBottom: 12,
  },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 15, fontFamily: 'SimplyRounded', padding: 0 },
  tabsRow: { paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  tabPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#2C2C2E' },
  tabPillActive: { backgroundColor: '#FFFFFF' },
  tabPillText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontFamily: 'SimplyRounded-Bold', fontWeight: '600' },
  tabPillTextActive: { color: '#000000' },
  songList: { flex: 1 },
  currentSongRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 14, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2C2C2E',
    backgroundColor: 'rgba(91,91,214,0.12)',
  },
  songRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2C2C2E',
  },
  songRowSelected: { backgroundColor: 'rgba(255,255,255,0.06)' },
  songArt: { width: 48, height: 48, borderRadius: 6, backgroundColor: '#2C2C2E' },
  songInfo: { flex: 1 },
  songTitle: { color: '#FFFFFF', fontSize: 14, fontFamily: 'SimplyRounded-Bold', fontWeight: '700', marginBottom: 2 },
  songMeta: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'SimplyRounded' },
  emptyList: { alignItems: 'center', paddingTop: 48 },
  emptyText: { color: 'rgba(255,255,255,0.35)', fontSize: 14, fontFamily: 'SimplyRounded' },

  // Editor
  editorScreen: { flex: 1, backgroundColor: '#0A0A0C' },
  editorKAV: { flex: 1 },
  editorCloseBtn: { position: 'absolute', top: 16, left: 16, zIndex: 10 },
  editorCloseCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#2A2A2E', alignItems: 'center', justifyContent: 'center',
  },
  editorCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Balloon area
  balloonArea: { alignItems: 'center' },
  balloonBubble: {
    minWidth: 140, maxWidth: 200, borderRadius: 20,
    paddingHorizontal: 13, paddingVertical: 10,
    marginBottom: -8, zIndex: 2, position: 'relative',
  },
  balloonInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  balloonInput: {
    color: '#FFFFFF', fontSize: 14, fontFamily: 'SimplyRounded',
    padding: 0, minHeight: 36, maxHeight: 80,
  },
  balloonSongTitle: { color: '#FFF', fontSize: 13, fontFamily: 'SimplyRounded-Bold', fontWeight: '700', lineHeight: 18 },
  balloonSongArtist: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'SimplyRounded', marginTop: 1 },
  balloonDot1: { position: 'absolute', bottom: -5, left: 22, width: 9, height: 9, borderRadius: 4.5, zIndex: 3 },
  balloonDot2: { position: 'absolute', bottom: -10, left: 15, width: 5, height: 5, borderRadius: 2.5, zIndex: 3 },

  // Avatar with overlaid buttons
  avatarWrap: {
    width: 80, height: 80, borderRadius: 40,
    overflow: 'visible', zIndex: 1, position: 'relative',
  },
  avatarImg: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2, borderColor: '#1E2024',
  },
  overlayBtn: {
    position: 'absolute',
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#1E1E24',
    borderWidth: 2, borderColor: '#0A0A0C',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  overlayBtnLeft: { bottom: 0, left: -4 },
  overlayBtnRight: { bottom: 0, right: -4 },
  colorDotBtn: { width: 14, height: 14, borderRadius: 7 },

  // Share bar
  shareBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2A2A2E',
    backgroundColor: '#0A0A0C',
  },
  shareLeftRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shareLeftText: { color: '#FFFFFF', fontSize: 13, fontFamily: 'SimplyRounded' },
  shareBtn: { backgroundColor: '#5B5BD6', borderRadius: 24, paddingHorizontal: 22, paddingVertical: 11 },
  shareBtnDisabled: { opacity: 0.35 },
  shareBtnText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'SimplyRounded-Bold', fontWeight: '700' },
});
