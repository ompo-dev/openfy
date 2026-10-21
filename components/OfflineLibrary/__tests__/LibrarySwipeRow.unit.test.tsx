import * as React from 'react';
import { Text, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { LibrarySwipeRow } from '../LibrarySwipeRow';

const mockClose = jest.fn();
let mockSwipeProps: any;
const mockTranslation = { value: -80 };
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return React.forwardRef((props: any, ref) => {
    mockSwipeProps = props;
    React.useImperativeHandle(ref, () => ({ close: mockClose }));
    return <View>{props.children}{props.renderRightActions({ value: 1 }, mockTranslation)}</View>;
  });
});
jest.mock('../../native', () => {
  const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return { LoggedPressable: Pressable, AppIcon: () => null };
});

it('moves a compact removal action with the swipe and closes before removing', async () => {
  const remove = jest.fn();
  const open = jest.fn();
  const view = await render(<LibrarySwipeRow label="Remover download" onRemove={remove} onWillOpen={open}>
    <Text>Song and download icon</Text>
  </LibrarySwipeRow>);
  expect(mockSwipeProps).toMatchObject({ friction: 1, overshootRight: false, rightThreshold: 32 });
  expect(StyleSheet.flatten(mockSwipeProps.childrenContainerStyle).backgroundColor).toBe('#121212');
  expect(StyleSheet.flatten(view.getByTestId('library-remove-action').props.style)).toMatchObject({ width: 80, transform: [{ translateX: 0 }] });
  mockSwipeProps.onSwipeableWillOpen();
  expect(open).toHaveBeenCalledWith(expect.any(Function));
  expect(remove).not.toHaveBeenCalled();
  await fireEvent.press(view.getByLabelText('Remover download'));
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(mockClose.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
  mockTranslation.value = 0;
  await view.rerender(<LibrarySwipeRow label="Remover download" onRemove={remove} onWillOpen={open}><Text>Song</Text></LibrarySwipeRow>);
  expect(StyleSheet.flatten(view.getByTestId('library-remove-action').props.style).transform).toEqual([{ translateX: 80 }]);
});
