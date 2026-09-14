import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Animated, Platform, StyleSheet } from 'react-native';
import { usePlayer } from '@context';
import { MiniPlayer } from '../MiniPlayer';

jest.mock('@context', () => ({ usePlayer: jest.fn() }));
jest.mock('../../native', () => ({ LoggedPressable: require('react-native').Pressable }));
jest.mock('../MiniPlayerSurface', () => ({ MiniPlayerSurface: require('react-native').View }));
jest.mock('../../common/MarqueeText', () => ({ MarqueeText: ({ text }: { text: string }) => {
  const { Text } = require('react-native');
  return <Text>{text}</Text>;
} }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: {},
  NotificationFeedbackType: {},
}));

describe('MiniPlayer', () => {
  const originalPlatform = Platform.OS;
  const togglePlayPause = jest.fn();
  beforeEach(() => {
    Platform.OS = 'ios';
    jest.spyOn(Animated, 'spring').mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
    jest.mocked(usePlayer).mockReturnValue({
      currentTrack: { spotifyId: 'track', title: 'Taros', artistName: 'Pedro Qualy, Sotam', imageURL: '' },
      isPlayerVisible: true, playerState: { isPlaying: false, positionMs: 134892.5, durationMs: 269785 },
      togglePlayPause,
    } as any);
  });
  afterEach(() => { Platform.OS = originalPlatform; jest.restoreAllMocks(); });

  it('never mounts the native material under zero opacity', async () => {
    const screen = await render(<MiniPlayer />);
    expect(StyleSheet.flatten(screen.root!.props.style).opacity).toBe(1);
    expect(screen.getByText('Taros')).toBeTruthy();
  });

  it('keeps pause and opening the player as separate actions', async () => {
    const onPress = jest.fn();
    const screen = await render(<MiniPlayer onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('Tocar'));
    expect(togglePlayPause).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Abrir Player de Música'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps the player materially more compact', async () => {
    const screen = await render(<MiniPlayer />);
    expect(StyleSheet.flatten(screen.getByTestId('mini-player-surface').props.style)).toMatchObject({
      borderRadius: 26,
      height: 52,
    });
    expect(StyleSheet.flatten(screen.getByTestId('mini-player-content').props.style)).toMatchObject({
      height: 49,
      paddingHorizontal: 10,
    });
    expect(StyleSheet.flatten(screen.getByTestId('mini-player-cover').props.style)).toMatchObject({
      width: 36,
      height: 36,
      borderRadius: 18,
    });
  });

  it('keeps touch targets at 44pt without inflating the visual controls', async () => {
    const screen = await render(<MiniPlayer onConfirm={jest.fn()} />);
    expect(StyleSheet.flatten(screen.getByLabelText('Tocar').props.style)).toMatchObject({
      width: 44,
      height: 44,
    });
    expect(StyleSheet.flatten(screen.getByLabelText('Confirmar música').props.style)).toMatchObject({
      width: 44,
      height: 44,
    });
  });

  it('clips progress with a full capsule layer pinned to the bottom edge', async () => {
    const screen = await render(<MiniPlayer />);
    expect(StyleSheet.flatten(screen.getByTestId('mini-player-progress-clip').props.style)).toMatchObject({
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      borderRadius: 26,
      overflow: 'hidden',
    });
    expect(screen.getByTestId('mini-player-progress-clip').props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(screen.getByTestId('mini-player-progress').props.style)).toMatchObject({
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 3,
    });
    expect(StyleSheet.flatten(screen.getByTestId('mini-player-progress-fill').props.style).width).toBe('50%');
  });
});
