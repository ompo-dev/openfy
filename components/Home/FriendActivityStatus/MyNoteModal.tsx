/**
 * MyNoteModal — Instagram Music Notes Editor & Published Sheet
 *
 * Design Architecture:
 * - Native transparent Modal overlay preserving background depth.
 * - Top Bar:
 *    - Left: SwiftUI X close icon button (xmark)
 *    - Right: SwiftUI Confirm checkmark icon button (checkmark) using native UI / GlassSurface
 * - Creator Center:
 *    - Avatar with speech bubble fixed at max 97px width matching carousel notes.
 *    - SwiftUI circular action buttons overlaid on avatar (🎵 Music & 🎨 Palette).
 * - Sectioned Color Palette:
 *    - 5 Sectioned color families (Purples, Blues, Greens, Yellows/Oranges, Reds).
 *    - SQUARE (1:1) swatches laid out in a single horizontal row per page.
 *    - Smooth horizontal section paging (`pagingEnabled={true}`) showing ONLY the current section page.
 *    - Synchronized page dots + Aplicar/Limpar buttons.
 * - Music Picker Modal:
 *    - Search bar with inline X close button.
 *    - Compact horizontal tab chips.
 *    - Track selection triggers audio playback via global player.
 *    - Floating confirmation MiniPlayer bar appears at bottom with Play/Pause & Checkmark Confirm button.
 * - Published Note View: Exact same note bubble component as home carousel + auto-plays note song.
 */

