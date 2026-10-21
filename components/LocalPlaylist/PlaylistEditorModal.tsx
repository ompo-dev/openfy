import * as React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { updateLocalPlaylist, type LibraryTrack, type LocalPlaylist } from '@services';
import { usePlayer } from '@context';
import { AppIcon, LoggedPressable, SheetFrame } from '../native';
import { TrackRow } from '../common/TrackRow';
import { ProgressiveFlatList } from '../common/ProgressiveList';
import { PlaylistForm, PlaylistSheetAction } from './PlaylistForm';
import { HeaderIconButton, SettingsRow, Chevron, useColors } from '../gym';
import { SettingIcon } from '../gym/SettingIcon';
import { LibrarySwipeRow } from '../OfflineLibrary/LibrarySwipeRow';
import { log } from '../../utils/appLogger';

type PlaylistEditorModalProps = {
  onAddTracks: () => void; onClose: () => void; onSaved: () => void | Promise<void>;
  playlist: LocalPlaylist; tracks: LibraryTrack[]; visible: boolean;
  nested?: React.ReactNode;
};
export const PlaylistEditorModal = ({ onAddTracks, onClose, onSaved, playlist, tracks, visible, nested }: PlaylistEditorModalProps) => {
  const colors = useColors();
  const { playWithQueue, currentTrack, isPlaying } = usePlayer((state) => ({
    playWithQueue: state.playWithQueue, currentTrack: state.currentTrack, isPlaying: state.playerState.isPlaying,
  }));
  const [title, setTitle] = React.useState(playlist.title);
  const [description, setDescription] = React.useState(playlist.description || '');
  const [removedTrackIds, setRemovedTrackIds] = React.useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = React.useState(false);
  const pending = React.useRef(false);
  const openSwipeRow = React.useRef<(() => void) | null>(null);
  const closeSwipeRow = React.useCallback(() => { openSwipeRow.current?.(); openSwipeRow.current = null; }, []);
  const session = React.useRef('');
  React.useEffect(() => {
    closeSwipeRow();
    if (!visible) { session.current = ''; return; }
    if (session.current === playlist.id || pending.current) return;
    session.current = playlist.id;
    setTitle(playlist.title);
    setDescription(playlist.description || '');
    setRemovedTrackIds(new Set());
  }, [visible, playlist.id, playlist.title, playlist.description, closeSwipeRow]);
  const toggleRemoved = (id: string) => setRemovedTrackIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const save = async (addTracks = false) => {
    if (!title.trim() || pending.current) return;
    closeSwipeRow();
    pending.current = true;
    setIsSaving(true);
    try {
      const saved = await updateLocalPlaylist(playlist.id, { title, description,
        trackIds: playlist.trackIds.filter((id) => !removedTrackIds.has(id)) });
      if (!saved) throw new Error('Playlist removida');
      await onSaved();
      if (addTracks) onAddTracks();
      else onClose();
    } catch {
      Alert.alert('Playlist', 'Não foi possível salvar as alterações. Tente novamente.');
    } finally { pending.current = false; setIsSaving(false); }
  };
  return <SheetFrame visible={visible} title="Editar playlist" onClose={onClose}
    nested={nested}
    hideDefaultClose headerLeading={<HeaderIconButton icon="x" onPress={onClose} />}
    artworkURL={tracks[0]?.localImagePath || tracks[0]?.imageURL || playlist.coverImageURLs?.[0]}
    scroll={false}
    headerTrailing={<PlaylistSheetAction label="Salvar playlist" onPress={() => void save()}
      disabled={!title.trim()} busy={isSaving} />}>
    <ProgressiveFlatList testID="playlist-editor-tracks" data={tracks} listKey={playlist.id} keyExtractor={(track) => track.spotifyId}
      onScrollBeginDrag={closeSwipeRow}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
      ListHeaderComponent={<View>
        <PlaylistForm title={title} description={description} onTitleChange={setTitle} onDescriptionChange={setDescription} disabled={isSaving} />
        <View style={styles.trackHeader}>
          <SettingsRow title="Adicionar músicas" leading={<SettingIcon name="add" />}
            accessibilityLabel="Adicionar músicas" disabled={!title.trim() || isSaving}
            trailing={<Chevron />} onPress={() => void save(true)} />
        </View>
        <Text style={styles.sectionTitle}>Músicas · {playlist.trackIds.filter((id) => !removedTrackIds.has(id)).length}</Text>
      </View>}
      ListEmptyComponent={<Text style={styles.empty}>Esta playlist ainda não tem músicas.</Text>}
      renderItem={({ item }) => {
        const removed = removedTrackIds.has(item.spotifyId);
        const label = `${removed ? 'Manter' : 'Remover'} ${item.title}`;
        return <LibrarySwipeRow label={label} disabled={isSaving} undo={removed} backgroundColor={colors.background}
          onWillOpen={(close) => { if (openSwipeRow.current !== close) openSwipeRow.current?.(); openSwipeRow.current = close; }}
          onRemove={() => { log.playlist('playlist track removal changed', { playlistId: playlist.id, trackId: item.spotifyId, removed: !removed }); toggleRemoved(item.spotifyId); }}>
          <TrackRow track={item} title={item.title} subtitle={removed ? 'Será removida' : item.artistName}
          imageURL={item.localImagePath || item.imageURL} accessibilityLabel={removed ? label : undefined} disabled={isSaving}
          active={currentTrack?.spotifyId === item.spotifyId} playing={isPlaying} downloadState="idle" onDownload={() => {}}
          onPress={() => {
            if (removed) { toggleRemoved(item.spotifyId); return; }
            const queue = tracks.filter((track) => !removedTrackIds.has(track.spotifyId));
            void playWithQueue(queue, queue.indexOf(item), `playlist:${playlist.id}`);
          }}
          trailingAction={removed ? <LoggedPressable accessibilityRole="button" accessibilityLabel={label} style={styles.undoAction}
            disabled={isSaving} onPress={(event) => { event.stopPropagation(); toggleRemoved(item.spotifyId); }}>
            <AppIcon name="arrow-undo" color="#1ED760" size={22} />
          </LoggedPressable> : <View />} />
        </LibrarySwipeRow>;
      }} />
  </SheetFrame>;
};
const styles = StyleSheet.create({
  undoAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  trackHeader: { borderRadius: 22, overflow: 'hidden', backgroundColor: '#303030', marginVertical: 16 },
  sectionTitle: { color: '#9E9E9E', fontFamily: 'SF-Regular', fontSize: 14, marginLeft: 16, marginBottom: 8 },
  empty: { color: 'rgba(255,255,255,0.6)', fontFamily: 'SF-Regular', fontSize: 13, paddingVertical: 18, textAlign: 'center' },
});
