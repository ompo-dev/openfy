import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Modal, StyleSheet, Text } from 'react-native';
import { SheetFrame } from '../SheetFrame';
import { PlayerModal } from '../PlayerModal';

describe('shared player modal surface', () => {
  it('uses the player page-sheet presentation and closes with the supplied action', async () => {
    const onClose = jest.fn();
    const screen = await render(<SheetFrame visible title="Artistas" onClose={onClose}><Text>Contents</Text></SheetFrame>);
    const modal = PlayerModal({ visible: true, children: null });
    expect(modal.type).toBe(Modal);
    expect(modal.props.presentationStyle).toBe('pageSheet');
    expect(modal.props.animationType).toBe('slide');
    expect(modal.props.transparent).not.toBe(true);
    expect(screen.getByTestId('player-modal-surface')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Fechar'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps a close action when the caller supplies a leading and trailing tool', async () => {
    const screen = await render(<SheetFrame visible title="Downloads" onClose={jest.fn()}
      headerLeading={<Text>Back</Text>} headerTrailing={<Text>Copy</Text>}><Text>Contents</Text></SheetFrame>);
    expect(screen.getByLabelText('Fechar')).toBeTruthy();
    expect(screen.getByText('Back')).toBeTruthy();
    expect(screen.getByText('Copy')).toBeTruthy();
  });

  it('lets fixed lists and the JSON editor fill the available keyboard-safe height', async () => {
    const screen = await render(<SheetFrame visible title="JSON" onClose={jest.fn()} scroll={false}>
      <Text>Editor</Text>
    </SheetFrame>);
    const keyboardStyle = StyleSheet.flatten(screen.getByTestId('sheet-frame-body').props.style);
    expect(keyboardStyle.flex).toBe(1);
    expect(keyboardStyle.minHeight).toBe(0);
    expect(keyboardStyle.paddingBottom).toBeGreaterThanOrEqual(16);
  });
});
