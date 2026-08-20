/**
 * MyNoteModal — Instagram Music Notes editor.
 *
 * Screens:
 *  1. "editor"      — Black screen: compact balloon with inline TextInput,
 *                     music + color buttons overlaid on avatar. Share bar.
 *  2. "colorPicker" — Full screen: header "< Editor de balão", centered preview,
 *                     HORIZONTAL SCROLLABLE color swatches, page dots, Aplicar/Limpar.
 *  3. "musicPicker" — Bottom sheet: search + tabs + downloaded tracks.
 *  4. "published"   — Bottom sheet: avatar, song+text info, "Deixar nova nota", "Excluir nota".
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
import { MarqueeText } from '../../common/MarqueeText';

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
// All colors in one flat list for horizontal scroll
// ──────────────────────────────────────────────────────────────────────────────
const ALL_COLORS = [
  // Page 1 (lavender → purple → deep purple → pink → magenta → wine)
  '#B57BEE', '#8B5CF6', '#6D28D9', '#F472B6', '#EC4899', '#9D174D',
  // Page 2
  '#EF4444', '#DC2626', '#0EA5E9', '#0284C7', '#10B981', '#059669',
  // Page 3
  '#F97316', '#EA580C', '#EAB308', '#CA8A04', '#6366F1', '#4338CA',
  // Page 4
  '#84CC16', '#4D7C0F', '#06B6D4', '#0E7490', '#F43F5E', '#BE123C',
  // Page 5
  '#64748B', '#475569', '#A16207', '#92400E', '#7C3AED', '#5B21B6',
];

// Page groups of 6 for dot indicators
const COLORS_PER_PAGE = 6;
const PAGE_COUNT = Math.ceil(ALL_COLORS.length / COLORS_PER_PAGE);

const DEFAULT_COLOR = '#25272D';
const NOTE_TEXT_LIMIT = 30;

// ──────────────────────────────────────────────────────────────────────────────
// Animated 3-bar wave icon
// ──────────────────────────────────────────────────────────────────────────────
const WaveIcon = ({ size = 13, color = '#fff' }: { size?: number; color?: string }) => {
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
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: size + 2, flexShrink: 0 }}>
      {[a1, a2, a3].map((a, i) => (
        <Animated.View key={i} style={{ width: 2.5, borderRadius: 1.25, backgroundColor: color, height: a }} />
      ))}
    </View>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Compact balloon preview (same visual as the carousel notes)
// ──────────────────────────────────────────────────────────────────────────────
const CompactBubblePreview = ({
  text, songTitle, songArtist, bubbleColor, avatarUrl,
}: {
  text: string; songTitle?: string; songArtist?: string;
  bubbleColor: string; avatarUrl: string;
}) => {
  const bg = bubbleColor || DEFAULT_COLOR;
  const titleLine = songTitle || (text && text !== '' ? text : 'Deixe uma nota...');
  const artistLine = songTitle ? songArtist : undefined;
  const customLine = songTitle && text ? text.slice(0, NOTE_TEXT_LIMIT) : undefined;
  const isEmpty = !songTitle && !text;

  return (
    <View style={bp.wrapper}>
      {/* Compact bubble matching carousel size */}
      <View style={[bp.bubble, { backgroundColor: bg }]}>
        <View style={bp.row}>
          {songTitle && <WaveIcon size={12} color="#fff" />}
          <View style={bp.textFlex}>
            <MarqueeText
              text={titleLine}
              style={[bp.line1, isEmpty && bp.placeholder]}
              align="left"
              fadeWidth={4}
            />
            {artistLine ? (
              <MarqueeText text={artistLine} style={bp.line2} align="left" fadeWidth={4} />
            ) : null}
            {customLine ? (
              <MarqueeText text={customLine} style={bp.line3} align="left" fadeWidth={4} />
            ) : null}
          </View>
        </View>
        <View style={[bp.dot1, { backgroundColor: bg }]} />
        <View style={[bp.dot2, { backgroundColor: bg }]} />
      </View>
      {/* Avatar */}
      <View style={bp.avatar}>
        <Image source={{ uri: avatarUrl }} style={bp.avatarImg} />
      </View>
    </View>
  );
};

