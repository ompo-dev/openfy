import * as React from 'react';
import { Gesture } from 'react-native-gesture-handler';

type LyricScrubOptions = {
  enabled: boolean;
  onStart: () => void;
  onDrag: (translationY: number) => void;
  onEnd: () => void;
  onPress?: () => void;
  scrollGesture?: ReturnType<typeof Gesture.Native>;
};

// Share the Feed's vertical drag recognition with the player. The containing
// scroll view waits for this gesture when the touch starts on a lyric.
export const useLyricScrubGesture = (options: LyricScrubOptions) => {
  const callbacks = React.useRef(options);
  callbacks.current = options;
  const { enabled, scrollGesture } = options;
  const hasPress = Boolean(options.onPress);

  return React.useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(enabled)
      .activeOffsetY([-8, 8])
      .shouldCancelWhenOutside(false)
      .runOnJS(true)
      .onStart(() => callbacks.current.onStart())
      .onUpdate((event) => callbacks.current.onDrag(event.translationY))
      .onFinalize(() => callbacks.current.onEnd());
    if (scrollGesture) pan.blocksExternalGesture(scrollGesture);
    if (!hasPress) return pan;

    const tap = Gesture.Tap()
      .maxDuration(250)
      .maxDistance(8)
      .runOnJS(true)
      .onEnd((_event, succeeded) => {
        if (succeeded) callbacks.current.onPress?.();
      });
    return Gesture.Race(pan, tap);
  }, [enabled, hasPress, scrollGesture]);
};
