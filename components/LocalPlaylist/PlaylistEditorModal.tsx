import * as React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { updateLocalPlaylist, type LibraryTrack, type LocalPlaylist } from '@services';
import { AppIcon, SheetFrame } from '../native';
import { TrackRow } from '../common/TrackRow';
import { ProgressiveFlatList } from '../common/ProgressiveList';
import { PlaylistForm, PlaylistSheetAction } from './PlaylistForm';

type PlaylistEditorModalProps = {
  onAddTracks: () => void; onClose: () => void; onSaved: () => void | Promise<void>;
  playlist: LocalPlaylist; tracks: LibraryTrack[]; visible: boolean;
};
export const PlaylistEditorModal = ({ onAddTracks, onClose, onSaved, playlist, tracks, visible }: PlaylistEditorModalProps) => {
  const [title, setTitle] = React.useState(playlist.title);
  const [description, setDescription] = React.useState(playlist.description || '');
  const [removedTrackIds, setRemovedTrackIds] = React.useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = React.useState(false);
  const pending = React.useRef(false);
  const session = React.useRef('');
  React.useEffect(() => {
    if (!visible) { session.current = ''; return; }
    if (session.current === playlist.id || pending.current) return;
    session.current = playlist.id;
    setTitle(playlist.title);
    setDescription(playlist.description || '');
    setRemovedTrackIds(new Set());
  }, [visible, playlist.id, playlist.title, playlist.description]);
  const toggleRemoved = (id: string) => setRemovedTrackIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const save = async (addTracks = false) => {
    if (!title.trim() || pending.current) return;
    pending.current = true;
    setIsSaving(true);
    try {
      const saved = await updateLocalPlaylist(playlist.id, { title, description,
        trackIds: playlist.trackIds.filter((id) => !removedTrackIds.has(id)) });
      if (!saved) throw new Error('Playlist removida');
      await onSaved();
      onClose();
      if (addTracks) onAddTracks();
    } catch {
      Alert.alert('Playlist', 'Não foi possível salvar as alterações. Tente novamente.');
    } finally { pending.current = false; setIsSaving(false); }
  };
  return <SheetFrame visible={visible} title="Editar playlist" onClose={onClose}
    artworkURL={tracks[0]?.localImagePath || tracks[0]?.imageURL || playlist.coverImageURLs?.[0]}
    scroll={false} contentHeight={252 + Math.max(1, tracks.length) * 64}
    headerTrailing={<PlaylistSheetAction label="Salvar playlist" onPress={() => void save()}
      disabled={!title.trim()} busy={isSaving} />}>
    <ProgressiveFlatList data={tracks} listKey={playlist.id} keyExtractor={(track) => track.spotifyId}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
      ListHeaderComponent={<>
        <PlaylistForm title={title} description={description} onTitleChange={setTitle} onDescriptionChange={setDescription} disabled={isSaving} />
        <View style={styles.trackHeader}>
          <Text style={styles.sectionTitle}>Músicas · {playlist.trackIds.filter((id) => !removedTrackIds.has(id)).length}</Text>
          <PlaylistSheetAction label="Adicionar músicas" icon="add" onPress={() => void save(true)} disabled={!title.trim()} busy={isSaving} />
        </View>
      </>}
      ListEmptyComponent={<Text style={styles.empty}>Esta playlist ainda não tem músicas.</Text>}
      renderItem={({ item }) => {
        const removed = removedTrackIds.has(item.spotifyId);
        const label = `${removed ? 'Manter' : 'Remover'} ${item.title}`;
        return <TrackRow track={item} repairUnavailableOnPress={false} title={item.title} subtitle={removed ? 'Será removida' : item.artistName}
          imageURL={item.localImagePath || item.imageURL} accessibilityLabel={label} disabled={isSaving}
          active={false} playing={false} downloadState="idle" onDownload={() => {}}
          onPress={() => toggleRemoved(item.spotifyId)}
          trailingAction={<AppIcon name={removed ? 'arrow-undo' : 'remove-circle-outline'} size={22} color={removed ? '#1ED760' : '#FF6969'} />} />;
      }} />
  </SheetFrame>;
};
const styles = StyleSheet.create({
  trackHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, marginBottom: 4 },
  sectionTitle: { color: '#FFFFFF', fontFamily: 'SF-Semibold', fontSize: 14 },
  empty: { color: 'rgba(255,255,255,0.6)', fontFamily: 'SF-Regular', fontSize: 13, paddingVertical: 18, textAlign: 'center' },
});
