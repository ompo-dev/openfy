/**
 * MyNoteModal — Instagram Music Notes pixel-perfect replica
 *
 * 4 screens/modes:
 *  1. "editor"      — Full black screen: balloon + avatar centered, music/GIF buttons, share bar, keyboard
 *  2. "colorPicker" — Full screen: back + "Editor de balão" header, preview, 6 swatches row, page dots, Aplicar/Limpar
 *  3. "musicPicker" — Bottom sheet: search + tabs (Para você/Em alta/Salvos/Áudio original) + music list
 *  4. "published"   — Bottom sheet: avatar, song+text info, "Ver comentários", "Deixar nova nota", "Excluir nota"
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
// Color palette (6 per page, 5 pages)
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
// Animated 3-bar wave icon (plays when active)
// ──────────────────────────────────────────────────────────────────────────────
const WaveIcon = ({ size = 14, color = '#fff' }: { size?: number; color?: string }) => {
  const a1 = React.useRef(new Animated.Value(size * 0.5)).current;
  const a2 = React.useRef(new Animated.Value(size)).current;
  const a3 = React.useRef(new Animated.Value(size * 0.65)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(a1, { toValue: size, duration: 280, useNativeDriver: false }),
        Animated.timing(a2, { toValue: size * 0.4, duration: 300, useNativeDriver: false }),
        Animated.timing(a3, { toValue: size * 0.9, duration: 260, useNativeDriver: false }),
      ]),
      Animated.parallel([
        Animated.timing(a1, { toValue: size * 0.5, duration: 280, useNativeDriver: false }),
        Animated.timing(a2, { toValue: size, duration: 300, useNativeDriver: false }),
        Animated.timing(a3, { toValue: size * 0.65, duration: 260, useNativeDriver: false }),
      ]),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: size + 2 }}>
      {[a1, a2, a3].map((a, i) => (
        <Animated.View key={i} style={{ width: 2.5, borderRadius: 1.5, backgroundColor: color, height: a }} />
      ))}
    </View>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Live bubble preview (used in editor and colorPicker screens)
// ──────────────────────────────────────────────────────────────────────────────
const BubblePreview = ({
  text,
  songTitle,
  songArtist,
  bubbleColor,
  avatarUrl,
  showWave = false,
}: {
  text: string;
  songTitle?: string;
  songArtist?: string;
  bubbleColor: string;
  avatarUrl: string;
  showWave?: boolean;
}) => {
  const bg = bubbleColor || DEFAULT_COLOR;
  const displayLine1 = songTitle || text || 'Deixe uma nota...';
  const displayLine2 = songTitle ? songArtist : undefined;
  const isEmpty = !songTitle && !text;

  return (
    <View style={bpStyles.wrapper}>
      <View style={[bpStyles.bubble, { backgroundColor: bg }]}>
        <View style={bpStyles.row}>
          {showWave && <WaveIcon size={14} color="#fff" />}
          <View style={bpStyles.textBlock}>
            <Text
              style={[bpStyles.line1, isEmpty && bpStyles.placeholder]}
              numberOfLines={2}
            >
              {displayLine1}
            </Text>
            {displayLine2 ? (
              <Text style={bpStyles.line2} numberOfLines={1}>{displayLine2}</Text>
            ) : null}
          </View>
        </View>
        {/* Tail dots */}
        <View style={[bpStyles.dot1, { backgroundColor: bg }]} />
        <View style={[bpStyles.dot2, { backgroundColor: bg }]} />
      </View>
      {/* Avatar */}
      <View style={bpStyles.avatar}>
        <Image source={{ uri: avatarUrl }} style={bpStyles.avatarImg} />
      </View>
    </View>
  );
};

