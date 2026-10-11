import * as React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { GlassSurface, LoggedPressable } from '../native';
import { AppIcon } from '../native/AppIcon';

export function PlaylistForm({ title, description, onTitleChange, onDescriptionChange, autoFocus = false, disabled = false }: {
  title: string; description: string; onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void; autoFocus?: boolean; disabled?: boolean;
}) {
  const descriptionRef = React.useRef<TextInput>(null);
  return <View style={styles.form}>
    <View style={styles.field}>
      <Text style={styles.label}>Nome</Text>
      <GlassSurface glass="clear" style={styles.inputSurface}>
        <TextInput accessibilityLabel="Nome da playlist" autoFocus={autoFocus} editable={!disabled} maxLength={80}
          placeholder="Minha playlist" placeholderTextColor="#8E8E93" returnKeyType="next"
          onSubmitEditing={() => descriptionRef.current?.focus()} onChangeText={onTitleChange} value={title} style={styles.input} />
      </GlassSurface>
    </View>
    <View style={styles.field}>
      <Text style={styles.label}>Descrição</Text>
      <GlassSurface glass="clear" style={styles.inputSurface}>
        <TextInput ref={descriptionRef} accessibilityLabel="Descrição da playlist" editable={!disabled} maxLength={240}
          placeholder="Opcional" placeholderTextColor="#8E8E93" multiline
          onChangeText={onDescriptionChange} value={description} style={[styles.input, styles.description]} />
      </GlassSurface>
    </View>
  </View>;
}

export function PlaylistSheetAction({ label, onPress, disabled = false, busy = false, icon = 'checkmark' }: {
  label: string; onPress: () => void; disabled?: boolean; busy?: boolean; icon?: 'checkmark' | 'add';
}) {
  return <LoggedPressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled, busy }} disabled={disabled || busy} onPress={onPress}>
    <GlassSurface glass="regular" isInteractive style={[styles.action, (disabled || busy) && styles.disabled]}>
      {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <AppIcon name={icon} size={22} color="#1ED760" />}
    </GlassSurface>
  </LoggedPressable>;
}

const styles = StyleSheet.create({
  form: { gap: 14, paddingBottom: 12 },
  field: { gap: 7 },
  label: { color: 'rgba(255,255,255,0.68)', fontFamily: 'SF-Semibold', fontSize: 12 },
  inputSurface: { borderRadius: 8, overflow: 'hidden' },
  input: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, color: '#FFFFFF', fontFamily: 'SF-Regular', fontSize: 15 },
  description: { minHeight: 80, textAlignVertical: 'top' },
  action: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});
