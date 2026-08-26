import * as React from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { type DownloadedTrack } from '@services';
import { SheetFrame } from '../native';

type PlaylistTrackPickerModalProps = {
  existingTrackIds: string[];
  onClose: () => void;
  onConfirm: (trackIds: string[]) => void;
  tracks: DownloadedTrack[];
  visible: boolean;
};

export const PlaylistTrackPickerModal = ({
  existingTrackIds,
  onClose,
  onConfirm,
  tracks,
  visible,
}: PlaylistTrackPickerModalProps) => {
  const [query, setQuery] = React.useState('');
  const [selectedTrackIds, setSelectedTrackIds] = React.useState<Set<string>>(
    new Set()
  );
  const existingTrackIdSet = React.useMemo(
    () => new Set(existingTrackIds),
    [existingTrackIds]
  );

  React.useEffect(() => {
    if (!visible) return;
    setQuery('');
    setSelectedTrackIds(new Set());
  }, [visible]);

  const visibleTracks = React.useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return tracks;
    return tracks.filter((track) =>
      `${track.title} ${track.artistName} ${track.albumName}`
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    );
  }, [query, tracks]);

  const toggleTrack = React.useCallback((trackId: string) => {
    setSelectedTrackIds((current) => {
      const next = new Set(current);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }, []);

  const confirm = React.useCallback(() => {
    if (selectedTrackIds.size === 0) return;
    onConfirm([...selectedTrackIds]);
    onClose();
  }, [onClose, onConfirm, selectedTrackIds]);

  const selectedCount = selectedTrackIds.size;
  const confirmLabel = `Adicionar ${selectedCount} música${
    selectedCount === 1 ? '' : 's'
  }`;

  return (
    <SheetFrame visible={visible} title="Adicionar músicas" onClose={onClose} scroll={false}>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setQuery}
        placeholder="Buscar músicas baixadas"
        placeholderTextColor="#858585"
        style={styles.searchInput}
        value={query}
      />
      <FlatList
        data={visibleTracks}
        keyExtractor={(track) => track.spotifyId}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>Nenhuma música baixada encontrada.</Text>
        }
        renderItem={({ item }) => {
          const isExisting = existingTrackIdSet.has(item.spotifyId);
          const isSelected = selectedTrackIds.has(item.spotifyId);
          return (
            <Pressable
              accessibilityLabel={
                isExisting
                  ? `${item.title} já está na playlist`
                  : `${isSelected ? 'Remover' : 'Selecionar'} ${item.title}`
              }
              accessibilityRole="button"
              disabled={isExisting}
              onPress={() => toggleTrack(item.spotifyId)}
              style={[styles.trackRow, isExisting && styles.trackRowDisabled]}
            >
              {item.localImagePath || item.imageURL ? (
                <Image
                  cachePolicy="memory-disk"
                  source={{ uri: item.localImagePath || item.imageURL }}
                  style={styles.cover}
                />
              ) : (
                <View style={[styles.cover, styles.coverFallback]}>
                  <Ionicons color="#999999" name="musical-note" size={19} />
                </View>
              )}
              <View style={styles.copy}>
                <Text numberOfLines={1} style={styles.title}>
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={styles.subtitle}>
                  {isExisting ? 'Já está na playlist' : item.artistName}
                </Text>
              </View>
              <Ionicons
                color={isExisting || isSelected ? '#1ED760' : '#8B8B8B'}
                name={isExisting || isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
              />
            </Pressable>
          );
        }}
        showsVerticalScrollIndicator={false}
        style={styles.trackList}
      />
      <Pressable
        accessibilityLabel={confirmLabel}
        accessibilityRole="button"
        disabled={selectedCount === 0}
        onPress={confirm}
        style={[styles.confirmButton, selectedCount === 0 && styles.confirmButtonDisabled]}
      >
        <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
      </Pressable>
    </SheetFrame>
  );
};

const styles = StyleSheet.create({
  searchInput: {
    backgroundColor: '#252525',
    borderRadius: 10,
    color: '#FFFFFF',
    fontFamily: 'SF-Regular',
    fontSize: 14,
    height: 42,
    paddingHorizontal: 12,
  },
  trackList: {
    height: 390,
  },
  trackRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255, 255, 255, 0.09)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 62,
    paddingVertical: 8,
  },
  trackRowDisabled: {
    opacity: 0.58,
  },
  cover: {
    borderRadius: 4,
    height: 42,
    width: 42,
  },
  coverFallback: {
    alignItems: 'center',
    backgroundColor: '#292929',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'SF-Semibold',
    fontSize: 14,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'SF-Regular',
    fontSize: 12,
  },
  empty: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontFamily: 'SF-Regular',
    paddingVertical: 28,
    textAlign: 'center',
  },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: '#1ED760',
    borderRadius: 999,
    height: 46,
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#3A3A3A',
  },
  confirmButtonText: {
    color: '#07120A',
    fontFamily: 'SF-Bold',
    fontSize: 14,
  },
});