import * as React from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
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
import { getNoteColorTheme } from '../../../utils/colorContrast';
import { NativeIconButton } from '../../native/NativeButtons';
import { GlassSurface } from '../../native/GlassSurface';
import { MiniPlayer } from '../../Player/MiniPlayer';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface MyNote {
  text: string;
  songTitle?: string;
  songArtist?: string;
  songSpotifyId?: string;
  songDuration?: number;
  bubbleColor: string;
  imageUrl?: string;
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
// 5 Sectioned Analogous Color Families (SQUARE 1:1 swatches per page)
// ──────────────────────────────────────────────────────────────────────────────
const COLOR_SECTIONS = [
  // Section 1: Purples & Pinks
  ['#B57BEE', '#8B5CF6', '#7C3AED', '#EC4899', '#F472B6', '#DB2777'],
  // Section 2: Blues & Cyans
  ['#0EA5E9', '#0284C7', '#2563EB', '#3B82F6', '#06B6D4', '#0891B2'],
  // Section 3: Greens
  ['#10B981', '#059669', '#16A34A', '#22C55E', '#84CC16', '#65A30D'],
  // Section 4: Yellows & Warm Oranges
  ['#F59E0B', '#D97706', '#F97316', '#EA580C', '#EAB308', '#CA8A04'],
  // Section 5: Reds & Deep Accents
  ['#EF4444', '#DC2626', '#E11D48', '#BE123C', '#991B1B', '#475569'],
];

const DEFAULT_COLOR = '#1C1E24';
const NOTE_TEXT_LIMIT = 30;

// ──────────────────────────────────────────────────────────────────────────────
// Animated Equalizer Wave Icon
// ──────────────────────────────────────────────────────────────────────────────
const SoundWaveIcon = ({ size = 13, color = '#fff' }: { size?: number; color?: string }) => {
  const a1 = React.useRef(new Animated.Value(size * 0.5)).current;
  const a2 = React.useRef(new Animated.Value(size)).current;
  const a3 = React.useRef(new Animated.Value(size * 0.65)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(a1, { toValue: size, duration: 280, useNativeDriver: false }),
          Animated.timing(a2, { toValue: size * 0.35, duration: 260, useNativeDriver: false }),
          Animated.timing(a3, { toValue: size * 0.9, duration: 300, useNativeDriver: false }),
        ]),
        Animated.parallel([
          Animated.timing(a1, { toValue: size * 0.5, duration: 280, useNativeDriver: false }),
          Animated.timing(a2, { toValue: size, duration: 300, useNativeDriver: false }),
          Animated.timing(a3, { toValue: size * 0.65, duration: 260, useNativeDriver: false }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [a1, a2, a3, size]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: size + 2, flexShrink: 0 }}>
      <Animated.View style={{ width: 2.2, borderRadius: 1.1, backgroundColor: color, height: a1 }} />
      <Animated.View style={{ width: 2.2, borderRadius: 1.1, backgroundColor: color, height: a2 }} />
      <Animated.View style={{ width: 2.2, borderRadius: 1.1, backgroundColor: color, height: a3 }} />
    </View>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Carousel Identical Note Bubble Visual (Published Sheet)
// ──────────────────────────────────────────────────────────────────────────────
const IdenticalNoteBubble = ({
  note,
  avatarUrl,
  isPlaying,
}: {
  note: MyNote;
  avatarUrl: string;
  isPlaying: boolean;
}) => {
  const bg = note.bubbleColor || DEFAULT_COLOR;
  const colorTheme = getNoteColorTheme(bg);
  const title = note.songTitle || note.text || 'Deixe uma nota...';
  const artist = note.songSpotifyId ? note.songArtist : undefined;
  const customText = note.songSpotifyId && note.text ? note.text : undefined;

  return (
    <View style={bubbleStyles.wrapper}>
      <View style={bubbleStyles.anchor}>
        <View
          style={[
            bubbleStyles.bubble,
            { backgroundColor: bg },
            isPlaying && bubbleStyles.bubblePlaying,
          ]}
        >
          {/* Row 1: wave icon + title marquee */}
          <View style={bubbleStyles.bubbleRow}>
            {isPlaying && <SoundWaveIcon color={colorTheme.waveColor} />}
            <View style={bubbleStyles.textFlex}>
              <MarqueeText
                text={title}
                style={[bubbleStyles.titleText, { color: colorTheme.titleColor }]}
                align="left"
                fadeWidth={6}
                fadeColor={bg}
              />
            </View>
          </View>

          {/* Row 2: artist marquee */}
          {artist ? (
            <MarqueeText
              text={artist}
              style={[bubbleStyles.artistText, { color: colorTheme.artistColor }]}
              align="left"
              fadeWidth={6}
              fadeColor={bg}
            />
          ) : null}

          {/* Row 3: user custom text */}
          {customText ? (
            <MarqueeText
              text={customText.slice(0, NOTE_TEXT_LIMIT)}
              style={[bubbleStyles.customText, { color: colorTheme.customTextColor }]}
              align="left"
              fadeWidth={6}
              fadeColor={bg}
            />
          ) : null}

          {/* Speech tail dots */}
          <View style={[bubbleStyles.tailDotMain, { backgroundColor: bg }]} />
          <View style={[bubbleStyles.tailDotSmall, { backgroundColor: bg }]} />
        </View>
      </View>

      {/* Avatar Container */}
      <View style={bubbleStyles.avatarContainer}>
        <Image source={{ uri: avatarUrl }} style={bubbleStyles.avatarImage} />
      </View>
    </View>
  );
};

const bubbleStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    width: 100,
    marginVertical: 10,
  },
  anchor: {
    height: 56,
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
    zIndex: 2,
    marginBottom: -6,
  },
  bubble: {
    width: 97,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 5,
    justifyContent: 'center',
    zIndex: 2,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
    position: 'relative',
  },
  bubblePlaying: {
    borderColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  textFlex: {
    flex: 1,
    overflow: 'hidden',
  },
  titleText: {
    fontSize: 11.5,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
    letterSpacing: 0.05,
  },
  artistText: {
    fontSize: 10,
    fontFamily: 'SimplyRounded',
    marginTop: 1,
  },
  customText: {
    fontSize: 9.5,
    fontFamily: 'SimplyRounded',
    fontStyle: 'italic',
    marginTop: 1,
  },
  tailDotMain: {
    position: 'absolute',
    bottom: -5,
    left: 16,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    zIndex: 3,
  },
  tailDotSmall: {
    position: 'absolute',
    bottom: -9,
    left: 11,
    width: 4,
    height: 4,
    borderRadius: 2,
    zIndex: 3,
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
});

// ──────────────────────────────────────────────────────────────────────────────
// Downloaded track type
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
// Main Component
// ──────────────────────────────────────────────────────────────────────────────
export const MyNoteModal = ({
  visible,
  onClose,
  currentNote,
  avatarUrl,
  onSave,
  onDelete,
}: MyNoteModalProps) => {
  const { playTrack, currentTrack, playerState, togglePlayPause } = usePlayer();

  const [isPublishedView, setIsPublishedView] = React.useState(false);
  const [activeBottomSection, setActiveBottomSection] = React.useState<'none' | 'colorPicker'>('none');
  const [isMusicPickerVisible, setIsMusicPickerVisible] = React.useState(false);

  // Editor states
  const [noteText, setNoteText] = React.useState('');
  const [selectedSong, setSelectedSong] = React.useState<DownloadedTrack | null>(null);
  const [bubbleColor, setBubbleColor] = React.useState(DEFAULT_COLOR);

  // Color picker container width & section page
  const [colorContainerWidth, setColorContainerWidth] = React.useState(SCREEN_WIDTH - 40);
  const [colorPage, setColorPage] = React.useState(0);
  const colorScrollRef = React.useRef<ScrollView>(null);

  // Music picker search & preview state
  const [searchQuery, setSearchQuery] = React.useState('');
  const [musicTab, setMusicTab] = React.useState(0);
  const [downloadedTracks, setDownloadedTracks] = React.useState<DownloadedTrack[]>([]);
  const [previewTrack, setPreviewTrack] = React.useState<DownloadedTrack | null>(null);

  // Load downloaded tracks
  React.useEffect(() => {
    if (isMusicPickerVisible) {
      AsyncStorage.getItem('openfy_downloads')
        .then((raw) => {
          if (raw) {
            try {
              const list = JSON.parse(raw) as DownloadedTrack[];
              setDownloadedTracks(Array.isArray(list) ? list : []);
            } catch {}
          }
        })
        .catch(() => {});
    }
  }, [isMusicPickerVisible]);

  // Sync state when modal visibility changes
  React.useEffect(() => {
    if (!visible) return;

    if (currentNote) {
      setIsPublishedView(true);
      setNoteText(currentNote.text || '');
      setBubbleColor(currentNote.bubbleColor || DEFAULT_COLOR);
      setSelectedSong(
        currentNote.songTitle
          ? {
              spotifyId: currentNote.songSpotifyId || '',
              title: currentNote.songTitle,
              artistName: currentNote.songArtist || '',
              duration_ms: currentNote.songDuration,
              imageURL: currentNote.imageUrl,
            }
          : null
      );

      // Auto-play the note's song via global player
      if (currentNote.songSpotifyId && currentTrack?.spotifyId !== currentNote.songSpotifyId) {
        playTrack({
          spotifyId: currentNote.songSpotifyId,
          title: currentNote.songTitle || 'Nota Musical',
          artistName: currentNote.songArtist || 'Artista',
          albumName: 'Nota Musical',
          imageURL: currentNote.imageUrl || 'https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27341ea22e92c68e146eb4a7812',
          duration_ms: currentNote.songDuration || 200000,
        });
      }
    } else {
      setIsPublishedView(false);
      setActiveBottomSection('none');
      setNoteText('');
      setBubbleColor(DEFAULT_COLOR);
      setSelectedSong(null);
      setPreviewTrack(null);
    }
  }, [visible, currentNote]);

  const handleConfirmSave = () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    onSave({
      text: noteText.slice(0, NOTE_TEXT_LIMIT),
      songTitle: selectedSong?.title,
      songArtist: selectedSong?.artistName,
      songSpotifyId: selectedSong?.spotifyId,
      songDuration: selectedSong?.duration_ms,
      bubbleColor,
      imageUrl: selectedSong?.imageURL,
    });
    onClose();
  };

  const handleColorLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - colorContainerWidth) > 1) {
      setColorContainerWidth(w);
    }
  };

  const handleColorScroll = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    if (colorContainerWidth > 0) {
      const page = Math.round(x / colorContainerWidth);
      setColorPage(Math.max(0, Math.min(COLOR_SECTIONS.length - 1, page)));
    }
  };

  const canConfirm = noteText.trim().length > 0 || selectedSong !== null;

  const filteredTracks = searchQuery.trim()
    ? downloadedTracks.filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.artistName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : downloadedTracks;

  // Active color theme with mathematical contrast (NEVER pure black)
  const colorTheme = getNoteColorTheme(bubbleColor);

  // ──────────────────────────────────────────────────────────────────────────
  // SCREEN 1: Published Note Bottom Sheet
  // ──────────────────────────────────────────────────────────────────────────
  if (isPublishedView && currentNote) {
    const isPlayingThisNote =
      !!currentNote.songSpotifyId &&
      currentTrack?.spotifyId === currentNote.songSpotifyId &&
      playerState.isPlaying;

    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={S.overlay} onPress={onClose}>
          <Pressable style={S.publishedSheet} onPress={(e) => e.stopPropagation()}>
            <View style={S.handle} />

            {/* Identical note bubble component as in home carousel */}
            <IdenticalNoteBubble
              note={currentNote}
              avatarUrl={avatarUrl}
              isPlaying={isPlayingThisNote}
            />

            {/* Note details */}
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

            {/* SwiftUI primary button */}
            <TouchableOpacity
              style={S.swiftUiPrimaryBtn}
              activeOpacity={0.8}
              onPress={() => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                } catch {}
                setIsPublishedView(false);
                setNoteText('');
                setSelectedSong(null);
                setBubbleColor(DEFAULT_COLOR);
                setActiveBottomSection('none');
              }}
            >
              <Text style={S.swiftUiPrimaryBtnText}>Deixar uma nova nota</Text>
            </TouchableOpacity>

            {/* Excluir nota button */}
            <TouchableOpacity
              style={S.deleteRow}
              activeOpacity={0.7}
              onPress={() => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                } catch {}
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

  // ──────────────────────────────────────────────────────────────────────────
  // SCREEN 2: Note Creator (Dynamic Content-Based Responsive Height Modal)
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={S.overlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={S.creatorModalContainer}
        >
          <Pressable style={S.creatorModalCard} onPress={(e) => e.stopPropagation()}>
            {/* Top Bar: SwiftUI X close icon on LEFT, SwiftUI Checkmark icon on RIGHT */}
            <View style={S.creatorTopBar}>
              <NativeIconButton
                systemImage="xmark"
                iconName="close"
                label="Fechar"
                size={38}
                tint="#FFFFFF"
                onPress={() => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  } catch {}
                  onClose();
                }}
              />

              {noteText.length > 20 && (
                <Text style={S.charCounter}>{NOTE_TEXT_LIMIT - noteText.length}</Text>
              )}

              {/* SwiftUI Confirm Icon Button on Top-Right */}
              <NativeIconButton
                systemImage="checkmark.circle.fill"
                iconName="checkmark"
                label="Confirmar"
                size={38}
                tint={canConfirm ? '#5B5BD6' : 'rgba(255,255,255,0.3)'}
                onPress={() => {
                  if (canConfirm) handleConfirmSave();
                }}
              />
            </View>

            {/* Center Area: Avatar with Compact 97px Speech Bubble */}
            <View style={S.creatorCenter}>
              {/* Bubble with 97px max width matching carousel */}
              <View style={[S.editorBubble, { backgroundColor: bubbleColor }]}>
                <View style={S.editorBubbleInner}>
                  {selectedSong && <SoundWaveIcon size={12} color={colorTheme.waveColor} />}
                  <View style={{ flex: 1, overflow: 'hidden' }}>
                    {selectedSong ? (
                      <View>
                        <MarqueeText
                          text={selectedSong.title}
                          style={[S.editorSongTitle, { color: colorTheme.titleColor }]}
                          align="left"
                          fadeWidth={4}
                          fadeColor={bubbleColor}
                        />
                        <MarqueeText
                          text={selectedSong.artistName}
                          style={[S.editorSongArtist, { color: colorTheme.artistColor }]}
                          align="left"
                          fadeWidth={4}
                          fadeColor={bubbleColor}
                        />
                        <TextInput
                          style={[S.editorSongCustomInput, { color: colorTheme.customTextColor }]}
                          placeholder="Escreva algo..."
                          placeholderTextColor={
                            colorTheme.isLightBg
                              ? 'rgba(24, 20, 14, 0.45)'
                              : 'rgba(255, 255, 255, 0.4)'
                          }
                          value={noteText}
                          onChangeText={(t) => setNoteText(t.slice(0, NOTE_TEXT_LIMIT))}
                          maxLength={NOTE_TEXT_LIMIT}
                        />
                      </View>
                    ) : (
                      <TextInput
                        style={[S.editorPureInput, { color: colorTheme.titleColor }]}
                        placeholder="Deixe uma nota..."
                        placeholderTextColor={
                          colorTheme.isLightBg
                            ? 'rgba(24, 20, 14, 0.5)'
                            : 'rgba(255, 255, 255, 0.45)'
                        }
                        value={noteText}
                        onChangeText={(t) => setNoteText(t.slice(0, NOTE_TEXT_LIMIT))}
                        multiline
                        maxLength={NOTE_TEXT_LIMIT}
                        autoFocus
                      />
                    )}
                  </View>
                </View>
                {/* Speech tail dots */}
                <View style={[S.editorDot1, { backgroundColor: bubbleColor }]} />
                <View style={[S.editorDot2, { backgroundColor: bubbleColor }]} />
              </View>

              {/* Avatar with SwiftUI circular action buttons overlaid */}
              <View style={S.creatorAvatarWrap}>
                <Image source={{ uri: avatarUrl }} style={S.creatorAvatar} />

                {/* 🎵 Music Picker Button */}
                <TouchableOpacity
                  style={[S.swiftUiAvatarBtn, S.avatarBtnLeft]}
                  activeOpacity={0.8}
                  onPress={() => {
                    try {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    } catch {}
                    setIsMusicPickerVisible(true);
                  }}
                >
                  <Ionicons name="musical-notes" size={16} color="#FA2D7F" />
                </TouchableOpacity>

                {/* 🎨 Palette Color Button */}
                <TouchableOpacity
                  style={[S.swiftUiAvatarBtn, S.avatarBtnRight]}
                  activeOpacity={0.8}
                  onPress={() => {
                    try {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    } catch {}
                    setActiveBottomSection((prev) =>
                      prev === 'colorPicker' ? 'none' : 'colorPicker'
                    );
                  }}
                >
                  {bubbleColor !== DEFAULT_COLOR ? (
                    <View style={[S.paletteColorIndicator, { backgroundColor: bubbleColor }]} />
                  ) : (
                    <MaterialCommunityIcons name="palette" size={16} color="#B57BEE" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Color Swatches: Sectioned Paged Horizontal Scroller (SQUARE 1:1 swatches) */}
            {activeBottomSection === 'colorPicker' && (
              <View style={S.colorPickerSection} onLayout={handleColorLayout}>
                <ScrollView
                  ref={colorScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={S.colorFamiliesScroll}
                  onScroll={handleColorScroll}
                  scrollEventThrottle={16}
                  bounces={true}
                  alwaysBounceHorizontal={true}
                >
                  {COLOR_SECTIONS.map((section, pageIdx) => (
                    <View
                      key={pageIdx}
                      style={[S.colorSectionPage, { width: colorContainerWidth }]}
                    >
                      <View style={S.colorSectionRow}>
                        {section.map((color) => (
                          <TouchableOpacity
                            key={color}
                            style={[
                              S.squareColorSwatch,
                              { backgroundColor: color },
                              bubbleColor === color && S.squareColorSwatchSelected,
                            ]}
                            activeOpacity={0.75}
                            onPress={() => {
                              try {
                                Haptics.selectionAsync();
                              } catch {}
                              setBubbleColor(color);
                            }}
                          />
                        ))}
                      </View>
                    </View>
                  ))}
                </ScrollView>

                {/* Page Indicator Dots */}
                <View style={S.pageDotsRow}>
                  {COLOR_SECTIONS.map((_, i) => (
                    <View key={i} style={[S.pageDot, i === colorPage && S.pageDotActive]} />
                  ))}
                </View>

                {/* Aplicar & Limpar buttons */}
                <View style={S.colorActionsRow}>
                  <TouchableOpacity
                    style={S.swiftUiPrimaryBtn}
                    activeOpacity={0.85}
                    onPress={() => {
                      try {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      } catch {}
                      setActiveBottomSection('none');
                    }}
                  >
                    <Text style={S.swiftUiPrimaryBtnText}>Aplicar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={S.limparBtn}
                    onPress={() => {
                      try {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      } catch {}
                      setBubbleColor(DEFAULT_COLOR);
                      setActiveBottomSection('none');
                    }}
                  >
                    <Text style={S.limparText}>Limpar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* MUSIC PICKER OVERLAY MODAL                                          */}
      {/* ────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={isMusicPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsMusicPickerVisible(false)}
      >
        <View style={S.musicPickerOverlay}>
          <View style={S.musicPickerSheet}>
            {/* Top Handle */}
            <View style={S.musicHandleRow}>
              <View style={S.handle} />
            </View>

            {/* Search Bar + Inline X Close Button */}
            <View style={S.musicSearchRow}>
              <View style={S.musicSearchBar}>
                <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" />
                <TextInput
                  style={S.musicSearchInput}
                  placeholder="Pesquisar..."
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>

              {/* X Close Button inline on the same row */}
              <TouchableOpacity
                style={S.musicInlineCloseBtn}
                activeOpacity={0.7}
                onPress={() => setIsMusicPickerVisible(false)}
              >
                <Ionicons name="close" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Compact Horizontal Tab Chips */}
            <View style={S.tabsContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={S.tabsContent}
              >
                {MUSIC_TABS.map((tab, i) => (
                  <TouchableOpacity
                    key={tab}
                    style={[S.tabChip, i === musicTab && S.tabChipActive]}
                    activeOpacity={0.8}
                    onPress={() => setMusicTab(i)}
                  >
                    <Text style={[S.tabChipText, i === musicTab && S.tabChipTextActive]}>
                      {tab}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Downloaded Tracks List — Triggers App's Native Global Player */}
            <FlatList
              data={filteredTracks}
              keyExtractor={(t) => t.spotifyId}
              style={S.musicList}
              contentContainerStyle={{ paddingBottom: previewTrack ? 90 : 20 }}
              ListHeaderComponent={
                currentTrack ? (
                  <TouchableOpacity
                    style={[
                      S.musicRow,
                      previewTrack?.spotifyId === currentTrack.spotifyId && S.musicRowActive,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => {
                      setPreviewTrack({
                        spotifyId: currentTrack.spotifyId,
                        title: currentTrack.title,
                        artistName: currentTrack.artistName,
                        imageURL: currentTrack.imageURL,
                        duration_ms: currentTrack.duration_ms,
                      });
                    }}
                  >
                    <Image source={{ uri: currentTrack.imageURL }} style={S.musicCover} />
                    <View style={S.musicInfo}>
                      <Text style={S.musicTitle} numberOfLines={1}>
                        {currentTrack.title}
                      </Text>
                      <Text style={S.musicMeta} numberOfLines={1}>
                        {currentTrack.artistName} · Tocando agora
                      </Text>
                    </View>
                    <Ionicons name="volume-medium" size={18} color="#5B5BD6" />
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
              renderItem={({ item }) => {
                const isSelected = previewTrack?.spotifyId === item.spotifyId;
                return (
                  <TouchableOpacity
                    style={[S.musicRow, isSelected && S.musicRowActive]}
                    activeOpacity={0.8}
                    onPress={() => {
                      try {
                        Haptics.selectionAsync();
                      } catch {}
                      setPreviewTrack(item);
                      // Triggers app's native MiniPlayer & audio playback directly!
                      playTrack({
                        spotifyId: item.spotifyId,
                        title: item.title,
                        artistName: item.artistName,
                        albumName: item.albumName || 'Download',
                        imageURL: item.localImagePath || item.imageURL || '',
                        duration_ms: item.duration_ms || 200000,
                      });
                    }}
                  >
                    <Image
                      source={{ uri: item.localImagePath || item.imageURL || '' }}
                      style={S.musicCover}
                    />
                    <View style={S.musicInfo}>
                      <Text style={S.musicTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={S.musicMeta} numberOfLines={1}>
                        {item.artistName}
                      </Text>
                    </View>
                    <Ionicons
                      name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={isSelected ? '#5B5BD6' : 'rgba(255,255,255,0.3)'}
                    />
                  </TouchableOpacity>
                );
              }}
            />

            {/* Render exact native MiniPlayer with Checkmark Confirm Button */}
            {previewTrack && (
              <MiniPlayer
                onConfirm={() => {
                  setSelectedSong(previewTrack);
                  setIsMusicPickerVisible(false);
                }}
                style={S.musicPickerMiniPlayer}
              />
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },

  // Published Sheet
  publishedSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    paddingHorizontal: 22,
    alignItems: 'center',
    paddingTop: 12,
    gap: 10,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#48484A',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  publishedInfoBlock: {
    alignItems: 'center',
    gap: 4,
    width: '100%',
    marginVertical: 6,
  },
  publishedSongText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
    textAlign: 'center',
  },
  publishedNoteText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontFamily: 'SimplyRounded',
    textAlign: 'center',
  },
  publishedMeta: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontFamily: 'SimplyRounded',
  },
  swiftUiPrimaryBtn: {
    backgroundColor: '#5B5BD6',
    borderRadius: 14,
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5B5BD6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  swiftUiPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
  },
  deleteRow: {
    paddingVertical: 6,
  },
  deleteText: {
    color: '#4F86F7',
    fontSize: 15,
    fontFamily: 'SimplyRounded',
  },

  // Dynamic Content-Based Responsive Creator Modal Card
  creatorModalContainer: {
    justifyContent: 'flex-end',
    width: '100%',
  },
  creatorModalCard: {
    backgroundColor: '#141416',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    paddingHorizontal: 20,
    width: '100%',
    minHeight: 270,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  creatorTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 6,
  },
  charCounter: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontFamily: 'SimplyRounded',
  },

  // Creator Center
  creatorCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  editorBubble: {
    width: 97,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: -6,
    zIndex: 2,
    position: 'relative',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
  },
  editorBubbleInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  editorSongTitle: {
    fontSize: 11.5,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
  },
  editorSongArtist: {
    fontSize: 10,
    fontFamily: 'SimplyRounded',
    marginBottom: 2,
  },
  editorSongCustomInput: {
    fontSize: 9.5,
    fontFamily: 'SimplyRounded',
    padding: 0,
    minHeight: 18,
  },
  editorPureInput: {
    fontSize: 12,
    fontFamily: 'SimplyRounded',
    padding: 0,
    minHeight: 28,
  },
  editorDot1: {
    position: 'absolute',
    bottom: -5,
    left: 16,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    zIndex: 3,
  },
  editorDot2: {
    position: 'absolute',
    bottom: -9,
    left: 11,
    width: 4,
    height: 4,
    borderRadius: 2,
    zIndex: 3,
  },
  creatorAvatarWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    position: 'relative',
    zIndex: 1,
    overflow: 'visible',
  },
  creatorAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: '#252528',
  },
  swiftUiAvatarBtn: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1E1E24',
    borderWidth: 2,
    borderColor: '#141416',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  avatarBtnLeft: {
    bottom: 0,
    left: -5,
  },
  avatarBtnRight: {
    bottom: 0,
    right: -5,
  },
  paletteColorIndicator: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },

  // Color Swatches Section — Paged Section Swiper of SQUARE (1:1) Swatches
  colorPickerSection: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 10,
  },
  colorFamiliesScroll: {
    alignItems: 'center',
  },
  colorSectionPage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  colorSectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 8,
  },
  squareColorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  squareColorSwatchSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.08 }],
  },
  pageDotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 12,
  },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#444',
  },
  pageDotActive: {
    backgroundColor: '#FFFFFF',
    width: 12,
  },
  colorActionsRow: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  limparBtn: {
    paddingVertical: 4,
  },
  limparText: {
    color: '#5B5BD6',
    fontSize: 14,
    fontFamily: 'SimplyRounded',
  },

  // Music Picker Sheet
  musicPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  musicPickerSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    height: '88%',
    paddingTop: 12,
  },
  musicHandleRow: {
    alignItems: 'center',
    marginBottom: 10,
  },
  musicSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 12,
  },
  musicSearchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  musicSearchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14.5,
    fontFamily: 'SimplyRounded',
    padding: 0,
  },
  musicInlineCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsContainer: {
    height: 36,
    marginBottom: 10,
  },
  tabsContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#2C2C2E',
    height: 32,
    justifyContent: 'center',
  },
  tabChipActive: {
    backgroundColor: '#FFFFFF',
  },
  tabChipText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12.5,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '600',
  },
  tabChipTextActive: {
    color: '#000000',
  },
  musicList: {
    flex: 1,
  },
  musicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
  },
  musicRowActive: {
    backgroundColor: 'rgba(91, 91, 214, 0.15)',
  },
  musicCover: {
    width: 46,
    height: 46,
    borderRadius: 6,
    backgroundColor: '#2C2C2E',
  },
  musicInfo: {
    flex: 1,
  },
  musicTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
    marginBottom: 2,
  },
  musicMeta: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: 'SimplyRounded',
  },
  emptyList: {
    alignItems: 'center',
    paddingTop: 48,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
    fontFamily: 'SimplyRounded',
  },

  musicPickerMiniPlayer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 14,
    left: 12,
    right: 12,
  },
});
