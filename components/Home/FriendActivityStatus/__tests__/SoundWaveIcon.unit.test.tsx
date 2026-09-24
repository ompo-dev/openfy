import * as React from 'react';
import { act, render } from '@testing-library/react-native';
import { Animated, AppState, Platform, StyleSheet } from 'react-native';

import { SoundWaveIcon } from '../NoteBubble';

describe('SoundWaveIcon', () => {
  const originalPlatform = Platform.OS;
  const originalAppState = Object.getOwnPropertyDescriptor(
    AppState,
    'currentState'
  );

  beforeEach(() => {
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
    if (originalAppState) {
      Object.defineProperty(AppState, 'currentState', originalAppState);
    }
    jest.restoreAllMocks();
  });

  it('animates fixed-height bars with the native transform driver', async () => {
    Platform.OS = 'ios';
    const start = jest.fn();
    const stop = jest.fn();
    jest
      .spyOn(Animated, 'loop')
      .mockReturnValue({ start, stop, reset: jest.fn() } as any);
    const timing = jest.spyOn(Animated, 'timing');

    const screen = await render(<SoundWaveIcon color="#1ED760" size={15} />);
    await act(async () => {});

    expect(start).toHaveBeenCalledTimes(1);
    expect(timing).toHaveBeenCalledTimes(6);
    timing.mock.calls.forEach(([, config]) => {
      expect(config).toEqual(
        expect.objectContaining({ useNativeDriver: true })
      );
      expect(Number(config.toValue)).toBeLessThanOrEqual(1);
    });

    const barStyle = StyleSheet.flatten(
      screen.getByTestId('sound-wave-bar-1').props.style
    );
    expect(barStyle.height).toBe(15);
    expect(barStyle.transform?.[0]).toHaveProperty('scaleY');

    await screen.rerender(
      <SoundWaveIcon active={false} color="#1ED760" size={15} />
    );
    expect(stop).toHaveBeenCalledTimes(1);
    await act(async () => {
      screen.unmount();
    });
  });

  it('stops the visual loop as soon as the app enters background', async () => {
    Platform.OS = 'ios';
    let appStateListener: ((state: string) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove } as any;
    });
    const start = jest.fn();
    const stop = jest.fn();
    jest
      .spyOn(Animated, 'loop')
      .mockReturnValue({ start, stop, reset: jest.fn() } as any);

    const screen = await render(<SoundWaveIcon color="#FFFFFF" />);
    await act(async () => {});
    expect(start).toHaveBeenCalledTimes(1);

    await act(async () => {
      appStateListener?.('background');
    });

    expect(stop).toHaveBeenCalledTimes(1);
    await act(async () => {
      screen.unmount();
    });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('does not start a visual loop when mounted in background', async () => {
    Platform.OS = 'ios';
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'background',
    });
    const start = jest.fn();
    const stop = jest.fn();
    jest
      .spyOn(Animated, 'loop')
      .mockReturnValue({ start, stop, reset: jest.fn() } as any);

    const screen = await render(<SoundWaveIcon color="#FFFFFF" />);
    await act(async () => {});

    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    await act(async () => {
      screen.unmount();
    });
  });
});
