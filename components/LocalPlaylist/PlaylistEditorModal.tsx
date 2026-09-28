import * as React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import {
  updateLocalPlaylist,
  type LibraryTrack,
  type LocalPlaylist,
} from '@services';
import { LoggedPressable, SheetFrame } from '../native';

type PlaylistEditorModalProps = {
  onAddTracks: () => void;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  playlist: LocalPlaylist;
  tracks: LibraryTrack[];
  visible: boolean;
};

export const PlaylistEditorModal = ({
  onAddTracks,
  onClose,
  onSaved,
  playlist,
  tracks,
  visible,
}: PlaylistEditorModalProps) => {
  const [title, setTitle] = React.useState(playlist.title);
  const [description, setDescription] = React.useState(playlist.description || '');
  const [removedTrackIds, setRemovedTrackIds] = React.useState<Set<string>>(
    new Set()
  );
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (!visible) return;
    setTitle(playlist.title);
    setDescription(playlist.description || '');
    setRemovedTrackIds(new Set());
    setIsSaving(false);
  }, [playlist.description, playlist.title, visible]);

  const toggleRemoved = React.useCallback((trackId: string) => {
    setRemovedTrackIds((current) => {
      const next = new Set(current);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }, []);

  const save = React.useCallback(async () => {
    if (!title.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await updateLocalPlaylist(playlist.id, {
        title,
        description,
        trackIds: playlist.trackIds.filter((id) => !removedTrackIds.has(id)),
      });
      await onSaved();
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [
    description,
    isSaving,
    onClose,
    onSaved,
    playlist.id,
    playlist.trackIds,
    removedTrackIds,
    title,
  ]);

  const openTrackPicker = React.useCallback(() => {
    onClose();
    onAddTracks();
  }, [onAddTracks, onClose]);
  const canSave = Boolean(title.trim()) && !isSaving;

  return (
    <SheetFrame visible={visible} title="Editar playlist" onClose={onClose}>
      <Text style={styles.label}>Nome</Text>
      <TextInput
        accessibilityLabel="Nome da playlist"
        maxLength={80}
        onChangeText={setTitle}
        placeholderTextColor="#777777"
        style={styles.input}
        value={title}
      />
      <Text style={styles.label}>Descrição</Text>
      <TextInput
        accessibilityLabel="Descrição da playlist"
        maxLength={240}
        multiline
        onChangeText={setDescription}
        placeholder="Opcional"
        placeholderTextColor="#777777"
        style={[styles.input, styles.descriptionInput]}
        value={description}
      />

      <View style={styles.trackHeader}>
        <Text style={styles.sectionTitle}>Músicas</Text>
        <LoggedPressable
          accessibilityLabel="Adicionar músicas"
          accessibilityRole="button"
          onPress={openTrackPicker}
          style={styles.addButton}
        >
          <Ionicons color="#FFFFFF" name="add" size={18} />
          <Text style={styles.addButtonText}>Adicionar</Text>
        </LoggedPressable>
      </View>

      <View style={styles.trackList}>
        {tracks.length ? tracks.map((track) => {
          const isRemoved = removedTrackIds.has(track.spotifyId);
          const imageURL = track.localImagePath || track.imageURL;
          return (
            <View key={track.spotifyId} style={[styles.trackRow, isRemoved && styles.removedRow]}>
              {imageURL ? (
                <Image source={{ uri: imageURL }} style={styles.cover} />
              ) : (
                <View style={[styles.cover, styles.coverFallback]}>
                  <Ionicons color="#8B8B8B" name="musical-note" size={17} />
                </View>
              )}
              <View style={styles.trackCopy}>
                <Text numberOfLines={1} style={styles.trackTitle}>{track.title}</Text>
                <Text numberOfLines={1} style={styles.trackSubtitle}>{track.artistName}</Text>
              </View>
              <LoggedPressable
                accessibilityLabel={`${isRemoved ? 'Manter' : 'Remover'} ${track.title}`}
                accessibilityRole="button"
                onPress={() => toggleRemoved(track.spotifyId)}
                style={styles.removeButton}
              >
                <Ionicons
                  color={isRemoved ? '#1ED760' : '#FF6B6B'}
                  name={isRemoved ? 'arrow-undo' : 'remove-circle-outline'}
                  size={22}
                />
              </LoggedPressable>
            </View>
          );
        }) : (
          <Text style={styles.emptyText}>Esta playlist ainda não tem músicas.</Text>
        )}
      </View>

      <LoggedPressable
        accessibilityLabel="Salvar playlist"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSave }}
        disabled={!canSave}
        onPress={() => void save()}
        style={[styles.primaryButton, !canSave && styles.primaryButtonDisabled]}
      >
        <Text style={styles.primaryButtonText}>
          {isSaving ? 'Salvando...' : 'Salvar alterações'}
        </Text>
      </LoggedPressable>
    </SheetFrame>
  );
};

const styles = StyleSheet.create({
  label: {
    color: 'rgba(255,255,255,0.68)',
    fontFamily: 'SF-Semibold',
    fontSize: 12,
    marginBottom: -10,
  },
  input: {
    backgroundColor: '#252525',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    color: '#FFFFFF',
    fontFamily: 'SF-Regular',
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  descriptionInput: { minHeight: 76, textAlignVertical: 'top' },
  trackHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: '#FFFFFF', fontFamily: 'SF-Bold', fontSize: 16 },
  addButton: {
    alignItems: 'center',
    backgroundColor: '#303030',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 10,
  },
  addButtonText: { color: '#FFFFFF', fontFamily: 'SF-Semibold', fontSize: 13 },
  trackList: { gap: 2 },
  trackRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255,255,255,0.08)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    paddingVertical: 7,
  },
  removedRow: { opacity: 0.5 },
  cover: { borderRadius: 4, height: 40, width: 40 },
  coverFallback: { alignItems: 'center', backgroundColor: '#292929', justifyContent: 'center' },
  trackCopy: { flex: 1, gap: 2 },
  trackTitle: { color: '#FFFFFF', fontFamily: 'SF-Semibold', fontSize: 14 },
  trackSubtitle: { color: 'rgba(255,255,255,0.58)', fontFamily: 'SF-Regular', fontSize: 12 },
  removeButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  emptyText: {
    color: 'rgba(255,255,255,0.58)',
    fontFamily: 'SF-Regular',
    paddingVertical: 18,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1ED760',
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
  },
  primaryButtonDisabled: { backgroundColor: '#3A3A3A' },
  primaryButtonText: { color: '#07120A', fontFamily: 'SF-Bold', fontSize: 14 },
});
