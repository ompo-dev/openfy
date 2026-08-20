/**
 * MyNoteModal — Instagram Music Notes Editor
 * Modal de edição da própria nota musical: texto livre, seleção de música,
 * paleta de cores e opções de nota publicada (Ver comentários / Excluir).
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

const BUBBLE_COLORS = [
  // Page 1
  ['#A855F7', '#7C3AED', '#4F46E5', '#EC4899', '#DB2777', '#9D174D'],
  // Page 2
  ['#EF4444', '#DC2626', '#0EA5E9', '#0284C7', '#10B981', '#059669'],
  // Page 3
  ['#F97316', '#EA580C', '#EAB308', '#CA8A04', '#6366F1', '#4338CA'],
];
const ALL_COLORS = BUBBLE_COLORS.flat();

const DEFAULT_NOTE_COLOR = '#25272D';

// 3-bar sound wave icon (animated when playing)
const SoundWaveIcon = ({ isPlaying, color = '#FFFFFF' }: { isPlaying: boolean; color?: string }) => {
  const anim1 = React.useRef(new Animated.Value(8)).current;
  const anim2 = React.useRef(new Animated.Value(14)).current;
  const anim3 = React.useRef(new Animated.Value(9)).current;

  React.useEffect(() => {
    if (!isPlaying) {
      Animated.parallel([
        Animated.spring(anim1, { toValue: 8, useNativeDriver: false }),
        Animated.spring(anim2, { toValue: 14, useNativeDriver: false }),
        Animated.spring(anim3, { toValue: 9, useNativeDriver: false }),
      ]).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(anim1, { toValue: 14, duration: 300, useNativeDriver: false }),
          Animated.timing(anim2, { toValue: 8, duration: 280, useNativeDriver: false }),
          Animated.timing(anim3, { toValue: 16, duration: 320, useNativeDriver: false }),
        ]),
        Animated.parallel([
          Animated.timing(anim1, { toValue: 8, duration: 300, useNativeDriver: false }),
          Animated.timing(anim2, { toValue: 16, duration: 320, useNativeDriver: false }),
          Animated.timing(anim3, { toValue: 9, duration: 280, useNativeDriver: false }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isPlaying]);

  return (
    <View style={swStyles.container}>
      <Animated.View style={[swStyles.bar, { height: anim1, backgroundColor: color }]} />
      <Animated.View style={[swStyles.bar, { height: anim2, backgroundColor: color }]} />
      <Animated.View style={[swStyles.bar, { height: anim3, backgroundColor: color }]} />
    </View>
  );
};

const swStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 18, width: 12, flexShrink: 0 },
  bar: { width: 2.5, borderRadius: 1.25 },
});

// Mini preview of the note bubble
const NotePreview = ({
  note,
  avatarUrl,
  isPlaying,
}: {
  note: MyNote;
  avatarUrl: string;
  isPlaying: boolean;
}) => {
  const bg = note.bubbleColor && note.bubbleColor !== DEFAULT_NOTE_COLOR ? note.bubbleColor : DEFAULT_NOTE_COLOR;
  const hasMusic = !!note.songTitle;

  return (
    <View style={previewStyles.wrapper}>
      {/* Bubble */}
      <View style={[previewStyles.bubble, { backgroundColor: bg }]}>
        <View style={previewStyles.bubbleInner}>
          {hasMusic && isPlaying && (
            <SoundWaveIcon isPlaying color="#FFFFFF" />
          )}
          <View style={previewStyles.textBlock}>
            <Text style={previewStyles.title} numberOfLines={1}>
              {hasMusic ? note.songTitle! : note.text || 'Deixe uma nota...'}
            </Text>
            {hasMusic && note.songArtist ? (
              <Text style={previewStyles.subtitle} numberOfLines={1}>
                {note.songArtist}
              </Text>
            ) : hasMusic ? null : note.text ? null : null}
          </View>
        </View>
        {/* Tail dots */}
        <View style={[previewStyles.tailDotMain, { backgroundColor: bg }]} />
        <View style={[previewStyles.tailDotSmall, { backgroundColor: bg }]} />
      </View>
      {/* Avatar */}
      <View style={previewStyles.avatar}>
        <Image source={{ uri: avatarUrl }} style={previewStyles.avatarImage} />
      </View>
    </View>
  );
};

