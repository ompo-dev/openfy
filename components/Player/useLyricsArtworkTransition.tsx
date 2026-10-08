import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export type ArtworkFrame = { x: number; y: number; width: number; height: number };
type Frame = ArtworkFrame;
type Flight = { from: Frame; to: Frame; uri: string; fromRadius: number; toRadius: number; id: number };
const DURATION = 460;
const easing = Easing.bezier(0.4, 0, 0.2, 1);

export const useLyricsArtworkTransition = (
  visible: boolean,
  trackKey: string,
  artworkUri: string,
  coverSize: number,
  lyricsVisible: boolean
) => {
  const containerRef = React.useRef<View>(null);
  const mediaRef = React.useRef<View>(null);
  const rowRef = React.useRef<View>(null);
  const frames = React.useRef<Partial<Record<'container' | 'media' | 'row', Frame>>>({});
  const flightId = React.useRef(0);
  const flightCompletion = React.useRef<(() => void) | null>(null);
  const flying = React.useRef(false);
  const measurementTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lyricsVisibleRef = React.useRef(lyricsVisible);
  lyricsVisibleRef.current = lyricsVisible;
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const flightProgress = useSharedValue(0);
  const modeProgress = useSharedValue(lyricsVisible ? 1 : 0);
  const reduceMotion = useReducedMotion();

  const captureFrames = React.useCallback(() => {
    const refs = { container: containerRef, media: mediaRef, row: rowRef };
    (Object.keys(refs) as (keyof typeof refs)[]).forEach((key) => {
      refs[key].current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) frames.current[key] = { x, y, width, height };
      });
    });
  }, []);

  const finish = React.useCallback((id: number) => {
    if (flightId.current !== id) return;
    flying.current = false;
    setFlight(null);
    const complete = flightCompletion.current;
    flightCompletion.current = null;
    complete?.();
  }, []);

  // Every artwork flight uses this same UI-thread animation and overlay.
  const startFlight = React.useCallback((
    from: Frame,
    to: Frame,
    uri: string,
    id: number,
    onComplete?: () => void,
  ) => {
    if (reduceMotion || !uri || from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) {
      onComplete?.();
      return;
    }
    flying.current = true;
    flightCompletion.current = onComplete || null;
    flightProgress.value = 0;
    setFlight({ from, to, uri, fromRadius: from.width <= 36 ? 10 : 16,
      toRadius: to.width <= 36 ? 10 : 16, id });
  }, [flightProgress, reduceMotion]);

  const flyBetweenFrames = React.useCallback((
    from: Frame,
    to: Frame,
    uri: string,
    onComplete?: () => void,
  ) => {
    if (flying.current) return;
    startFlight(from, to, uri, ++flightId.current, onComplete);
  }, [startFlight]);

  const transition = React.useCallback((opening: boolean, applyMode: () => void) => {
    if (flying.current) return;
    const id = ++flightId.current;
    const start = (measured = frames.current) => {
      if (id !== flightId.current) return;
      const { container, media, row } = measured;
      if (!reduceMotion && artworkUri && container && media && row) {
        const large = { x: media.x - container.x + (media.width - coverSize) / 2,
          y: media.y - container.y, width: coverSize, height: coverSize };
        const small = { x: row.x - container.x + 20,
          y: row.y - container.y + (row.height - 36) / 2, width: 36, height: 36 };
        startFlight(opening ? large : small, opening ? small : large, artworkUri, id);
      }
      modeProgress.value = reduceMotion
        ? (opening ? 1 : 0)
        : withTiming(opening ? 1 : 0, { duration: DURATION, easing });
      applyMode();
    };
    if (reduceMotion || !artworkUri || !frames.current.container || !frames.current.media || !frames.current.row) {
      start();
      return;
    }
    // Refresh the three coordinates in one layout batch; cached positions may
    // precede a scroll or the modal entrance. Never hold up a tap on measurement.
    const measured = { ...frames.current };
    const refs = { container: containerRef, media: mediaRef, row: rowRef };
    let remaining = 3;
    let started = false;
    const complete = () => {
      if (started || id !== flightId.current) return;
      started = true;
      if (measurementTimer.current) clearTimeout(measurementTimer.current);
      measurementTimer.current = null;
      start(measured);
    };
    if (measurementTimer.current) clearTimeout(measurementTimer.current);
    measurementTimer.current = setTimeout(complete, 50);
    (Object.keys(refs) as (keyof typeof refs)[]).forEach((key) => {
      const view = refs[key].current;
      if (!view) { if (--remaining === 0) complete(); return; }
      view.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) measured[key] = { x, y, width, height };
        if (--remaining === 0) complete();
      });
    });
  }, [artworkUri, coverSize, modeProgress, reduceMotion, startFlight]);

  const cancelFlight = React.useCallback(() => {
    flightId.current++;
    flying.current = false;
    flightCompletion.current = null;
    if (measurementTimer.current) clearTimeout(measurementTimer.current);
    measurementTimer.current = null;
    cancelAnimation(flightProgress);
    cancelAnimation(modeProgress);
  }, [flightProgress, modeProgress]);

  React.useEffect(() => {
    cancelFlight();
    modeProgress.value = lyricsVisibleRef.current ? 1 : 0;
    setFlight(null);
    captureFrames();
    return cancelFlight;
  }, [cancelFlight, captureFrames, modeProgress, trackKey, visible]);

  const flightStyle = useAnimatedStyle(() => {
    if (!flight) return {};
    const p = flightProgress.value;
    const scale = (flight.from.width + (flight.to.width - flight.from.width) * p) / coverSize;
    const radius = flight.fromRadius + (flight.toRadius - flight.fromRadius) * p;
    return {
      borderRadius: radius / scale,
      transform: [
        { translateX: (flight.to.x + flight.to.width / 2 - flight.from.x - flight.from.width / 2) * p },
        { translateY: (flight.to.y + flight.to.height / 2 - flight.from.y - flight.from.height / 2) * p },
        { scale },
      ],
    };
  }, [flight, coverSize]);
  const lyricsStyle = useAnimatedStyle(() => ({ opacity: modeProgress.value }));
  // Animate geometry rather than alpha so UIKit keeps the glass material active.
  const toggleStyle = useAnimatedStyle(() => ({ width: 56 * (1 - modeProgress.value),
    transform: [{ scale: Math.max(0.001, 1 - modeProgress.value) }] }));
  const copyStyle = useAnimatedStyle(() => ({ marginLeft: 54 * modeProgress.value - (lyricsVisible ? 54 : 0) }));

  // Reanimated installs style mappers in passive effects. Start after those
  // mappers (including the child sheet) so every surface sees the first frame.
  React.useEffect(() => {
    if (!flight || flight.id !== flightId.current) return;
    const id = flight.id;
    flightProgress.value = withTiming(1, { duration: DURATION, easing }, (finished) => {
      if (finished) runOnJS(finish)(id);
    });
  }, [flight, finish, flightProgress]);

  // Match the source on the first mount, before the UI worklet attaches.
  const overlay = flight ? (
    <Animated.View testID="player-artwork-transition" pointerEvents="none"
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.flight, { width: coverSize, height: coverSize,
        left: flight.from.x + (flight.from.width - coverSize) / 2,
        top: flight.from.y + (flight.from.height - coverSize) / 2,
        borderRadius: flight.fromRadius * coverSize / flight.from.width,
        transform: [{ translateX: 0 }, { translateY: 0 }, { scale: flight.from.width / coverSize }],
      }, flightStyle]}>
      <Image source={{ uri: flight.uri }} cachePolicy="memory-disk" contentFit="cover"
        transition={0} style={StyleSheet.absoluteFill} />
    </Animated.View>
  ) : null;

  return { containerRef, mediaRef, rowRef, captureFrames, transition, flyBetweenFrames, transitioning: Boolean(flight),
    flightProgress, lyricsStyle, toggleStyle, copyStyle, overlay };
};

const styles = StyleSheet.create({
  flight: { position: 'absolute', zIndex: 50, elevation: 50, overflow: 'hidden' },
});
