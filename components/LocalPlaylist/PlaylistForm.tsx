import * as React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { HeaderIconButton, Section, TextField } from '../gym';

export function PlaylistForm({ title, description, onTitleChange, onDescriptionChange, autoFocus = false, disabled = false }: {
  title: string; description: string; onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void; autoFocus?: boolean; disabled?: boolean;
}) {
  const descriptionRef = React.useRef<TextInput>(null);
  return <View style={styles.form}>
    <Section>
        <TextField label="Nome" accessibilityLabel="Nome da playlist" autoFocus={autoFocus} editable={!disabled} maxLength={80}
          placeholder="Minha playlist" placeholderTextColor="#8E8E93" returnKeyType="next"
          onSubmitEditing={() => descriptionRef.current?.focus()} onChangeText={onTitleChange} value={title} style={styles.input} />
        <TextField label="Descrição" inputRef={descriptionRef} accessibilityLabel="Descrição da playlist" editable={!disabled} maxLength={240}
          placeholder="Opcional" placeholderTextColor="#8E8E93" multiline
          onChangeText={onDescriptionChange} value={description} style={[styles.input, styles.description]} />
    </Section>
  </View>;
}

export function PlaylistSheetAction({ label, onPress, disabled = false, busy = false, icon = 'checkmark' }: {
  label: string; onPress: () => void; disabled?: boolean; busy?: boolean; icon?: 'checkmark' | 'add';
}) {
  return <HeaderIconButton label={label} icon={icon === 'add' ? 'plus' : 'check'}
    filled disabled={disabled} busy={busy} onPress={onPress} />;
}

const styles = StyleSheet.create({
  form: { gap: 14, paddingBottom: 12 },
  field: { gap: 7 },
  label: { color: 'rgba(255,255,255,0.68)', fontFamily: 'SF-Semibold', fontSize: 12 },
  inputSurface: { borderRadius: 8, overflow: 'hidden' },
  input: { paddingVertical: 10, fontFamily: 'SF-Regular' },
  description: { minHeight: 80, textAlignVertical: 'top' },
  action: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});
