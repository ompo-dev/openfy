import * as React from 'react';
import { Alert } from 'react-native';
import { SheetFrame } from '../native';
import { HeaderIconButton } from '../gym';
import { PlaylistForm, PlaylistSheetAction } from '../LocalPlaylist/PlaylistForm';
import { createMixProject } from '../../services/mix/mixRepository';
import type { MixProject } from '../../services/mix/mixTimeline';
import { useLibraryStore } from '../../stores/useLibraryStore';

export function MixCreateModal({ visible, onClose, onCreated }: {
  visible: boolean; onClose: () => void; onCreated: (mix: MixProject) => void | Promise<void>;
}) {
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const pending = React.useRef(false);
  React.useEffect(() => { if (visible && !pending.current) { setTitle(''); setDescription(''); } }, [visible]);
  const create = async () => {
    if (!title.trim() || pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const mix = await createMixProject(title, description);
      useLibraryStore.getState().refreshLibrary();
      onClose();
      await onCreated(mix);
    } catch (error) { Alert.alert('Mix', error instanceof Error ? error.message : 'Não foi possível criar o mix.'); }
    finally { pending.current = false; setBusy(false); }
  };
  return <SheetFrame visible={visible} title="Novo mix" onClose={onClose}
    hideDefaultClose headerLeading={<HeaderIconButton icon="x" onPress={onClose} />}
    headerTrailing={<PlaylistSheetAction label="Criar mix" disabled={!title.trim()} busy={busy} onPress={() => void create()} />}>
    <PlaylistForm kind="mix" title={title} description={description} onTitleChange={setTitle} onDescriptionChange={setDescription} autoFocus disabled={busy} />
  </SheetFrame>;
}
