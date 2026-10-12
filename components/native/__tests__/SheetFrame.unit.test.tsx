import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Dimensions, PanResponder, StyleSheet, Text } from 'react-native';
import * as Motion from 'react-native-reanimated';
import { SheetFrame } from '../SheetFrame';
import { PlayerModal, shouldDismissSheet } from '../PlayerModal';
import { ProgressiveFlatList } from '../../common/ProgressiveList';

describe('shared player modal surface', () => {
  it('fits progressive lists and forwards their scroll position to drag dismissal', async () => {
    const screen = await render(<SheetFrame visible title="Músicas" onClose={jest.fn()} scroll={false} contentHeight={200}>
      <ProgressiveFlatList testID="progressive-scroll" data={['Song']} keyExtractor={(item) => item}
        renderItem={({ item }) => <Text>{item}</Text>} />
    </SheetFrame>);
    const list = screen.getByTestId('progressive-scroll');
    expect(StyleSheet.flatten(list.props.style)).toMatchObject({ flexGrow: 1, flexShrink: 1, minHeight: 0 });
  });
  afterEach(() => jest.restoreAllMocks());
  it('fits short content in a transparent sheet and closes with the supplied action', async () => {
    const onClose = jest.fn();
    const screen = await render(<SheetFrame visible size="sheet" title="Artistas" onClose={onClose}><Text>Contents</Text></SheetFrame>);
    const modal = screen.getByTestId('gym-sheet-modal');
    expect(modal.props.animationType).toBe('slide');
    expect(modal.props.transparent).toBe(true);
    const surface = StyleSheet.flatten(screen.getByTestId('gym-sheet-surface').props.style);
    expect(surface.flex).toBeUndefined();
    expect(surface.maxHeight).toBe('88%');
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

  it('separates the two header actions around the title and balances their reserved width', async () => {
    const screen = await render(<SheetFrame visible title="Provedor" onClose={jest.fn()}
      headerTrailing={<Text>Refresh</Text>}><Text>Contents</Text></SheetFrame>);
    const leading = screen.getByTestId('sheet-header-leading');
    const trailing = screen.getByTestId('sheet-header-trailing');
    expect(within(leading).getByLabelText('Fechar')).toBeTruthy();
    expect(within(trailing).getByText('Refresh')).toBeTruthy();
    expect(within(trailing).queryByLabelText('Fechar')).toBeNull();
    expect(StyleSheet.flatten(leading.props.style).width).toBe(StyleSheet.flatten(trailing.props.style).width);
  });

  it('lets editors request space but shrink to the available keyboard-safe height', async () => {
    const screen = await render(<SheetFrame visible title="JSON" onClose={jest.fn()} scroll={false} contentHeight={640}>
      <Text>Editor</Text>
    </SheetFrame>);
    const content = StyleSheet.flatten(screen.getByTestId('sheet-frame-content').props.style);
    expect(content.height).toBeLessThanOrEqual(640);
    expect(content.height).toBeLessThan(Dimensions.get('window').height * 0.88);
    expect(content.flexShrink).toBe(1);
  });

  it('uses the shared Gym modal for the player with header-only dismissal', async () => {
    const onClose = jest.fn();
    const screen = await render(<PlayerModal visible fullScreen onRequestClose={onClose}><Text>Player</Text></PlayerModal>);
    expect(screen.getByTestId('player-modal').props.presentationStyle).toBe('overFullScreen');
    expect(screen.getByTestId('player-modal').props.transparent).toBe(true);
    expect(StyleSheet.flatten(screen.getByTestId('player-modal-surface').props.style).flex).toBe(1);
    expect(screen.getByTestId('player-modal').props.allowSwipeDismissal).toBe(false);
  });

  it('defaults queue, imports and settings to the main Gym page presentation', async () => {
    const screen = await render(<SheetFrame visible title="Fila" onClose={jest.fn()}><Text>Contents</Text></SheetFrame>);
    const modal = screen.getByTestId('gym-sheet-modal');
    expect(modal.props.presentationStyle).toBe('pageSheet');
    expect(modal.props.transparent).toBe(false);
    expect(screen.getByTestId('gym-sheet-scroll')).toBeTruthy();
  });

  it('gives custom scrolling content the same side margins and bottom clearance as regular sheets', async () => {
    const screen = await render(<SheetFrame visible scroll={false} title="Letras" onClose={jest.fn()}>
      <Text>Settings</Text>
    </SheetFrame>);
    const style = StyleSheet.flatten(screen.getByTestId('gym-sheet-custom-content').props.style);
    expect(style.paddingHorizontal).toBe(16);
    expect(style.paddingTop).toBeGreaterThanOrEqual(16);
    expect(style.paddingBottom).toBeGreaterThanOrEqual(16);
    expect(style.flex).toBe(1);
  });

  it('lets the shared artwork flight own player presentation and dismissal without another slide', async () => {
    const onClose = jest.fn();
    const screen = await render(<PlayerModal visible fullScreen sharedArtworkTransition onRequestClose={onClose}>
      <Text>Player</Text>
    </PlayerModal>);
    const modal = screen.getByTestId('player-modal');
    expect(modal.props.animationType).toBe('none');
    expect(modal.props.presentationStyle).toBe('overFullScreen');
    expect(modal.props.transparent).toBe(true);
    expect(modal.props.allowSwipeDismissal).not.toBe(true);
    expect(StyleSheet.flatten(screen.getByTestId('player-modal-surface').props.style).flex).toBe(1);
    await fireEvent(modal, 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves the sheet and backdrop with the cover clock while its artwork layer stays stationary', async () => {
    const progress = { value: 0 } as Motion.SharedValue<number>;
    const view = () => <PlayerModal visible fullScreen sharedArtworkTransition closing
      artworkFlightProgress={progress} artworkOverlay={<Text>Flying cover</Text>}>
      <Text>Player</Text>
    </PlayerModal>;
    const screen = await render(view());
    expect(StyleSheet.flatten(screen.getByTestId('player-modal-surface').props.style).transform).toEqual([{ translateY: 0 }]);
    progress.value = 0.5;
    await screen.rerender(view());
    expect(StyleSheet.flatten(screen.getByTestId('player-modal-surface').props.style).transform)
      .toEqual([{ translateY: Dimensions.get('window').height / 2 }]);
    expect(StyleSheet.flatten(screen.getByTestId('player-modal-backdrop').props.style).opacity).toBe(0.5);
    const artwork = StyleSheet.flatten(screen.getByTestId('player-modal-artwork-layer').props.style);
    expect(artwork.position).toBe('absolute');
    expect(artwork.transform).toBeUndefined();
    expect(screen.getByText('Flying cover')).toBeTruthy();
    progress.value = 1;
    await screen.rerender(view());
    expect(StyleSheet.flatten(screen.getByTestId('player-modal-surface').props.style).transform)
      .toEqual([{ translateY: Dimensions.get('window').height }]);
    expect(StyleSheet.flatten(screen.getByTestId('player-modal-backdrop').props.style).opacity).toBe(0);
  });

  it('follows a downward drag, restores short drags and continues dismissal from the released position', async () => {
    const create = jest.spyOn(PanResponder, 'create');
    const spring = jest.spyOn(Motion, 'withSpring');
    const onClose = jest.fn();
    const progress = { value: 0 } as Motion.SharedValue<number>;
    const offset = { current: 0 };
    let closing = false;
    const view = () => <PlayerModal visible fullScreen sharedArtworkTransition closing={closing}
      artworkFlightProgress={progress} onRequestClose={onClose} scrollOffset={offset}>
      <Text>Player</Text>
    </PlayerModal>;
    const screen = await render(view());
    const pan = create.mock.calls.find(([config]) => config.onPanResponderGrant)![0];
    const event = {} as any;
    const gesture = { y0: 50, dy: 40, dx: 0, vy: 0 } as any;
    expect(pan.onMoveShouldSetPanResponderCapture!(event, { ...gesture, y0: 300, dy: 160, vy: 2 })).toBe(false);
    expect(pan.onMoveShouldSetPanResponderCapture!(event, gesture)).toBe(true);
    await act(() => {
      pan.onPanResponderGrant!(event, gesture);
      pan.onPanResponderMove!(event, gesture);
    });
    await screen.rerender(view());
    expect(StyleSheet.flatten(screen.getByTestId('player-modal-surface').props.style).transform).toEqual([{ translateY: 40 }]);
    await act(() => pan.onPanResponderRelease!(event, gesture));
    await screen.rerender(view());
    expect(spring).toHaveBeenCalledWith(0, { damping: 24, stiffness: 260 });
    expect(onClose).not.toHaveBeenCalled();
    expect(StyleSheet.flatten(screen.getByTestId('player-modal-surface').props.style).transform).toEqual([{ translateY: 0 }]);

    const dismiss = { ...gesture, dy: 120 };
    await act(() => {
      pan.onPanResponderGrant!(event, dismiss);
      pan.onPanResponderMove!(event, dismiss);
      pan.onPanResponderRelease!(event, dismiss);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    closing = true;
    progress.value = 0.5;
    await screen.rerender(view());
    expect(StyleSheet.flatten(screen.getByTestId('player-modal-surface').props.style).transform)
      .toEqual([{ translateY: 120 + (Dimensions.get('window').height - 120) / 2 }]);
    expect(StyleSheet.flatten(screen.getByTestId('player-modal-backdrop').props.style).opacity)
      .toBeCloseTo((1 - 120 / Dimensions.get('window').height) / 2);
  });

  it('keeps the descending sheet behind the cover until both reach the actual mini artwork', async () => {
    const progress = { value: 0.5 } as Motion.SharedValue<number>;
    const view = () => <PlayerModal visible fullScreen sharedArtworkTransition closing
      artworkFlightProgress={progress} artworkDestinationY={600}><Text>Player</Text></PlayerModal>;
    const screen = await render(view());
    let style = StyleSheet.flatten(screen.getByTestId('player-modal-surface').props.style);
    expect(style.transform).toEqual([{ translateY: 300 }]);
    expect(style.opacity).toBe(1);
    progress.value = 0.9;
    await screen.rerender(view());
    style = StyleSheet.flatten(screen.getByTestId('player-modal-surface').props.style);
    expect(style.transform).toEqual([{ translateY: 540 }]);
    expect(style.opacity).toBeCloseTo(0.5);
    progress.value = 1;
    await screen.rerender(view());
    style = StyleSheet.flatten(screen.getByTestId('player-modal-surface').props.style);
    expect(style.transform).toEqual([{ translateY: 600 }]);
    expect(style.opacity).toBe(0);
  });

  it('keeps header dismissal available without taking over lyric scrolling or horizontal artwork swipes', async () => {
    const create = jest.spyOn(PanResponder, 'create');
    const offset = { current: 80 };
    const screen = await render(<PlayerModal visible fullScreen sharedArtworkTransition scrollOffset={offset}>
      <Text>Player</Text>
    </PlayerModal>);
    const pan = create.mock.calls.find(([config]) => config.onPanResponderGrant)![0];
    const event = {} as any;
    const down = { y0: 50, dy: 30, dx: 0, vy: 0 } as any;
    expect(pan.onMoveShouldSetPanResponderCapture!(event, down)).toBe(true);
    expect(pan.onMoveShouldSetPanResponderCapture!(event, { ...down, y0: 300 })).toBe(false);
    expect(pan.onMoveShouldSetPanResponderCapture!(event, { ...down, dx: 50 })).toBe(false);
    expect(pan.onMoveShouldSetPanResponderCapture!(event, { ...down, dy: -30 })).toBe(false);
    await screen.rerender(<PlayerModal visible fullScreen sharedArtworkTransition dismissEnabled={false}>
      <Text>Player</Text>
    </PlayerModal>);
    expect(pan.onMoveShouldSetPanResponderCapture!(event, down)).toBe(false);
  });

  it('dismisses deliberate downward drags but not taps, short drags or upward scrolling', () => {
    expect(shouldDismissSheet(100, 0)).toBe(true);
    expect(shouldDismissSheet(30, 0.8)).toBe(true);
    expect(shouldDismissSheet(10, 1)).toBe(false);
    expect(shouldDismissSheet(-120, -1)).toBe(false);
  });

  it('dismisses a fitted sheet by tapping outside it', async () => {
    const onClose = jest.fn();
    const screen = await render(<SheetFrame visible size="sheet" title="Test" onClose={onClose}><Text>Contents</Text></SheetFrame>);
    await fireEvent.press(screen.getByTestId('gym-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
