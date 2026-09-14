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
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn().mockResolvedValue(undefined), ImpactFeedbackStyle: {} }));

describe('MiniPlayer', () => {
  const originalPlatform = Platform.OS;
  const togglePlayPause = jest.fn();
  beforeEach(() => {
    Platform.OS = 'ios';
    jest.spyOn(Animated, 'spring').mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
    jest.mocked(usePlayer).mockReturnValue({
      currentTrack: { spotifyId: 'track', title: 'Taros', artistName: 'Pedro Qualy, Sotam', imageURL: '' },
      isPlayerVisible: true, playerState: { isPlaying: false, positionMs: 0, durationMs: 269785 },
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
});
