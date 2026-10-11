import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { AppIcon as Ionicons } from "../native/AppIcon";

import {
  addTracksToLocalPlaylist,
  getLibraryTracks,
  getLocalPlaylists,
  upsertCatalogTracks,
  type CatalogTrackInput,
  type LibraryTrack,
  type LocalPlaylist,
} from '@services';
import { GlassSurface, LoggedPressable, SheetFrame } from '../native';
import { ProgressiveFlatList } from '../common/ProgressiveList';
import { PlaylistCreateModal } from './PlaylistCreateModal';
import { PlaylistSheetAction } from './PlaylistForm';
import { log } from '../../utils/appLogger';

type TrackPlaylistPickerModalProps = {
  onAdded?: (playlistCount: number) => void | Promise<void>;
  onClose: () => void;
  track: CatalogTrackInput;
  visible: boolean;
};

export function TrackPlaylistPickerModal({
  onAdded,
  onClose,
  track,
  visible,
}: TrackPlaylistPickerModalProps) {
  const [playlists, setPlaylists] = React.useState<LocalPlaylist[]>([]);
  const [libraryTracks, setLibraryTracks] = React.useState<LibraryTrack[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isCreateVisible, setIsCreateVisible] = React.useState(false);
  const savePending = React.useRef(false);

  React.useEffect(() => {
    if (!visible) return;
    let active = true;
    setSelectedIds(new Set());
    setIsLoading(true);
    log.playlist('track picker opened', { trackId: track.spotifyId });
    void Promise.all([getLocalPlaylists(), getLibraryTracks()])
      .then(([items, tracks]) => {
        if (!active) return;
        setPlaylists(items);
        setLibraryTracks(tracks);
      })
      .catch((error: unknown) => {
        log.error('playlist picker load failed', { trackId: track.spotifyId, error });
        if (active) {
          setPlaylists([]);
          setLibraryTracks([]);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [track.spotifyId, visible]);

  const tracksById = React.useMemo(
    () => new Map(libraryTracks.map((item) => [item.spotifyId, item])),
    [libraryTracks]
  );

  const toggle = React.useCallback(
    (playlist: LocalPlaylist) => {
      if (savePending.current || playlist.trackIds.includes(track.spotifyId)) return;
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(playlist.id)) next.delete(playlist.id);
        else next.add(playlist.id);
        return next;
      });
    },
    [track.spotifyId]
  );

  const confirm = React.useCallback(async () => {
    if (!selectedIds.size || savePending.current) return;
    savePending.current = true;
    setIsSaving(true);
    log.playlist('add track started', {
      trackId: track.spotifyId,
      playlistIds: [...selectedIds],
    });
    try {
      // A Home discovery can be streamed before it exists in the library.
      // Persist its metadata first so playlist rows never become orphan IDs.
      await upsertCatalogTracks([track]);
      await Promise.all(
        [...selectedIds].map((playlistId) =>
          addTracksToLocalPlaylist(playlistId, [track.spotifyId]).then((saved) => {
            if (saved === null) throw new Error('Playlist removida');
          })
        )
      );
      await onAdded?.(selectedIds.size);
      log.playlist('add track completed', {
        trackId: track.spotifyId,
        playlistCount: selectedIds.size,
      });
      onClose();
    } catch (error) {
      log.error('add track to playlist failed', { trackId: track.spotifyId, error });
      Alert.alert(
        'Não foi possível adicionar',
        'Tente novamente sem fechar o aplicativo.'
      );
    } finally {
      savePending.current = false;
      setIsSaving(false);
    }
  }, [onAdded, onClose, selectedIds, track]);

  const selectedCount = selectedIds.size;

  return (
    <SheetFrame
      onClose={onClose}
      scroll={false}
      contentHeight={112 + (isLoading ? 64 : Math.max(64, playlists.length * 64))}
      artworkURL={track.imageURL}
      headerTrailing={<PlaylistSheetAction label={`Adicionar em ${selectedCount} playlist${selectedCount === 1 ? '' : 's'}`}
        disabled={!selectedCount} busy={isSaving} onPress={() => void confirm()} />}
      nested={<PlaylistCreateModal visible={isCreateVisible} onClose={() => setIsCreateVisible(false)}
        onCreated={(playlist) => {
          setPlaylists((current) => [...current.filter((item) => item.id !== playlist.id), playlist]);
          setSelectedIds((current) => new Set([...current, playlist.id]));
        }} />}
      title="Adicionar à playlist"
      visible={visible}
    >
      <Text numberOfLines={1} style={styles.trackTitle}>
        {track.title}
      </Text>
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : (
        <ProgressiveFlatList
          listKey={track.spotifyId}
          data={playlists}
          keyExtractor={(playlist) => playlist.id}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Nenhuma playlist.
            </Text>
          }
          renderItem={({ item }) => {
            const alreadyAdded = item.trackIds.includes(track.spotifyId);
            const selected = selectedIds.has(item.id);
            const artworkURLs = [...new Set([
              ...(item.coverImageURLs || []),
              ...item.trackIds.map((trackId) => {
                const playlistTrack = tracksById.get(trackId);
                return playlistTrack?.localImagePath || playlistTrack?.imageURL || '';
              }),
            ].filter(Boolean))].slice(0, 4);
            return (
              <LoggedPressable
                accessibilityLabel={
                  alreadyAdded
                    ? `${track.title} já está em ${item.title}`
                    : `${selected ? 'Desmarcar' : 'Adicionar em'} ${item.title}`
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked: alreadyAdded || selected }}
                disabled={alreadyAdded || isSaving}
                onPress={() => toggle(item)}
                style={[styles.row, alreadyAdded && styles.rowDisabled]}
              >
                <PlaylistArtwork title={item.title} imageURLs={artworkURLs} />
                <View style={styles.copy}>
                  <Text numberOfLines={1} style={styles.title}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.subtitle}>
                    {alreadyAdded
                      ? 'Já adicionada'
                      : `${item.trackIds.length} música${item.trackIds.length === 1 ? '' : 's'}`}
                  </Text>
                </View>
                <Ionicons
                  color={alreadyAdded || selected ? '#1ED760' : '#8B8B8B'}
                  name={
                    alreadyAdded || selected
                      ? 'checkmark-circle'
                      : 'ellipse-outline'
                  }
                  size={23}
                />
              </LoggedPressable>
            );
          }}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />
      )}
      <LoggedPressable accessibilityLabel="Nova playlist" accessibilityRole="button" disabled={isSaving}
        onPress={() => setIsCreateVisible(true)}>
        <GlassSurface glass="regular" isInteractive style={styles.confirmButton}>
          <Ionicons name="add" size={20} color="#1ED760" />
          <Text style={styles.confirmText}>Nova playlist</Text>
        </GlassSurface>
      </LoggedPressable>
    </SheetFrame>
  );
}