const previewStyles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  bubble: {
    minWidth: 130,
    maxWidth: 200,
    minHeight: 50,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: -8,
    position: 'relative',
    zIndex: 2,
  },
  bubbleInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  textBlock: { flex: 1 },
  title: { color: '#FFF', fontSize: 13, fontFamily: 'SimplyRounded-Bold', fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontFamily: 'SimplyRounded' },
  tailDotMain: {
    position: 'absolute', bottom: -5, left: 22,
    width: 8, height: 8, borderRadius: 4, zIndex: 3,
  },
  tailDotSmall: {
    position: 'absolute', bottom: -9, left: 16,
    width: 5, height: 5, borderRadius: 2.5, zIndex: 3,
  },
  avatar: {
    width: 74, height: 74, borderRadius: 37, overflow: 'hidden',
    borderWidth: 2, borderColor: '#1E2024', zIndex: 1,
  },
  avatarImage: { width: '100%', height: '100%' },
});

// ─── Main component ────────────────────────────────────────────────────────────

export const MyNoteModal = ({
  visible,
  onClose,
  currentNote,
  avatarUrl,
  onSave,
  onDelete,
}: MyNoteModalProps) => {
  const { currentTrack, playerState } = usePlayer();
  const [mode, setMode] = React.useState<'published' | 'editor' | 'colorPicker'>('editor');

  const [text, setText] = React.useState('');
  const [selectedColor, setSelectedColor] = React.useState(DEFAULT_NOTE_COLOR);
  const [selectedSong, setSelectedSong] = React.useState<{
    title: string; artist: string; spotifyId: string; duration?: number;
  } | null>(null);
  const [colorPage, setColorPage] = React.useState(0);

  // Reset state when modal opens
  React.useEffect(() => {
    if (visible) {
      if (currentNote) {
        setMode('published');
        setText(currentNote.text || '');
        setSelectedColor(currentNote.bubbleColor || DEFAULT_NOTE_COLOR);
        if (currentNote.songTitle) {
          setSelectedSong({
            title: currentNote.songTitle,
            artist: currentNote.songArtist || '',
            spotifyId: currentNote.songSpotifyId || '',
            duration: currentNote.songDuration,
          });
        } else {
          setSelectedSong(null);
        }
      } else {
        setMode('editor');
        setText('');
        setSelectedColor(DEFAULT_NOTE_COLOR);
        setSelectedSong(null);
      }
    }
  }, [visible, currentNote]);

  const draftNote: MyNote = {
    text,
    songTitle: selectedSong?.title,
    songArtist: selectedSong?.artist,
    songSpotifyId: selectedSong?.spotifyId,
    songDuration: selectedSong?.duration,
    bubbleColor: selectedColor,
  };

  const handleUseCurrentSong = () => {
    if (currentTrack) {
      setSelectedSong({
        title: currentTrack.title,
        artist: currentTrack.artistName,
        spotifyId: currentTrack.spotifyId,
        duration: currentTrack.duration_ms,
      });
    }
  };

  const handleShare = () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    onSave(draftNote);
    onClose();
  };

  const handleDelete = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
    onDelete();
    onClose();
  };

  const handleNewNote = () => {
    setMode('editor');
    setText('');
    setSelectedSong(null);
    setSelectedColor(DEFAULT_NOTE_COLOR);
  };

  // ── Published view (bottom sheet) ────────────────────────────────────────
  if (mode === 'published' && currentNote) {
    const isThisSongPlaying =
      !!currentNote.songSpotifyId &&
      currentTrack?.spotifyId === currentNote.songSpotifyId &&
      playerState.isPlaying;

    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <Pressable style={modalStyles.overlay} onPress={onClose}>
          <View style={modalStyles.bottomSheet}>
            <View style={modalStyles.handle} />

            {/* Preview */}
            <NotePreview note={currentNote} avatarUrl={avatarUrl} isPlaying={isThisSongPlaying} />

            <Text style={modalStyles.publishedTitle}>
              {currentNote.songTitle
                ? `${currentNote.songTitle} · ${currentNote.songArtist}`
                : currentNote.text}
            </Text>
            {currentNote.text && currentNote.songTitle && (
              <Text style={modalStyles.publishedText}>{currentNote.text}</Text>
            )}
            <Text style={modalStyles.publishedMeta}>Compartilhada com amigos · agora</Text>

            <TouchableOpacity style={modalStyles.commentBtn} onPress={onClose}>
              <Ionicons name="chatbubble-outline" size={16} color="#5B8DEF" />
              <Text style={modalStyles.commentBtnText}>Ver comentários</Text>
            </TouchableOpacity>

            <TouchableOpacity style={modalStyles.primaryBtn} onPress={handleNewNote}>
              <Text style={modalStyles.primaryBtnText}>Deixar uma nova nota</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleDelete}>
              <Text style={modalStyles.deleteText}>Excluir nota</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    );
  }

  // ── Color Picker ────────────────────────────────────────────────────────
  if (mode === 'colorPicker') {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setMode('editor')}>
        <View style={modalStyles.colorPickerScreen}>
          <Pressable style={modalStyles.colorPickerClose} onPress={() => setMode('editor')}>
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={modalStyles.colorPickerTitle}>Editor de balão</Text>

          {/* Live preview */}
          <View style={modalStyles.colorPickerPreview}>
            <NotePreview note={draftNote} avatarUrl={avatarUrl} isPlaying={false} />
          </View>

          {/* Color Swatch Grid */}
          <View style={modalStyles.colorSwatches}>
            {BUBBLE_COLORS[colorPage].map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  modalStyles.colorSwatch,
                  { backgroundColor: color },
                  selectedColor === color && modalStyles.colorSwatchSelected,
                ]}
                onPress={() => setSelectedColor(color)}
              />
            ))}
          </View>

          {/* Page dots */}
          <View style={modalStyles.pageDots}>
            {BUBBLE_COLORS.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => setColorPage(i)}>
                <View style={[modalStyles.pageDot, i === colorPage && modalStyles.pageDotActive]} />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={modalStyles.applyBtn}
            onPress={() => setMode('editor')}
          >
            <Text style={modalStyles.applyBtnText}>Aplicar</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setSelectedColor(DEFAULT_NOTE_COLOR); setMode('editor'); }}>
            <Text style={modalStyles.clearText}>Limpar</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  // ── Editor view ────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={modalStyles.editorFull}
      >
        <Pressable style={modalStyles.editorClose} onPress={onClose}>
          <Ionicons name="close" size={24} color="#FFF" />
        </Pressable>

        {/* Live preview */}
        <View style={modalStyles.editorPreviewArea}>
          <NotePreview note={draftNote} avatarUrl={avatarUrl} isPlaying={false} />
        </View>

        {/* Text input */}
        <TextInput
          style={modalStyles.textInput}
          placeholder="Deixe uma nota..."
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={text}
          onChangeText={setText}
          maxLength={60}
          multiline
          autoFocus
        />

        {/* Action row */}
        <View style={modalStyles.actionRow}>
          {/* Music icon — use current song playing */}
          <TouchableOpacity
            style={modalStyles.actionBtn}
            onPress={handleUseCurrentSong}
          >
            <Ionicons name="musical-note" size={22} color="#FA2D7F" />
          </TouchableOpacity>

          {/* Balloon color picker */}
          <TouchableOpacity
            style={[
              modalStyles.actionBtn,
              selectedColor !== DEFAULT_NOTE_COLOR && { borderColor: selectedColor, borderWidth: 2 },
            ]}
            onPress={() => setMode('colorPicker')}
          >
            <View
              style={[
                modalStyles.colorDot,
                { backgroundColor: selectedColor !== DEFAULT_NOTE_COLOR ? selectedColor : '#6366F1' },
              ]}
            />
          </TouchableOpacity>
        </View>

        {/* Selected song pill */}
        {selectedSong && (
          <View style={modalStyles.selectedSongPill}>
            <Ionicons name="musical-notes" size={14} color="#FFFFFF" />
            <Text style={modalStyles.selectedSongText} numberOfLines={1}>
              {selectedSong.title} · {selectedSong.artist}
            </Text>
            <TouchableOpacity onPress={() => setSelectedSong(null)}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        )}

        {/* Share bar */}
        <View style={modalStyles.shareBar}>
          <Text style={modalStyles.shareWithText}>
            <Ionicons name="people-outline" size={13} color="#FFF" /> Compartilhar com amigos  ›
          </Text>
          <TouchableOpacity
            style={[modalStyles.shareBtn, (!text.trim() && !selectedSong) && modalStyles.shareBtnDisabled]}
            onPress={handleShare}
            disabled={!text.trim() && !selectedSong}
          >
            <Text style={modalStyles.shareBtnText}>Compartilhar</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#101014',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 14,
  },
  handle: {
    width: 36, height: 4, backgroundColor: '#444', borderRadius: 2, marginBottom: 8,
  },
  publishedTitle: {
    color: '#FFFFFF', fontSize: 15, fontFamily: 'SimplyRounded-Bold', textAlign: 'center',
  },
  publishedText: {
    color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'SimplyRounded', textAlign: 'center',
  },
  publishedMeta: {
    color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: 'SimplyRounded',
  },
  commentBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  commentBtnText: {
    color: '#5B8DEF', fontSize: 14, fontFamily: 'SimplyRounded',
  },
  primaryBtn: {
    backgroundColor: '#5B5BD6',
    borderRadius: 14,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFF', fontSize: 15, fontFamily: 'SimplyRounded-Bold', fontWeight: '700',
  },
  deleteText: {
    color: '#5B8DEF', fontSize: 14, fontFamily: 'SimplyRounded',
  },

  // Color picker screen
  colorPickerScreen: {
    flex: 1,
    backgroundColor: '#0A0A0C',
    alignItems: 'center',
    paddingTop: 60,
    gap: 20,
  },
  colorPickerClose: {
    position: 'absolute', top: 52, left: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#2A2A2E',
    alignItems: 'center', justifyContent: 'center',
  },
  colorPickerTitle: {
    color: '#FFF', fontSize: 17, fontFamily: 'SimplyRounded-Bold',
  },
  colorPickerPreview: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  colorSwatches: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 24,
  },
  colorSwatch: {
    width: 48, height: 48, borderRadius: 14,
  },
  colorSwatchSelected: {
    borderWidth: 3, borderColor: '#FFFFFF',
  },
  pageDots: {
    flexDirection: 'row', gap: 6,
  },
  pageDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#555',
  },
  pageDotActive: {
    backgroundColor: '#FFFFFF',
  },
  applyBtn: {
    backgroundColor: '#5B5BD6',
    borderRadius: 14,
    paddingVertical: 16,
    width: '85%',
    alignItems: 'center',
  },
  applyBtnText: {
    color: '#FFF', fontSize: 16, fontFamily: 'SimplyRounded-Bold',
  },
  clearText: {
    color: '#5B8DEF', fontSize: 14, fontFamily: 'SimplyRounded', marginBottom: 20,
  },

  // Editor full screen
  editorFull: {
    flex: 1,
    backgroundColor: '#0A0A0C',
    paddingHorizontal: 20,
  },
  editorClose: {
    position: 'absolute', top: 52, left: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#2A2A2E',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  editorPreviewArea: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  textInput: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'SimplyRounded',
    textAlign: 'center',
    minHeight: 44,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#1E1E24',
    alignItems: 'center', justifyContent: 'center',
  },
  colorDot: {
    width: 22, height: 22, borderRadius: 11,
  },
  selectedSongPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E1E24',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    alignSelf: 'center',
    maxWidth: '90%',
  },
  selectedSongText: {
    color: '#FFF', fontSize: 12, fontFamily: 'SimplyRounded', flex: 1,
  },
  shareBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2E',
    paddingTop: 12,
  },
  shareWithText: {
    color: '#FFF', fontSize: 13, fontFamily: 'SimplyRounded',
  },
  shareBtn: {
    backgroundColor: '#5B5BD6',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  shareBtnDisabled: {
    opacity: 0.4,
  },
  shareBtnText: {
    color: '#FFF', fontSize: 14, fontFamily: 'SimplyRounded-Bold',
  },
});
