import React from 'react';
import { Modal, StyleSheet, View, type ModalProps } from 'react-native';

type PlayerModalProps = Omit<ModalProps, 'animationType' | 'presentationStyle' | 'transparent'>;

/** One native page-sheet surface for the player and the app's content modals. */
export function PlayerModal({ children, ...props }: PlayerModalProps) {
  return (
    <Modal {...props} animationType="slide" presentationStyle="pageSheet">
      <View testID="player-modal-surface" style={styles.surface}>
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  surface: { flex: 1, minHeight: 0, backgroundColor: '#101116', overflow: 'hidden' },
});
