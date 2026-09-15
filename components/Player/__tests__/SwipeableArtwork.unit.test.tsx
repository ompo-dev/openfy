import * as React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Gesture } from 'react-native-gesture-handler';
import { SwipeableArtwork } from '../SwipeableArtwork';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const mockTimingCallbacks: ((finished?: boolean) => void)[] = [];

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const chain = () => {
    const gesture: Record<string, unknown> = {};
    const link = (name: string) => (value?: unknown) => {
      gesture[name] = value;
      return gesture;
    };

    Object.assign(gesture, {
      activeOffsetX: link('activeOffsetXValue'),
      enabled: link('enabledValue'),
      failOffsetY: link('failOffsetYValue'),
      onBegin: link('onBeginValue'),
      onEnd: link('onEndValue'),
      onFinalize: link('onFinalizeValue'),
      onUpdate: link('onUpdateValue'),
    });

    return gesture;
  };

  return {
    Gesture: { Pan: jest.fn(chain) },
    GestureDetector: ({ children }: React.PropsWithChildren) => children,
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const AnimatedView = React.forwardRef(function AnimatedView(
    props: unknown,
    ref: unknown
  ) {
    return React.createElement(View, { ...(props as object), ref });
  });

  return {
    __esModule: true,
    default: { View: AnimatedView },
    cancelAnimation: jest.fn(),
    runOnJS: (callback: unknown) => callback,
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (
      value: unknown,
      _config?: unknown,
      callback?: (finished?: boolean) => void
    ) => {
      if (callback) mockTimingCallbacks.push(callback);
      return value;
    },
  };
});

describe('SwipeableArtwork', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTimingCallbacks.length = 0;
  });

  it('renders previous, current, and next artwork from parent-provided queue order', async () => {
    const screen = await render(
      <SwipeableArtwork
        trackKey="track-current"
        artworkUri="file:///current.jpg"
        previousArtworkUri="file:///previous.jpg"
        nextArtworkUri="file:///next.jpg"
        size={280}
        canGoPrevious
        canGoNext
        onPrevious={jest.fn()}
        onNext={jest.fn()}
      />
    );

    expect(
      screen.getByTestId('swipeable-artwork-previous').props.source.uri
    ).toBe('file:///previous.jpg');
    expect(
      screen.getByTestId('swipeable-artwork-current').props.source.uri
    ).toBe('file:///current.jpg');
    expect(screen.getByTestId('swipeable-artwork-next').props.source.uri).toBe(
      'file:///next.jpg'
    );
  });

  it('falls back when the current artwork fails to load', async () => {
    const fallbackSource = { uri: 'file:///fallback.jpg' };
    const screen = await render(
      <SwipeableArtwork
        trackKey="track-broken"
        artworkUri="file:///broken.jpg"
        size={240}
        canGoPrevious={false}
        canGoNext={false}
        fallbackSource={fallbackSource}
        onPrevious={jest.fn()}
        onNext={jest.fn()}
      />
    );

    await act(async () => {
      fireEvent(screen.getByTestId('swipeable-artwork-current'), 'error', {
        nativeEvent: { error: 'missing' },
      });
    });

    expect(screen.getByTestId('swipeable-artwork-current').props.source).toBe(
      fallbackSource
    );
  });

  it('does not render edge preview artwork when movement in that direction is unavailable', async () => {
    const fallbackSource = { uri: 'file:///fallback.jpg' };
    const previousFallbackSource = { uri: 'file:///previous-fallback.jpg' };
    const nextFallbackSource = { uri: 'file:///next-fallback.jpg' };
    const screen = await render(
      <SwipeableArtwork
        trackKey="track-current"
        artworkUri="file:///current.jpg"
        previousArtworkUri="file:///previous.jpg"
        nextArtworkUri="file:///next.jpg"
        size={240}
        canGoPrevious={false}
        canGoNext={false}
        fallbackSource={fallbackSource}
        previousFallbackSource={previousFallbackSource}
        nextFallbackSource={nextFallbackSource}
        onPrevious={jest.fn()}
        onNext={jest.fn()}
      />
    );

    expect(
      screen.getByTestId('swipeable-artwork-previous').props.source
    ).toBeUndefined();
    expect(
      screen.getByTestId('swipeable-artwork-next').props.source
    ).toBeUndefined();
  });

  it('shows a loading overlay while the parent is resolving track navigation', async () => {
    const screen = await render(
      <SwipeableArtwork
        trackKey="track-current"
        artworkUri="file:///current.jpg"
        size={240}
        canGoPrevious={false}
        canGoNext
        loading
        onPrevious={jest.fn()}
        onNext={jest.fn()}
      />
    );

    expect(screen.getByTestId('swipeable-artwork-loading')).toBeTruthy();
  });

  it('waits for the slide animation and fires one callback while async navigation is pending', async () => {
    let resolveNavigation!: () => void;
    const onNext = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveNavigation = resolve;
        })
    );
    const onPrevious = jest.fn();

    await render(
      <SwipeableArtwork
        trackKey="track-current"
        artworkUri="file:///current.jpg"
        nextArtworkUri="file:///next.jpg"
        size={240}
        canGoPrevious={false}
        canGoNext
        onPrevious={onPrevious}
        onNext={onNext}
      />
    );

    const pan = (Gesture.Pan as jest.Mock).mock.results[0].value as {
      onEndValue: (event: {
        translationX: number;
        translationY: number;
        velocityX: number;
        velocityY: number;
      }) => void;
    };

    pan.onEndValue({
      translationX: -90,
      translationY: 0,
      velocityX: -80,
      velocityY: 0,
    });
    pan.onEndValue({
      translationX: -90,
      translationY: 0,
      velocityX: -80,
      velocityY: 0,
    });

    expect(onNext).not.toHaveBeenCalled();
    expect(mockTimingCallbacks).toHaveLength(1);

    await act(async () => {
      mockTimingCallbacks.shift()?.(true);
    });

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrevious).not.toHaveBeenCalled();

    resolveNavigation();
    await act(async () => {
      await Promise.resolve();
    });

    pan.onEndValue({
      translationX: -90,
      translationY: 0,
      velocityX: -80,
      velocityY: 0,
    });

    await act(async () => {
      mockTimingCallbacks.shift()?.(true);
    });

    expect(onNext).toHaveBeenCalledTimes(2);
  });

  it('does not run navigation when the slide animation is cancelled', async () => {
    const onNext = jest.fn();

    await render(
      <SwipeableArtwork
        trackKey="track-current"
        artworkUri="file:///current.jpg"
        nextArtworkUri="file:///next.jpg"
        size={240}
        canGoPrevious={false}
        canGoNext
        onPrevious={jest.fn()}
        onNext={onNext}
      />
    );

    const pan = (Gesture.Pan as jest.Mock).mock.results[0].value as {
      onEndValue: (event: {
        translationX: number;
        translationY: number;
        velocityX: number;
        velocityY: number;
      }) => void;
    };

    pan.onEndValue({
      translationX: -90,
      translationY: 0,
      velocityX: -80,
      velocityY: 0,
    });

    await act(async () => {
      mockTimingCallbacks.shift()?.(false);
    });

    expect(onNext).not.toHaveBeenCalled();
  });
});