const bp = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  bubble: {
    width: 97,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: -6,
    zIndex: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' },
  textFlex: { flex: 1, overflow: 'hidden' },
  line1: { color: '#FFF', fontSize: 11.5, fontFamily: 'SimplyRounded-Bold', fontWeight: '700' },
  placeholder: { color: 'rgba(255,255,255,0.45)', fontFamily: 'SimplyRounded', fontWeight: '400' },
  line2: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: 'SimplyRounded', marginTop: 1 },
  line3: { color: 'rgba(255,255,255,0.42)', fontSize: 9.5, fontFamily: 'SimplyRounded', fontStyle: 'italic', marginTop: 1 },
  dot1: { position: 'absolute', bottom: -5, left: 16, width: 7, height: 7, borderRadius: 3.5, zIndex: 3 },
  dot2: { position: 'absolute', bottom: -9, left: 11, width: 4, height: 4, borderRadius: 2, zIndex: 3 },
  avatar: {
    width: 70, height: 70, borderRadius: 35,
    borderWidth: 2, borderColor: '#1E2024',
    overflow: 'hidden', zIndex: 1, backgroundColor: '#111',
  },
  avatarImg: { width: '100%', height: '100%' },
});

// ──────────────────────────────────────────────────────────────────────────────
// Inline balloon for editor (slightly bigger for readability, same shape)
// ──────────────────────────────────────────────────────────────────────────────
const EditorBalloon = ({
  noteText, selectedSong, bubbleColor,
  onChangeText, onRemoveSong,
}: {
  noteText: string;
  selectedSong: { title: string; artistName: string } | null;
  bubbleColor: string;
  onChangeText: (t: string) => void;
  onRemoveSong: () => void;
}) => {
  const bg = bubbleColor || DEFAULT_COLOR;
  return (
    <View style={[eb.bubble, { backgroundColor: bg }]}>
      <View style={eb.inner}>
        {selectedSong && <WaveIcon size={13} color="#fff" />}
        <View style={eb.textBlock}>
          {selectedSong ? (
            <TouchableOpacity onLongPress={onRemoveSong} activeOpacity={0.8}>
              <Text style={eb.songTitle} numberOfLines={1}>{selectedSong.title}</Text>
              <Text style={eb.songArtist} numberOfLines={1}>{selectedSong.artistName}</Text>
            </TouchableOpacity>
          ) : null}
          <TextInput
            style={[eb.input, selectedSong ? eb.inputWithSong : eb.inputAlone]}
            placeholder={selectedSong ? 'Escreva algo...' : 'Deixe uma nota...'}
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={noteText}
            onChangeText={(t) => onChangeText(t.slice(0, NOTE_TEXT_LIMIT))}
            multiline={false}
            maxLength={NOTE_TEXT_LIMIT}
          />
        </View>
      </View>
      {/* Tail dots */}
      <View style={[eb.dot1, { backgroundColor: bg }]} />
      <View style={[eb.dot2, { backgroundColor: bg }]} />
    </View>
  );
};

const eb = StyleSheet.create({
  bubble: {
    width: 130, borderRadius: 18,
    paddingHorizontal: 10, paddingVertical: 8,
    marginBottom: -7, zIndex: 2, position: 'relative',
  },
  inner: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  textBlock: { flex: 1 },
  songTitle: { color: '#FFF', fontSize: 12, fontFamily: 'SimplyRounded-Bold', fontWeight: '700' },
  songArtist: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: 'SimplyRounded', marginBottom: 3 },
  input: {
    color: '#FFFFFF', fontSize: 12, fontFamily: 'SimplyRounded',
    padding: 0, includeFontPadding: false,
  },
  inputAlone: { minHeight: 28 },
  inputWithSong: { minHeight: 20 },
  dot1: { position: 'absolute', bottom: -5, left: 18, width: 7, height: 7, borderRadius: 3.5, zIndex: 3 },
  dot2: { position: 'absolute', bottom: -9, left: 13, width: 4, height: 4, borderRadius: 2, zIndex: 3 },
});

