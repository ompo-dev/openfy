import * as React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SkeletonImage } from '../SkeletonImage';

jest.mock('expo-image', () => ({ Image: jest.requireActual('react-native').Image }));

describe('SkeletonImage', () => {
  it('does not cover a loaded cached image again when its source object is recreated', async () => {
    const screen = await render(<SkeletonImage testID="cover" source={{ uri: 'cover.jpg' }} />);
    const overlays = () => screen.toJSON()?.children?.filter((child) =>
      child && typeof child === 'object' && child.props.pointerEvents === 'none') || [];
    expect(overlays()).toHaveLength(1);
    await fireEvent(screen.getByTestId('cover'), 'load', {});
    expect(overlays()).toHaveLength(0);
    await screen.rerender(<SkeletonImage testID="cover" source={{ uri: 'cover.jpg' }} />);
    expect(overlays()).toHaveLength(0);
  });

  it('ignores late image events from the previous track', async () => {
    const screen = await render(<SkeletonImage testID="cover" source={{ uri: 'old.jpg' }} />);
    const oldLoad = screen.getByTestId('cover').props.onLoad;
    await screen.rerender(<SkeletonImage testID="cover" source={{ uri: 'current.jpg' }} />);
    await fireEvent(screen.getByTestId('cover'), 'load', {});
    await act(() => oldLoad({}));
    expect(screen.toJSON()?.children?.filter((child) =>
      child && typeof child === 'object' && child.props.pointerEvents === 'none') || []).toHaveLength(0);
  });
});
