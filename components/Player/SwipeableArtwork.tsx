import * as React from 'react';
import {
  ActivityIndicator,
  ImageSourcePropType,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  clampArtworkDrag,
  createSwipeCallbackGate,
  resolveArtworkSwipe,
  SwipeDirection,
} from './swipeableArtworkGesture';

type ArtworkCallback = () => void | Promise<void>;

export type SwipeableArtworkProps = {
  trackKey: string;
  artworkUri?: string | null;
  previousArtworkUri?: string | null;
  nextArtworkUri?: string | null;
  size: number;
  viewportWidth?: number;
  gap?: number;
  progress?: SharedValue<number>;
  scrollGesture?: ReturnType<typeof Gesture.Native>;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: ArtworkCallback;
  onNext: ArtworkCallback;
  loading?: boolean;
  fallbackSource?: ImageSourcePropType;
  previousFallbackSource?: ImageSourcePropType;
  nextFallbackSource?: ImageSourcePropType;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

type ArtworkTileProps = {
  uri?: string | null;
  size: number;
  offset: number;
  viewportWidth: number;
  gap: number;
  progress: SharedValue<number>;
  available?: boolean;
  fallbackSource?: ImageSourcePropType;
  testID?: string;
};

const normalizeArtworkSource = (
  uri: string | null | undefined,
  fallbackSource: ImageSourcePropType | undefined
) => (uri ? { uri } : fallbackSource);

const ArtworkTile = ({
  uri,
  size,
  offset,
  viewportWidth,
  gap,
  progress,
  available = true,
  fallbackSource,
  testID,
}: ArtworkTileProps) => {
  const [failedUri, setFailedUri] = React.useState<string | null>(null);
  const source = normalizeArtworkSource(
    uri && uri !== failedUri ? uri : null,
    fallbackSource
  );

  React.useEffect(() => {
    setFailedUri(null);
  }, [uri]);
  const motionStyle = useAnimatedStyle(() => {
    const position = offset + progress.value;
    const distance = Math.min(1, Math.abs(position));
    return {
      zIndex: 3 - Math.round(distance * 2),
      transform: [
        { translateX: position * (size + gap) },
        { perspective: 900 },
        { rotateY: `${-Math.max(-1, Math.min(1, position)) * 12}deg` },
        { scale: 1 - distance * 0.14 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          left: (viewportWidth - size) / 2,
          opacity: available ? 1 : 0,
          borderRadius: Math.min(16, size * 0.05),
        },
        motionStyle,
      ]}
    >
      {source ? (
        <Image
          testID={testID}
          source={source}
          cachePolicy="memory-disk"
          contentFit="cover"
          onError={() => {
            if (uri) setFailedUri(uri);
          }}
          style={styles.image}
        />
      ) : (
        <View style={[styles.image, styles.emptyFallback]} testID={testID}>
          <Ionicons
            name="musical-note"
            size={Math.max(40, size * 0.24)}
            color="#8A8A8A"
          />
        </View>
      )}
    </Animated.View>
  );
};

export const SwipeableArtwork = ({
  trackKey,
  artworkUri,
  previousArtworkUri,
  nextArtworkUri,
  size,
  viewportWidth = size,
  gap = 0,
  progress: suppliedProgress,
  scrollGesture,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  loading = false,
  fallbackSource,
  previousFallbackSource,
  nextFallbackSource,
  accessibilityLabel = 'Capa da faixa atual',
  testID = 'swipeable-artwork',
  style,
}: SwipeableArtworkProps) => {
  const internalProgress = useSharedValue(0);
  const dragX = suppliedProgress || internalProgress;
  const uiLocked = useSharedValue(false);
  const gateRef = React.useRef(createSwipeCallbackGate());
  const latestCallbacksRef = React.useRef({ onPrevious, onNext });

  React.useEffect(() => {
    latestCallbacksRef.current = { onPrevious, onNext };
  }, [onPrevious, onNext]);

  React.useLayoutEffect(() => {
    gateRef.current.reset();
    cancelAnimation(dragX);
    dragX.value = 0;
    uiLocked.value = false;
  }, [dragX, trackKey, uiLocked]);

  const resetMotion = React.useCallback(() => {
    cancelAnimation(dragX);
    dragX.value = withTiming(0, { duration: 180 });
    uiLocked.value = false;
  }, [dragX, uiLocked]);

  const runSwipeCallback = React.useCallback(
    (direction: SwipeDirection) => {
      const callback =
        direction === 'previous'
          ? latestCallbacksRef.current.onPrevious
          : latestCallbacksRef.current.onNext;

      if (!gateRef.current.run(callback, resetMotion)) {
        resetMotion();
      }
    },
    [resetMotion]
  );

  const panGesture = React.useMemo(
    () => {
      const pan = Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-18, 18])
        .onBegin(() => {
          if (!uiLocked.value) {
            dragX.value = 0;
          }
        })
        .onUpdate((event) => {
          if (uiLocked.value) return;

          dragX.value = clampArtworkDrag(
            event.translationX,
            size + gap,
            canGoPrevious,
            canGoNext
          ) / (size + gap);
        })
        .onEnd((event) => {
          if (uiLocked.value) {
            return;
          }

          const direction = resolveArtworkSwipe({
            translationX: event.translationX,
            translationY: event.translationY,
            velocityX: event.velocityX,
            velocityY: event.velocityY,
            size,
            canGoPrevious,
            canGoNext,
          });

          if (!direction) {
            dragX.value = withTiming(0, { duration: 180 });
            return;
          }

          uiLocked.value = true;
          dragX.value = withTiming(
            direction === 'previous' ? 1 : -1,
            {
              duration: 160,
            },
            (finished) => {
              if (finished) {
                runOnJS(runSwipeCallback)(direction);
              } else {
                dragX.value = withTiming(0, { duration: 180 });
                uiLocked.value = false;
              }
            }
          );
        })
        .onFinalize(() => {
          if (!uiLocked.value) {
            dragX.value = withTiming(0, { duration: 180 });
          }
        });
      if (scrollGesture) pan.blocksExternalGesture(scrollGesture);
      return pan;
    },
    [canGoNext, canGoPrevious, dragX, gap, runSwipeCallback, scrollGesture, size, uiLocked]
  );

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={[
        styles.container,
        {
          width: viewportWidth,
          height: size,
        },
        style,
      ]}
      testID={testID}
    >
      <GestureDetector gesture={panGesture}>
        <Animated.View
          collapsable={false}
          style={[
            styles.track,
            {
              width: viewportWidth,
              height: size,
            },
          ]}
          testID={`${testID}-track`}
        >
          <ArtworkTile
            uri={canGoPrevious ? previousArtworkUri : null}
            size={size}
            offset={-1}
            viewportWidth={viewportWidth}
            gap={gap}
            progress={dragX}
            available={canGoPrevious}
            fallbackSource={canGoPrevious ? previousFallbackSource : undefined}
            testID={`${testID}-previous`}
          />
          <ArtworkTile
            uri={artworkUri}
            size={size}
            offset={0}
            viewportWidth={viewportWidth}
            gap={gap}
            progress={dragX}
            fallbackSource={fallbackSource}
            testID={`${testID}-current`}
          />
          <ArtworkTile
            uri={canGoNext ? nextArtworkUri : null}
            size={size}
            offset={1}
            viewportWidth={viewportWidth}
            gap={gap}
            progress={dragX}
            available={canGoNext}
            fallbackSource={canGoNext ? nextFallbackSource : undefined}
            testID={`${testID}-next`}
          />
        </Animated.View>
      </GestureDetector>

      {loading ? (
        <View
          pointerEvents="none"
          style={styles.loadingOverlay}
          testID={`${testID}-loading`}
        >
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  track: {
    position: 'relative',
  },
  tile: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  emptyFallback: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
  },
  loadingOverlay: {
    ...(StyleSheet.absoluteFill as object),
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'center',
  },
});
