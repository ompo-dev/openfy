import * as React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { AppIcon as Ionicons } from "../native/AppIcon";

import { type LibraryTrack } from '@services';
import { SheetFrame } from '../native';
import { TrackRow } from '../common/TrackRow';
import { ProgressiveFlatList } from '../common/ProgressiveList';
import { PlaylistSheetAction } from './PlaylistForm';

type PlaylistTrackPickerModalProps = {
  existingTrackIds: string[];
  onClose: () => void;
  onConfirm: (trackIds: string[]) => void;
  tracks: LibraryTrack[];
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
    <SheetFrame visible={visible} title="Adicionar músicas" onClose={onClose} scroll={false}
      headerTrailing={<PlaylistSheetAction label={confirmLabel} disabled={!selectedCount} onPress={confirm} />}
      contentHeight={72 + Math.max(1, visibleTracks.length) * 64}>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setQuery}
        placeholder="Buscar na biblioteca"
        placeholderTextColor="#858585"
        style={styles.searchInput}
        value={query}
      />
      <ProgressiveFlatList
        listKey={query}
        data={visibleTracks}
        keyExtractor={(track) => track.spotifyId}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>Nenhuma música encontrada na biblioteca.</Text>
        }
        renderItem={({ item }) => {
          const isExisting = existingTrackIdSet.has(item.spotifyId);
          const isSelected = selectedTrackIds.has(item.spotifyId);
          return (
            <TrackRow
              accessibilityLabel={
                isExisting
                  ? `${item.title} já está na playlist`
                  : `${isSelected ? 'Remover' : 'Selecionar'} ${item.title}`
              }
              disabled={isExisting}
              onPress={() => toggleTrack(item.spotifyId)}
              title={item.title}
              subtitle={isExisting ? 'Já está na playlist' : item.artistName}
              imageURL={item.localImagePath || item.imageURL}
              active={false} playing={false} downloadState="idle" onDownload={() => {}}
              trailingAction={<Ionicons
                color={isExisting || isSelected ? '#1ED760' : '#8B8B8B'}
                name={isExisting || isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
              />}
            />
          );
        }}
        showsVerticalScrollIndicator={false}
        style={styles.trackList}
      />
    </SheetFrame>
  );
};

const styles = StyleSheet.create({
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    color: '#FFFFFF',
    fontFamily: 'SF-Regular',
    fontSize: 14,
    height: 42,
    paddingHorizontal: 12,
  },
  trackList: {
    flex: 1,
    minHeight: 0,
  },
  empty: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontFamily: 'SF-Regular',
    paddingVertical: 28,
    textAlign: 'center',
  },
});
