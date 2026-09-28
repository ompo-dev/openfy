import * as React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import {
  createLocalPlaylist,
  type LocalPlaylist,
} from '@services';
import { LoggedPressable, SheetFrame } from '../native';

type PlaylistCreateModalProps = {
  onClose: () => void;
  onCreated: (playlist: LocalPlaylist) => void | Promise<void>;
  visible: boolean;
};

export const PlaylistCreateModal = ({
  onClose,
  onCreated,
  visible,
}: PlaylistCreateModalProps) => {
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (!visible) return;
    setTitle('');
    setDescription('');
    setIsSaving(false);
  }, [visible]);

  const create = React.useCallback(async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle || isSaving) return;
    setIsSaving(true);
    try {
      const playlist = await createLocalPlaylist(cleanTitle, description);
      onClose();
      await onCreated(playlist);
    } finally {
      setIsSaving(false);
    }
  }, [description, isSaving, onClose, onCreated, title]);

  const canCreate = Boolean(title.trim()) && !isSaving;

  return (
    <SheetFrame visible={visible} title="Nova playlist" onClose={onClose}>
      <Text style={styles.label}>Nome</Text>
      <TextInput
        accessibilityLabel="Nome da playlist"
        autoFocus
        maxLength={80}
        onChangeText={setTitle}
        placeholder="Minha playlist"
        placeholderTextColor="#777777"
        returnKeyType="next"
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
      <LoggedPressable
        accessibilityLabel="Criar playlist"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canCreate }}
        disabled={!canCreate}
        onPress={() => void create()}
        style={[styles.primaryButton, !canCreate && styles.primaryButtonDisabled]}
      >
        <Text style={styles.primaryButtonText}>
          {isSaving ? 'Criando...' : 'Criar playlist'}
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
  descriptionInput: {
    minHeight: 82,
    textAlignVertical: 'top',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1ED760',
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#3A3A3A',
  },
  primaryButtonText: {
    color: '#07120A',
    fontFamily: 'SF-Bold',
    fontSize: 14,
  },
});
