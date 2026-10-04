import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SheetFrame } from '../SheetFrame';
import { PlayerModal } from '../PlayerModal';

describe('shared player modal surface', () => {
  it('fits short content in a transparent sheet and closes with the supplied action', async () => {
    const onClose = jest.fn();
    const screen = await render(<SheetFrame visible title="Artistas" onClose={onClose}><Text>Contents</Text></SheetFrame>);
    const modal = screen.getByTestId('player-modal');
    expect(modal.props.presentationStyle).toBe('overFullScreen');
    expect(modal.props.animationType).toBe('slide');
    expect(modal.props.transparent).toBe(true);
    const surface = StyleSheet.flatten(screen.getByTestId('player-modal-surface').props.style);
    expect(surface.flex).toBeUndefined();
    expect(surface.maxHeight).toBe('100%');
    expect(StyleSheet.flatten(screen.getByTestId('sheet-frame-body').props.style).flex).toBeUndefined();
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

  it('lets editors request space but shrink to the available keyboard-safe height', async () => {
    const screen = await render(<SheetFrame visible title="JSON" onClose={jest.fn()} scroll={false} contentHeight={640}>
      <Text>Editor</Text>
    </SheetFrame>);
    const keyboardStyle = StyleSheet.flatten(screen.getByTestId('sheet-frame-body').props.style);
    expect(keyboardStyle.flexShrink).toBe(1);
    expect(keyboardStyle.minHeight).toBe(0);
    expect(keyboardStyle.paddingBottom).toBeGreaterThanOrEqual(16);
    const content = StyleSheet.flatten(screen.getByTestId('sheet-frame-content').props.style);
    expect(content.height).toBe(640);
    expect(content.flexShrink).toBe(1);
  });

  it('keeps the music player in a full native page sheet', async () => {
    const screen = await render(<PlayerModal visible fullScreen><Text>Player</Text></PlayerModal>);
    expect(screen.getByTestId('player-modal').props.presentationStyle).toBe('pageSheet');
    expect(screen.getByTestId('player-modal').props.transparent).not.toBe(true);
    expect(StyleSheet.flatten(screen.getByTestId('player-modal-surface').props.style).flex).toBe(1);
  });

  it('dismisses a fitted sheet by tapping outside it', async () => {
    const onClose = jest.fn();
    const screen = await render(<SheetFrame visible title="Test" onClose={onClose}><Text>Contents</Text></SheetFrame>);
    await fireEvent.press(screen.getByTestId('player-modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