// ──────────────────────────────────────────────────────────────────────────────
// Horizontal color picker with page dots
// ──────────────────────────────────────────────────────────────────────────────
const ColorSwatchRow = ({
  selectedColor, onSelect,
}: {
  selectedColor: string; onSelect: (c: string) => void;
}) => {
  const scrollRef = React.useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = React.useState(0);

  const handleScroll = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const page = Math.round(x / (COLORS_PER_PAGE * 58)); // swatch (46) + gap (12) * 6
    setCurrentPage(Math.max(0, Math.min(PAGE_COUNT - 1, page)));
  };

  return (
    <View style={cs.wrapper}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={cs.row}
        scrollEventThrottle={16}
        onScroll={handleScroll}
      >
        {ALL_COLORS.map((color) => (
          <TouchableOpacity
            key={color}
            style={[cs.swatch, { backgroundColor: color }, selectedColor === color && cs.swatchSelected]}
            onPress={() => onSelect(color)}
            activeOpacity={0.75}
          />
        ))}
      </ScrollView>
      {/* Page dots */}
      <View style={cs.dotsRow}>
        {Array.from({ length: PAGE_COUNT }).map((_, i) => (
          <View key={i} style={[cs.dot, i === currentPage && cs.dotActive]} />
        ))}
      </View>
    </View>
  );
};

const cs = StyleSheet.create({
  wrapper: { width: '100%', alignItems: 'center' },
  row: { paddingHorizontal: 20, gap: 10 },
  swatch: { width: 46, height: 46, borderRadius: 12 },
  swatchSelected: { borderWidth: 3, borderColor: '#FFFFFF' },
  dotsRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#444' },
  dotActive: { backgroundColor: '#FFFFFF' },
});

// ──────────────────────────────────────────────────────────────────────────────
// Tabs and downloaded track types
// ──────────────────────────────────────────────────────────────────────────────
const MUSIC_TABS = ['Para você', 'Em alta', 'Salvos', 'Áudio original'];

