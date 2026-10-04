import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, type ModalProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type PlayerModalProps = Omit<ModalProps, 'animationType' | 'presentationStyle' | 'transparent'> & {
  fullScreen?: boolean;
};

/** Content sheets hug their contents; only the music player owns a full page sheet. */
export function PlayerModal({ children, fullScreen = false, ...props }: PlayerModalProps) {
  const insets = useSafeAreaInsets();
  if (!fullScreen) {
    return (
      <Modal {...props} testID="player-modal" animationType="slide" transparent presentationStyle="overFullScreen">
        <KeyboardAvoidingView testID="player-modal-layout" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.layout, { paddingTop: insets.top + 12 }]}>
          <Pressable testID="player-modal-backdrop" style={styles.backdrop} onPress={props.onRequestClose} />
          <View testID="player-modal-surface" style={[styles.surface, styles.fittedSurface]}>
            {children}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }
  return (
    <Modal {...props} testID="player-modal" animationType="slide" presentationStyle="pageSheet">
      <View testID="player-modal-surface" style={[styles.surface, styles.fullSurface]}>
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, justifyContent: 'flex-end', minHeight: 0 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)' },
  surface: { minHeight: 0, backgroundColor: '#101116', overflow: 'hidden', width: '100%' },
  fittedSurface: { flexShrink: 1, maxHeight: '100%', borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  fullSurface: { flex: 1 },
});
