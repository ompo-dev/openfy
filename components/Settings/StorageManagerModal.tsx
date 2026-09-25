import * as React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { useDownloads, useLibrarySelectedCategory } from '@context';
import {
  deleteAllDownloadedTracks,
  deleteDownloadedTrack,
  getDownloadStorageInfo,
  type DownloadStorageInfo,
} from '@services';
import { AppIcon, LoggedPressable, SheetFrame } from '../native';

type StorageManagerModalProps = {
  visible: boolean;
  onClose: () => void;
  onStorageChanged: (storage: DownloadStorageInfo) => void;
};

const EMPTY_STORAGE: DownloadStorageInfo = {
  directory: '',
  totalBytes: 0,
  tracks: [],
};

export const formatStorageSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const megabytes = bytes / (1024 * 1024);
  if (megabytes < 1024) return `${megabytes.toFixed(megabytes < 10 ? 1 : 0)} MB`;
  return `${(megabytes / 1024).toFixed(2)} GB`;
};

export function StorageManagerModal({
  visible,
  onClose,
  onStorageChanged,
}: StorageManagerModalProps) {
  const { cancelDownload, clearCompletedDownloads } = useDownloads();
  const { refreshLibrary } = useLibrarySelectedCategory();
  const [storage, setStorage] = React.useState(EMPTY_STORAGE);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const next = await getDownloadStorageInfo();
    setStorage(next);
    onStorageChanged(next);
    return next;
  }, [onStorageChanged]);

  React.useEffect(() => {
    if (!visible) {
      setSelectedIds(new Set());
      return;
    }
    setIsLoading(true);
    void refresh().finally(() => setIsLoading(false));
  }, [refresh, visible]);

  const finishDeletion = React.useCallback(async () => {
    clearCompletedDownloads();
    refreshLibrary();
    setSelectedIds(new Set());
    await refresh();
  }, [clearCompletedDownloads, refresh, refreshLibrary]);

  const deleteSelected = React.useCallback(() => {
    const ids = [...selectedIds];
    if (!ids.length || isLoading) return;
    Alert.alert(
      `Excluir ${ids.length} ${ids.length === 1 ? 'download' : 'downloads'}?`,
      'As músicas continuam na biblioteca e poderão ser ouvidas por streaming.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            setIsLoading(true);
            void Promise.all(
              ids.map(async (id) => {
                await cancelDownload(id);
                await deleteDownloadedTrack(id);
              })
            ).then(finishDeletion).finally(() => setIsLoading(false));
          },
        },
      ]
    );
  }, [cancelDownload, finishDeletion, isLoading, selectedIds]);

  const deleteAll = React.useCallback(() => {
    if (!storage.tracks.length || isLoading) return;
    Alert.alert(
      'Excluir todos os downloads?',
      'Os arquivos de áudio serão apagados deste aparelho. As músicas permanecem na biblioteca para streaming.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir todos',
          style: 'destructive',
          onPress: () => {
            setIsLoading(true);
            void Promise.all(storage.tracks.map((track) => cancelDownload(track.spotifyId)))
              .then(deleteAllDownloadedTracks)
              .then(finishDeletion)
              .finally(() => setIsLoading(false));
          },
        },
      ]
    );
  }, [cancelDownload, finishDeletion, isLoading, storage.tracks]);

  const toggleSelection = (spotifyId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(spotifyId)) next.delete(spotifyId);
      else next.add(spotifyId);
      return next;
    });
  };

  return (
    <SheetFrame visible={visible} title="Armazenamento" onClose={onClose}>
      <View style={styles.summary}>
        <View>
          <Text style={styles.summaryValue}>{formatStorageSize(storage.totalBytes)}</Text>
          <Text style={styles.summaryLabel}>
            {storage.tracks.length} {storage.tracks.length === 1 ? 'música baixada' : 'músicas baixadas'}
          </Text>
        </View>
        {storage.tracks.length ? (
          <LoggedPressable
            accessibilityLabel="Excluir todos os downloads"
            accessibilityRole="button"
            disabled={isLoading}
            onPress={deleteAll}
            style={({ pressed }) => [styles.deleteAllButton, pressed && styles.pressed]}
          >
            <AppIcon color="#FF6B6B" name="trash" size={18} />
            <Text style={styles.deleteAllText}>Excluir todos</Text>
          </LoggedPressable>
        ) : null}
      </View>

      <View style={styles.location}>
        <AppIcon color="#8E8E93" name="folder-outline" size={18} />
        <View style={styles.locationCopy}>
          <Text style={styles.locationLabel}>Pasta dos arquivos</Text>
          <Text selectable numberOfLines={3} style={styles.locationPath}>
            {storage.directory || 'Armazenamento interno do app'}
          </Text>
        </View>
      </View>

      {storage.tracks.length ? (
        <>
          <Text style={styles.helper}>Selecione uma ou mais músicas para liberar espaço.</Text>
          {storage.tracks.map((track) => {
            const selected = selectedIds.has(track.spotifyId);
            return (
              <LoggedPressable
                accessibilityLabel={`${selected ? 'Desmarcar' : 'Selecionar'} ${track.title}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                key={track.spotifyId}
                onPress={() => toggleSelection(track.spotifyId)}
                style={({ pressed }) => [styles.trackRow, pressed && styles.pressed]}
              >
                {track.localImagePath || track.imageURL ? (
                  <Image
                    cachePolicy="memory-disk"
                    source={{ uri: track.localImagePath || track.imageURL }}
                    style={styles.cover}
                  />
                ) : (
                  <View style={[styles.cover, styles.coverFallback]}>
                    <AppIcon color="#8E8E93" name="musical-note" size={19} />
                  </View>
                )}
                <View style={styles.trackCopy}>
                  <Text numberOfLines={1} style={styles.trackTitle}>{track.title}</Text>
                  <Text numberOfLines={1} style={styles.trackArtist}>{track.artistName}</Text>
                </View>
                <Text style={styles.trackSize}>{formatStorageSize(track.bytes)}</Text>
                <AppIcon
                  color={selected ? '#1ED760' : '#6E6E73'}
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={23}
                />
              </LoggedPressable>
            );
          })}
          <LoggedPressable
            accessibilityLabel={`Excluir ${selectedIds.size} downloads selecionados`}
            accessibilityRole="button"
            disabled={!selectedIds.size || isLoading}
            onPress={deleteSelected}
            style={({ pressed }) => [
              styles.selectedButton,
              !selectedIds.size && styles.selectedButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.selectedButtonText}>
              {isLoading ? 'Atualizando…' : `Excluir selecionadas (${selectedIds.size})`}
            </Text>
          </LoggedPressable>
        </>
      ) : (
        <View style={styles.empty}>
          <AppIcon color="#77777C" name="download-outline" size={30} />
          <Text style={styles.emptyTitle}>{isLoading ? 'Calculando espaço…' : 'Nenhuma música baixada'}</Text>
          <Text style={styles.emptyText}>As músicas salvas sem download continuam disponíveis por streaming.</Text>
        </View>
      )}
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  summary: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 14,
  },
  summaryValue: { color: '#FFFFFF', fontFamily: 'SF-Bold', fontSize: 24 },
  summaryLabel: { color: '#8E8E93', fontFamily: 'SF-Regular', fontSize: 12, marginTop: 2 },
  deleteAllButton: { alignItems: 'center', flexDirection: 'row', gap: 6, padding: 8 },
  deleteAllText: { color: '#FF6B6B', fontFamily: 'SF-Semibold', fontSize: 13 },
  location: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  locationCopy: { flex: 1, gap: 3 },
  locationLabel: { color: '#FFFFFF', fontFamily: 'SF-Semibold', fontSize: 13 },
  locationPath: { color: '#8E8E93', fontFamily: 'SF-Regular', fontSize: 11, lineHeight: 15 },
  helper: { color: '#8E8E93', fontFamily: 'SF-Regular', fontSize: 12, paddingVertical: 12 },
  trackRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255,255,255,0.09)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 11,
    minHeight: 62,
    paddingVertical: 9,
  },
  cover: { borderRadius: 5, height: 44, width: 44 },
  coverFallback: { alignItems: 'center', backgroundColor: '#28282A', justifyContent: 'center' },
  trackCopy: { flex: 1, gap: 2, minWidth: 0 },
  trackTitle: { color: '#FFFFFF', fontFamily: 'SF-Semibold', fontSize: 14 },
  trackArtist: { color: '#929297', fontFamily: 'SF-Regular', fontSize: 12 },
  trackSize: { color: '#929297', fontFamily: 'SF-Regular', fontSize: 12 },
  selectedButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 46,
  },
  selectedButtonDisabled: { opacity: 0.35 },
  selectedButtonText: { color: '#111111', fontFamily: 'SF-Bold', fontSize: 14 },
  empty: { alignItems: 'center', gap: 7, paddingHorizontal: 28, paddingVertical: 36 },
  emptyTitle: { color: '#FFFFFF', fontFamily: 'SF-Semibold', fontSize: 15 },
  emptyText: { color: '#8E8E93', fontFamily: 'SF-Regular', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  pressed: { opacity: 0.62 },
});
