import * as React from 'react';
import {
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
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

  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: Math.max(16, Math.min(24, size * 0.07)),
        },
      ]}
    >
      {source ? (
        <Image
          testID={testID}
          source={source}
          onError={() => {
            if (uri) setFailedUri(uri);
          }}
          resizeMode="cover"
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
    </View>
  );
};

export const SwipeableArtwork = ({
  trackKey,
  artworkUri,
  previousArtworkUri,
  nextArtworkUri,
  size,
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
  const dragX = useSharedValue(0);
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
    () =>
      Gesture.Pan()
        .enabled(!loading)
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
            size,
            canGoPrevious,
            canGoNext
          );
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
            direction === 'previous' ? size : -size,
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
        }),
    [canGoNext, canGoPrevious, dragX, loading, runSwipeCallback, size, uiLocked]
  );

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -size + dragX.value }],
  }));

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: Math.max(16, Math.min(24, size * 0.07)),
        },
        style,
      ]}
      testID={testID}
    >
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.track,
            {
              width: size * 3,
              height: size,
            },
            trackStyle,
          ]}
          testID={`${testID}-track`}
        >
          <ArtworkTile
            uri={canGoPrevious ? previousArtworkUri : null}
            size={size}
            fallbackSource={canGoPrevious ? previousFallbackSource : undefined}
            testID={`${testID}-previous`}
          />
          <ArtworkTile
            uri={artworkUri}
            size={size}
            fallbackSource={fallbackSource}
            testID={`${testID}-current`}
          />
          <ArtworkTile
            uri={canGoNext ? nextArtworkUri : null}
            size={size}
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  track: {
    flexDirection: 'row',
  },
  tile: {
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