const bpStyles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  bubble: {
    minWidth: 140,
    maxWidth: 200,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: -8,
    zIndex: 2,
    position: 'relative',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  textBlock: { flex: 1 },
  line1: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
    lineHeight: 18,
  },
  placeholder: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'SimplyRounded',
    fontWeight: '400',
  },
  line2: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: 'SimplyRounded',
    marginTop: 2,
  },
  dot1: {
    position: 'absolute', bottom: -5, left: 22,
    width: 9, height: 9, borderRadius: 4.5, zIndex: 3,
  },
  dot2: {
    position: 'absolute', bottom: -10, left: 15,
    width: 5, height: 5, borderRadius: 2.5, zIndex: 3,
  },
  avatar: {
    width: 78, height: 78, borderRadius: 39,
    borderWidth: 2, borderColor: '#1E2024',
    overflow: 'hidden', zIndex: 1,
    backgroundColor: '#111',
  },
  avatarImg: { width: '100%', height: '100%' },
});

// ──────────────────────────────────────────────────────────────────────────────
// Sample "Para você" song list for the music picker
// ──────────────────────────────────────────────────────────────────────────────
const SAMPLE_SONGS = [
  {
    id: 'sp1', title: 'Cidade Alta', explicit: true,
    artists: 'Scarlet Mob, Midazs, Aranha4real', stats: '49...', duration: '3:12',
    artUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=80&auto=format&fit=crop',
  },
  {
    id: 'sp2', title: 'Por Inteiro', explicit: false,
    artists: 'MC Menor da L, Alec, DJ Kiel', stats: '125 reel...', duration: '2:50',
    artUrl: 'https://images.unsplash.com/photo-1571974599782-87624638275b?w=80&auto=format&fit=crop',
  },
  {
    id: 'sp3', title: 'Culpa Minha', explicit: false,
    artists: 'Mozart Mz', stats: '6 reels', duration: '2:08',
    artUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=80&auto=format&fit=crop',
  },
  {
    id: 'sp4', title: 'A Cosmologia Corporativista do Se...', explicit: true,
    artists: 'FBC, Coyote Beatz, Pepito', stats: '84 reel...', duration: '4:01',
    artUrl: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=80&auto=format&fit=crop',
  },
  {
    id: 'sp5', title: 'Amar, Viver e Sorrir', explicit: true,
    artists: 'Ninjahmen', stats: '59 reels', duration: '2:26',
    artUrl: 'https://images.unsplash.com/photo-1598387993441-a364f854cfba?w=80&auto=format&fit=crop',
  },
  {
    id: 'sp6', title: 'Tattoo (feat. Luccas Carlos, Vulto)', explicit: false,
    artists: 'Fabio Brazza', stats: '618 reels', duration: '3:10',
    artUrl: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=80&auto=format&fit=crop',
  },
  {
    id: 'sp7', title: 'quarta-feira', explicit: false,
    artists: 'Sazack, Nolly, Matheus Muniz, Matt', stats: '1...', duration: '2:45',
    artUrl: 'https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=80&auto=format&fit=crop',
  },
  {
    id: 'sp8', title: 'Cigarro e Vinho', explicit: true,
    artists: 'Ninjahmen', stats: '4 reels', duration: '3:03',
    artUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=80&auto=format&fit=crop',
  },
];

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
  const [selectedSong, setSelectedSong] = React.useState<typeof SAMPLE_SONGS[0] | null>(null);
  const [bubbleColor, setBubbleColor] = React.useState(DEFAULT_COLOR);
  const [colorPage, setColorPage] = React.useState(0);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [musicTab, setMusicTab] = React.useState(0);
  const [savedBookmarks, setSavedBookmarks] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!visible) return;
    if (currentNote) {
      setMode('published');
      setNoteText(currentNote.text || '');
      setBubbleColor(currentNote.bubbleColor || DEFAULT_COLOR);
      if (currentNote.songTitle) {
        setSelectedSong({
          id: currentNote.songSpotifyId || 'saved',
          title: currentNote.songTitle,
          explicit: false,
          artists: currentNote.songArtist || '',
          stats: '',
          duration: '',
          artUrl: avatarUrl,
        });
      } else {
        setSelectedSong(null);
      }
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
      songArtist: selectedSong?.artists,
      songSpotifyId: selectedSong?.id,
      bubbleColor,
    });
    onClose();
  };

  const handlePickCurrentSong = () => {
    if (currentTrack) {
      setSelectedSong({
        id: currentTrack.spotifyId,
        title: currentTrack.title,
        artists: currentTrack.artistName,
        explicit: false,
        stats: '',
        duration: '',
        artUrl: currentTrack.imageURL,
      });
    }
    setMode('editor');
  };

  const handleDeleteNote = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
    onDelete();
    onClose();
  };

  const canShare = noteText.trim().length > 0 || selectedSong !== null;

  // ── SCREEN 4: Published bottom sheet ──────────────────────────────────────
  if (mode === 'published' && currentNote) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={S.publishedOverlay} onPress={onClose}>
          <Pressable style={S.publishedSheet} onPress={(e) => e.stopPropagation()}>
            {/* Drag handle */}
            <View style={S.handle} />

            {/* Avatar */}
            <View style={S.publishedAvatarWrap}>
              <Image source={{ uri: avatarUrl }} style={S.publishedAvatar} />
            </View>

            {/* Song + text info */}
            <View style={S.publishedInfoBlock}>
              <View style={S.publishedTitleRow}>
                <WaveIcon size={13} color="#FFFFFF" />
                <Text style={S.publishedSongText} numberOfLines={2}>
                  {currentNote.songTitle
                    ? `${currentNote.songTitle} · ${currentNote.songArtist}${currentNote.songSpotifyId ? ' 🄴' : ''}`
                    : currentNote.text}
                </Text>
              </View>
              {currentNote.text && currentNote.songTitle && (
                <Text style={S.publishedNoteText}>{currentNote.text}</Text>
              )}
              <Text style={S.publishedMeta}>Compartilhada com amigos · agora</Text>
            </View>

            {/* Ver comentários */}
            <TouchableOpacity style={S.commentRow} onPress={onClose}>
              <Ionicons name="chatbubble-outline" size={17} color="#4F86F7" />
              <Text style={S.commentText}>Ver comentários</Text>
            </TouchableOpacity>

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

            {/* Excluir nota */}
            <TouchableOpacity onPress={handleDeleteNote} style={S.deleteRow}>
              <Text style={S.deleteText}>Excluir nota</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  // ── SCREEN 2: Color Picker full screen ────────────────────────────────────
  if (mode === 'colorPicker') {
    return (
      <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={() => setMode('editor')}>
        <SafeAreaView style={S.colorPickerScreen}>
          {/* Header */}
          <View style={S.colorHeader}>
            <TouchableOpacity style={S.colorBackBtn} onPress={() => setMode('editor')}>
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={S.colorHeaderTitle}>Editor de balão</Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Live preview — centered */}
          <View style={S.colorPreviewArea}>
            <BubblePreview
              text={noteText}
              songTitle={selectedSong?.title}
              songArtist={selectedSong?.artists}
              bubbleColor={bubbleColor}
              avatarUrl={avatarUrl}
            />
          </View>

          {/* 6 Color swatches in a row */}
          <View style={S.swatchRow}>
            {COLOR_PAGES[colorPage].map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  S.swatch,
                  { backgroundColor: color },
                  bubbleColor === color && S.swatchSelected,
                ]}
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

          {/* Aplicar button */}
          <TouchableOpacity style={S.applyBtn} onPress={() => setMode('editor')}>
            <Text style={S.applyBtnText}>Aplicar</Text>
          </TouchableOpacity>

          {/* Limpar */}
          <TouchableOpacity
            style={S.limparRow}
            onPress={() => {
              setBubbleColor(DEFAULT_COLOR);
              setMode('editor');
            }}
          >
            <Text style={S.limparText}>Limpar</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    );
  }

  // ── SCREEN 3: Music Picker bottom sheet ───────────────────────────────────
  if (mode === 'musicPicker') {
    const filteredSongs = searchQuery.trim()
      ? SAMPLE_SONGS.filter(
          (s) =>
            s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.artists.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : SAMPLE_SONGS;

    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setMode('editor')}>
        <View style={S.musicPickerOverlay}>
          <View style={S.musicPickerSheet}>
            {/* Handle + X */}
            <View style={S.musicPickerTopRow}>
              <View style={S.handle} />
            </View>
            <TouchableOpacity style={S.musicPickerClose} onPress={() => setMode('editor')}>
              <View style={S.musicPickerCloseCircle}>
                <Ionicons name="close" size={16} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            {/* Search bar */}
            <View style={S.searchBar}>
              <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={S.searchInput}
                placeholder="Pesquisar..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Tab pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={S.tabsRow}
            >
              {MUSIC_TABS.map((tab, i) => (
                <TouchableOpacity
                  key={tab}
                  style={[S.tabPill, i === musicTab && S.tabPillActive]}
                  onPress={() => setMusicTab(i)}
                >
                  <Text style={[S.tabPillText, i === musicTab && S.tabPillTextActive]}>
                    {tab}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Song list */}
            <FlatList
              data={filteredSongs}
              keyExtractor={(s) => s.id}
              style={S.songList}
              ListHeaderComponent={
                /* Spotify share row */
                <TouchableOpacity style={S.spotifyRow}>
                  <View style={S.spotifyIconBox}>
                  <MaterialCommunityIcons name="spotify" size={24} color="#1DB954" />
                </View>
                  <View style={S.spotifyTextBlock}>
                    <Text style={S.spotifyTitle}>Compartilhar do Spotify</Text>
                    <Text style={S.spotifyDesc}>
                      Compartilhe continuamente as músicas que você estiver ouvindo.{' '}
                      <Text style={S.spotifyLink}>Como funciona</Text>
                    </Text>
                  </View>
                  <View style={S.spotifyArrow}>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
              }
              renderItem={({ item }) => {
                const isBookmarked = savedBookmarks.has(item.id);
                const isSelected = selectedSong?.id === item.id;
                return (
                  <TouchableOpacity
                    style={[S.songRow, isSelected && S.songRowSelected]}
                    onPress={() => {
                      setSelectedSong(item);
                      setMode('editor');
                    }}
                  >
                    <Image source={{ uri: item.artUrl }} style={S.songArt} />
                    <View style={S.songInfo}>
                      <View style={S.songTitleRow}>
                        <Text style={S.songTitle} numberOfLines={1}>{item.title}</Text>
                        {item.explicit && (
                          <View style={S.explicitBadge}>
                            <Text style={S.explicitText}>E</Text>
                          </View>
                        )}
                      </View>
                      <Text style={S.songMeta} numberOfLines={1}>
                        {item.artists}
                        {item.stats ? ` · ${item.stats}` : ''}
                        {item.duration ? ` · ${item.duration}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        setSavedBookmarks((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        });
                      }}
                    >
                      <Ionicons
                        name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                        size={20}
                        color={isBookmarked ? '#FFFFFF' : 'rgba(255,255,255,0.5)'}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    );
  }

  // ── SCREEN 1: Main Editor (full black screen) ─────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={S.editorScreen}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={S.editorKAV}
        >
          {/* X close button — top left */}
          <TouchableOpacity style={S.editorCloseBtn} onPress={onClose}>
            <View style={S.editorCloseCircle}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          {/* Center area: bubble + avatar */}
          <View style={S.editorCenter}>
            <BubblePreview
              text={noteText}
              songTitle={selectedSong?.title}
              songArtist={selectedSong?.artists}
              bubbleColor={bubbleColor}
              avatarUrl={avatarUrl}
            />

            {/* Music & GIF buttons below avatar */}
            <View style={S.editorActionBtns}>
              <TouchableOpacity
                style={S.editorActionBtn}
                onPress={() => setMode('musicPicker')}
              >
                <Ionicons name="musical-note" size={22} color="#E91E8C" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.editorActionBtn, S.gifBtn]}
                onPress={() => {}}
              >
                <Text style={S.gifText}>GIF</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Note text input (transparent, centered over bubble area) */}
          {!selectedSong && (
            <TextInput
              style={S.editorTextInput}
              placeholder="Deixe uma nota..."
              placeholderTextColor="rgba(255,255,255,0)"
              value={noteText}
              onChangeText={setNoteText}
              multiline
              maxLength={60}
              textAlign="center"
            />
          )}

          {/* Bottom share bar */}
          <View style={S.editorShareBar}>
            <TouchableOpacity style={S.shareLeftRow} onPress={() => setMode('colorPicker')}>
              <Ionicons name="people-outline" size={14} color="#FFF" />
              <Text style={S.shareLeftText}>Compartilhar com amigos  ›</Text>
            </TouchableOpacity>
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
  // ── Published ──────────────────────────────────────────────────────────────
  publishedOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  publishedSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
    paddingTop: 12,
    gap: 4,
  },
  handle: {
    width: 36, height: 4, backgroundColor: '#48484A',
    borderRadius: 2, marginBottom: 14, alignSelf: 'center',
  },
  publishedAvatarWrap: {
    width: 72, height: 72, borderRadius: 36, overflow: 'hidden',
    borderWidth: 2, borderColor: '#2C2C2E', marginBottom: 14,
  },
  publishedAvatar: { width: '100%', height: '100%' },
  publishedInfoBlock: { alignItems: 'center', gap: 3, marginBottom: 10 },
  publishedTitleRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    paddingHorizontal: 8,
  },
  publishedSongText: {
    color: '#FFFFFF', fontSize: 15, fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700', textAlign: 'center', flex: 1,
  },
  publishedNoteText: {
    color: 'rgba(255,255,255,0.7)', fontSize: 14,
    fontFamily: 'SimplyRounded', textAlign: 'center',
  },
  publishedMeta: {
    color: 'rgba(255,255,255,0.4)', fontSize: 12,
    fontFamily: 'SimplyRounded', marginTop: 2,
  },
  commentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    marginVertical: 8,
  },
  commentText: {
    color: '#4F86F7', fontSize: 15, fontFamily: 'SimplyRounded',
  },
  newNoteBtn: {
    backgroundColor: '#5B5BD6',
    borderRadius: 14, width: '100%',
    paddingVertical: 15, alignItems: 'center',
    marginTop: 10,
  },
  newNoteBtnText: {
    color: '#FFF', fontSize: 16,
    fontFamily: 'SimplyRounded-Bold', fontWeight: '700',
  },
  deleteRow: { marginTop: 12 },
  deleteText: {
    color: '#4F86F7', fontSize: 15, fontFamily: 'SimplyRounded',
  },

  // ── Color Picker ───────────────────────────────────────────────────────────
  colorPickerScreen: {
    flex: 1, backgroundColor: '#0A0A0C', alignItems: 'center',
  },
  colorHeader: {
    width: '100%', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  colorBackBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#2A2A2E',
    alignItems: 'center', justifyContent: 'center',
  },
  colorHeaderTitle: {
    color: '#FFFFFF', fontSize: 17,
    fontFamily: 'SimplyRounded-Bold', fontWeight: '700',
  },
  colorPreviewArea: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  swatchRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, marginBottom: 14,
  },
  swatch: {
    width: 52, height: 52, borderRadius: 13,
  },
  swatchSelected: {
    borderWidth: 3, borderColor: '#FFFFFF',
  },
  pageDotsRow: {
    flexDirection: 'row', gap: 7, marginBottom: 20,
  },
  pageDot: {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: '#444',
  },
  pageDotActive: {
    backgroundColor: '#FFFFFF',
  },
  applyBtn: {
    backgroundColor: '#5B5BD6',
    borderRadius: 14,
    width: '90%',
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  applyBtnText: {
    color: '#FFFFFF', fontSize: 16,
    fontFamily: 'SimplyRounded-Bold', fontWeight: '700',
  },
  limparRow: { marginBottom: 24 },
  limparText: {
    color: '#5B5BD6', fontSize: 15,
    fontFamily: 'SimplyRounded',
  },

  // ── Music Picker ───────────────────────────────────────────────────────────
  musicPickerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  musicPickerSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    height: '90%',
  },
  musicPickerTopRow: {
    alignItems: 'center', paddingTop: 12, marginBottom: 8,
  },
  musicPickerClose: {
    position: 'absolute', top: 14, left: 14, zIndex: 10,
  },
  musicPickerCloseCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#3A3A3C',
    alignItems: 'center', justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderRadius: 12, marginHorizontal: 16,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1, color: '#FFFFFF',
    fontSize: 15, fontFamily: 'SimplyRounded',
    padding: 0,
  },
  tabsRow: {
    paddingHorizontal: 16, gap: 8, marginBottom: 8,
  },
  tabPill: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#2C2C2E',
  },
  tabPillActive: {
    backgroundColor: '#FFFFFF',
  },
  tabPillText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13, fontFamily: 'SimplyRounded-Bold',
    fontWeight: '600',
  },
  tabPillTextActive: {
    color: '#000000',
  },
  songList: { flex: 1 },
  spotifyRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
    gap: 12,
  },
  spotifyIconBox: {
    width: 48, height: 48, borderRadius: 8,
    backgroundColor: '#111', alignItems: 'center', justifyContent: 'center',
  },
  spotifyTextBlock: { flex: 1 },
  spotifyTitle: {
    color: '#FFFFFF', fontSize: 14,
    fontFamily: 'SimplyRounded-Bold', fontWeight: '700',
    marginBottom: 3,
  },
  spotifyDesc: {
    color: 'rgba(255,255,255,0.5)', fontSize: 12,
    fontFamily: 'SimplyRounded', lineHeight: 16,
  },
  spotifyLink: { color: '#4F86F7' },
  spotifyArrow: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#2C2C2E',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
  },
  songRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
  },
  songRowSelected: { backgroundColor: 'rgba(255,255,255,0.06)' },
  songArt: {
    width: 48, height: 48, borderRadius: 6, backgroundColor: '#2C2C2E',
  },
  songInfo: { flex: 1 },
  songTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  songTitle: {
    color: '#FFFFFF', fontSize: 14,
    fontFamily: 'SimplyRounded-Bold', fontWeight: '700', flex: 1,
  },
  explicitBadge: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1,
  },
  explicitText: {
    color: '#FFFFFF', fontSize: 9,
    fontFamily: 'SimplyRounded-Bold', fontWeight: '700',
  },
  songMeta: {
    color: 'rgba(255,255,255,0.5)', fontSize: 12,
    fontFamily: 'SimplyRounded',
  },

  // ── Editor ─────────────────────────────────────────────────────────────────
  editorScreen: {
    flex: 1, backgroundColor: '#0A0A0C',
  },
  editorKAV: { flex: 1 },
  editorCloseBtn: {
    position: 'absolute', top: 16, left: 16, zIndex: 10,
  },
  editorCloseCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#2A2A2E',
    alignItems: 'center', justifyContent: 'center',
  },
  editorCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  editorActionBtns: {
    flexDirection: 'row', gap: 16,
    alignItems: 'center',
  },
  editorActionBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#1E1E24',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E91E8C',
  },
  gifBtn: {
    borderColor: '#2ECC71',
  },
  gifText: {
    color: '#2ECC71', fontSize: 13,
    fontFamily: 'SimplyRounded-Bold', fontWeight: '800',
    letterSpacing: 0.5,
  },
  editorTextInput: {
    position: 'absolute',
    width: '60%',
    alignSelf: 'center',
    top: '30%',
    color: 'rgba(0,0,0,0)',
    fontSize: 14,
    fontFamily: 'SimplyRounded',
    zIndex: 5,
  },
  editorShareBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A2A2E',
    backgroundColor: '#0A0A0C',
  },
  shareLeftRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  shareLeftText: {
    color: '#FFFFFF', fontSize: 13,
    fontFamily: 'SimplyRounded',
  },
  shareBtn: {
    backgroundColor: '#5B5BD6',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  shareBtnDisabled: { opacity: 0.38 },
  shareBtnText: {
    color: '#FFFFFF', fontSize: 15,
    fontFamily: 'SimplyRounded-Bold', fontWeight: '700',
  },
});
