import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Animated, Platform, StyleSheet, Text } from 'react-native';
import { MarqueeText } from '../MarqueeText';

jest.mock('@react-native-masked-view/masked-view', () => {
  return require('react-native').View;
});

const layout = (width: number) => ({
  nativeEvent: { layout: { width, height: 24, x: 0, y: 0 } },
});

describe('MarqueeText', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Platform.OS = originalPlatform;
    jest.restoreAllMocks();
  });

  it('renders inline clickable children while measuring only the plain text', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <MarqueeText testID="marquee" text="First Artist, Second Artist">
        <Text onPress={onPress} accessibilityRole="link">First Artist</Text>
        {', '}
        <Text>Second Artist</Text>
      </MarqueeText>
    );
    const measurement = screen.getByTestId('marquee-measure-text', { includeHiddenElements: true });
    expect(measurement.props.children).toBe('First Artist, Second Artist');
    expect(measurement.parent?.props.accessibilityElementsHidden).toBe(true);
    expect(screen.getByTestId('marquee-text').props.numberOfLines).toBe(1);
    expect(screen.getByText('Second Artist')).toBeTruthy();
    await fireEvent.press(screen.getByText('First Artist'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('preserves plain-text callers', async () => {
    const screen = await render(<MarqueeText text="A song" />);
    expect(screen.getByText('A song')).toBeTruthy();
  });

  it.each(['android', 'web'] as const)('keeps overflowing centered text full-width and left-anchored on %s', async (platform) => {
    Platform.OS = platform;
    const start = jest.fn();
    const stop = jest.fn();
    jest.spyOn(Animated, 'loop').mockReturnValue({ start, stop, reset: jest.fn() });
    const screen = await render(
      <MarqueeText testID="marquee" text="First Artist, Second Artist" align="center">
        <Text>First Artist, Second Artist</Text>
      </MarqueeText>
    );
    const container = screen.getByTestId('marquee');
    const measurement = screen.getByTestId('marquee-measure-text', { includeHiddenElements: true });
    await fireEvent(container, 'layout', layout(160));
    await fireEvent(measurement, 'layout', layout(360));
    const animated = screen.getByTestId('marquee-content');
    expect(StyleSheet.flatten(animated.props.style)).toMatchObject({
      width: 360,
      alignSelf: 'flex-start',
      justifyContent: 'flex-start',
    });
    expect(start).toHaveBeenCalled();
    await screen.rerender(<MarqueeText text="Another equally long artist" align="center" />);
    expect(stop).toHaveBeenCalled();
  });
});
