import * as React from 'react';
import { Alert } from 'react-native';
import { createLocalPlaylist, type LocalPlaylist } from '@services';
import { SheetFrame } from '../native';
import { PlaylistForm, PlaylistSheetAction } from './PlaylistForm';
import { useLibraryStore } from '../../stores/useLibraryStore';

type PlaylistCreateModalProps = {
  onClose: () => void;
  onCreated: (playlist: LocalPlaylist) => void | Promise<void>;
  visible: boolean;
};

export const PlaylistCreateModal = ({ onClose, onCreated, visible }: PlaylistCreateModalProps) => {
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const pending = React.useRef(false);
  React.useEffect(() => {
    if (!visible || pending.current) return;
    setTitle('');
    setDescription('');
  }, [visible]);

  const create = async () => {
    if (!title.trim() || pending.current) return;
    pending.current = true;
    setIsSaving(true);
    try {
      const playlist = await createLocalPlaylist(title.trim(), description);
      useLibraryStore.getState().refreshLibrary();
      onClose();
      await onCreated(playlist);
    } catch {
      Alert.alert('Playlist', 'Não foi possível criar a playlist. Tente novamente.');
    } finally { pending.current = false; setIsSaving(false); }
  };
  return <SheetFrame visible={visible} title="Nova playlist" onClose={onClose}
    headerTrailing={<PlaylistSheetAction label="Criar playlist" onPress={() => void create()}
      disabled={!title.trim()} busy={isSaving} />}>
    <PlaylistForm title={title} description={description} onTitleChange={setTitle}
      onDescriptionChange={setDescription} autoFocus disabled={isSaving} />
  </SheetFrame>;
};