const PlaylistArtwork = ({
  imageURLs,
  title,
}: {
  imageURLs: string[];
  title: string;
}) => (
  <View
    accessibilityLabel={`Capa da playlist ${title}`}
    accessibilityRole="image"
    style={[styles.playlistIcon, imageURLs.length > 1 && styles.playlistMosaic]}
  >
    {imageURLs.length ? imageURLs.map((uri, index) => (
      <Image
        key={`${uri}-${index}`}
        cachePolicy="memory-disk"
        source={{ uri }}
        style={[
          styles.playlistCover,
          imageURLs.length === 1 && styles.playlistCoverSingle,
          imageURLs.length === 2 && styles.playlistCoverHalf,
        ]}
      />
    )) : (
      <Ionicons color="#D0D0D0" name="musical-notes" size={18} />
    )}
  </View>
);

const styles = StyleSheet.create({
  trackTitle: {
    color: 'rgba(255,255,255,0.68)',
    fontFamily: 'SF-Semibold',
    fontSize: 13,
    textAlign: 'center',
  },
  loading: {
    alignItems: 'center',
    height: 64,
    justifyContent: 'center',
  },
  list: { flex: 1, minHeight: 0 },
  row: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255,255,255,0.08)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 11,
    minHeight: 64,
    paddingVertical: 8,
  },
  rowDisabled: { opacity: 0.62 },
  playlistIcon: {
    alignItems: 'center',
    backgroundColor: '#292929',
    borderRadius: 5,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  playlistMosaic: { alignContent: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  playlistCover: { height: 23, width: 23 },
  playlistCoverSingle: { height: 48, width: 48 },
  playlistCoverHalf: { height: 48, width: 23 },
  copy: { flex: 1, gap: 3 },
  title: { color: '#FFFFFF', fontFamily: 'SF-Semibold', fontSize: 14 },
  subtitle: {
    color: 'rgba(255,255,255,0.58)',
    fontFamily: 'SF-Regular',
    fontSize: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.58)',
    fontFamily: 'SF-Regular',
    paddingHorizontal: 20,
    paddingVertical: 18,
    textAlign: 'center',
  },
  confirmButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 46,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  confirmText: { color: '#FFFFFF', fontFamily: 'SF-Semibold', fontSize: 14 },
});