interface DownloadedTrack {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName?: string;
  imageURL?: string;
  localImagePath?: string;
  duration_ms?: number;
}

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
  const [searchQuery, setSearchQuery] = React.useState('');
  const [musicTab, setMusicTab] = React.useState(0);
  const [downloadedTracks, setDownloadedTracks] = React.useState<DownloadedTrack[]>([]);

  // Load downloaded tracks when music picker opens
  React.useEffect(() => {
    if (mode === 'musicPicker') {
      AsyncStorage.getItem('openfy_downloads').then((raw) => {
        if (raw) {
          try { setDownloadedTracks(JSON.parse(raw) as DownloadedTrack[]); } catch {}
        }
      }).catch(() => {});
    }
  }, [mode]);

  // Reset when modal opens
  React.useEffect(() => {
    if (!visible) return;
    if (currentNote) {
      setMode('published');
      setNoteText(currentNote.text || '');
      setBubbleColor(currentNote.bubbleColor || DEFAULT_COLOR);
      setSelectedSong(currentNote.songTitle ? {
        spotifyId: currentNote.songSpotifyId || '',
        title: currentNote.songTitle,
        artistName: currentNote.songArtist || '',
        duration_ms: currentNote.songDuration,
      } : null);
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
      text: noteText.slice(0, NOTE_TEXT_LIMIT),
      songTitle: selectedSong?.title,
      songArtist: selectedSong?.artistName,
      songSpotifyId: selectedSong?.spotifyId,
      songDuration: selectedSong?.duration_ms,
      bubbleColor,
    });
    onClose();
  };

  const canShare = noteText.trim().length > 0 || selectedSong !== null;

  const filteredTracks = searchQuery.trim()
    ? downloadedTracks.filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.artistName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : downloadedTracks;

  // ── Screen 4: Published ───────────────────────────────────────────────────
  if (mode === 'published' && currentNote) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={S.publishedOverlay} onPress={onClose}>
          <Pressable style={S.publishedSheet} onPress={(e) => e.stopPropagation()}>
            <View style={S.handle} />

            <CompactBubblePreview
              text={currentNote.text || ''}
              songTitle={currentNote.songTitle}
              songArtist={currentNote.songArtist}
              bubbleColor={currentNote.bubbleColor}
              avatarUrl={avatarUrl}
            />

            <View style={S.publishedInfoBlock}>
              {currentNote.songTitle && (
                <Text style={S.publishedSongText} numberOfLines={2}>
                  {`${currentNote.songTitle} · ${currentNote.songArtist}`}
                </Text>
              )}
              {currentNote.text ? (
                <Text style={S.publishedNoteText}>{currentNote.text}</Text>
              ) : null}
              <Text style={S.publishedMeta}>Compartilhada com amigos · agora</Text>
            </View>

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

  // ── Screen 2: Color picker ────────────────────────────────────────────────
  if (mode === 'colorPicker') {
    return (
      <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={() => setMode('editor')}>
        <SafeAreaView style={S.colorScreen}>
          <View style={S.colorHeader}>
            <TouchableOpacity style={S.colorBackBtn} onPress={() => setMode('editor')}>
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={S.colorHeaderTitle}>Editor de balão</Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Live preview centered */}
          <View style={S.colorPreviewArea}>
            <CompactBubblePreview
              text={noteText}
              songTitle={selectedSong?.title}
              songArtist={selectedSong?.artistName}
              bubbleColor={bubbleColor}
              avatarUrl={avatarUrl}
            />
          </View>

          {/* Horizontal color scroller */}
          <ColorSwatchRow selectedColor={bubbleColor} onSelect={setBubbleColor} />

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

  // ── Screen 3: Music picker ────────────────────────────────────────────────
  if (mode === 'musicPicker') {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setMode('editor')}>
        <View style={S.musicOverlay}>
          <View style={S.musicSheet}>
            <View style={S.musicHandleRow}>
              <View style={S.handle} />
            </View>
            <TouchableOpacity style={S.musicCloseBtn} onPress={() => setMode('editor')}>
              <View style={S.musicCloseCircle}>
                <Ionicons name="close" size={16} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

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

            <FlatList
              data={filteredTracks}
              keyExtractor={(t) => t.spotifyId}
              style={S.songList}
              ListHeaderComponent={
                currentTrack ? (
                  <TouchableOpacity
                    style={S.currentSongRow}
                    onPress={() => {
                      setSelectedSong({
                        spotifyId: currentTrack.spotifyId,
                        title: currentTrack.title,
                        artistName: currentTrack.artistName,
                        imageURL: currentTrack.imageURL,
                        duration_ms: currentTrack.duration_ms,
                      });
                      setMode('editor');
                    }}
                  >
                    <Image source={{ uri: currentTrack.imageURL }} style={S.songArt} />
                    <View style={S.songInfo}>
                      <Text style={S.songTitle} numberOfLines={1}>{currentTrack.title}</Text>
                      <Text style={S.songMeta} numberOfLines={1}>{currentTrack.artistName} · Tocando agora</Text>
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
                      : 'Nenhum resultado.'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[S.songRow, selectedSong?.spotifyId === item.spotifyId && S.songRowSelected]}
                  onPress={() => { setSelectedSong(item); setMode('editor'); }}
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

  // ── Screen 1: Editor ──────────────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={S.editorScreen}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={S.editorKAV}
        >
          <TouchableOpacity style={S.editorCloseBtn} onPress={onClose}>
            <View style={S.editorCloseCircle}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          {/* Char counter */}
          {(noteText.length > 20) && (
            <Text style={S.charCounter}>{NOTE_TEXT_LIMIT - noteText.length}</Text>
          )}

          {/* Balloon + Avatar centered */}
          <View style={S.editorCenter}>
            <View style={S.balloonArea}>
              <EditorBalloon
                noteText={noteText}
                selectedSong={selectedSong}
                bubbleColor={bubbleColor}
                onChangeText={setNoteText}
                onRemoveSong={() => setSelectedSong(null)}
              />

              {/* Avatar with overlaid action buttons */}
              <View style={S.avatarWrap}>
                <Image source={{ uri: avatarUrl }} style={S.avatarImg} />

                {/* Music button — bottom left */}
                <TouchableOpacity
                  style={[S.overlayBtn, S.overlayBtnLeft]}
                  onPress={() => setMode('musicPicker')}
                >
                  <Ionicons name="musical-notes" size={15} color="#FA2D7F" />
                </TouchableOpacity>

                {/* Color button — bottom right */}
                <TouchableOpacity
                  style={[S.overlayBtn, S.overlayBtnRight]}
                  onPress={() => setMode('colorPicker')}
                >
                  {bubbleColor !== DEFAULT_COLOR ? (
                    <View style={[S.colorDotBtn, { backgroundColor: bubbleColor }]} />
                  ) : (
                    <MaterialCommunityIcons name="palette" size={15} color="#B57BEE" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Share bar */}
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
const S = StyleSheet.create({
  // Published
  publishedOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  publishedSheet: {
    backgroundColor: '#1C1C1E', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingBottom: 40, paddingHorizontal: 22, alignItems: 'center', paddingTop: 12, gap: 12,
  },
  handle: { width: 36, height: 4, backgroundColor: '#48484A', borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  publishedInfoBlock: { alignItems: 'center', gap: 4, width: '100%', marginTop: 12 },
  publishedSongText: {
    color: '#FFFFFF', fontSize: 15, fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700', textAlign: 'center',
  },
  publishedNoteText: { color: 'rgba(255,255,255,0.65)', fontSize: 14, fontFamily: 'SimplyRounded', textAlign: 'center' },
  publishedMeta: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'SimplyRounded' },
  newNoteBtn: {
    backgroundColor: '#5B5BD6', borderRadius: 14, width: '100%',
    paddingVertical: 16, alignItems: 'center',
  },
  newNoteBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'SimplyRounded-Bold', fontWeight: '700' },
  deleteRow: {},
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
  applyBtn: {
    backgroundColor: '#5B5BD6', borderRadius: 14,
    width: '90%', paddingVertical: 16, alignItems: 'center', marginTop: 22, marginBottom: 12,
  },
  applyBtnText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'SimplyRounded-Bold', fontWeight: '700' },
  limparRow: { marginBottom: 28 },
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
  charCounter: {
    position: 'absolute', top: 22, right: 18, zIndex: 10,
    color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'SimplyRounded',
  },
  editorCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  balloonArea: { alignItems: 'center' },
  avatarWrap: {
    width: 78, height: 78, borderRadius: 39,
    overflow: 'visible', zIndex: 1, position: 'relative',
  },
  avatarImg: {
    width: 78, height: 78, borderRadius: 39,
    borderWidth: 2, borderColor: '#1E2024',
  },
  overlayBtn: {
    position: 'absolute',
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#1E1E24',
    borderWidth: 2, borderColor: '#0A0A0C',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  overlayBtnLeft: { bottom: 2, left: -6 },
  overlayBtnRight: { bottom: 2, right: -6 },
  colorDotBtn: { width: 13, height: 13, borderRadius: 6.5 },
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
