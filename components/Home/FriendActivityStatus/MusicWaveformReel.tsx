import * as React from 'react';
import {
  Animated,
  Dimensions,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

type ResizeHandler = (deltaMs: number) => number;

type MusicWaveformReelProps = {
  totalDurationMs: number;
  selectionStartMs: number;
  selectionDurationMs: number;
  seed: string;
  onMoveToStart: (requestedStartMs: number) => number;
  onScrubStart?: () => void;
  onScrubEnd?: (positionMs?: number) => void;
  onResizeStart?: ResizeHandler;
  onResizeEnd?: ResizeHandler;
  /** Visible time window. Omit to preserve the note editor's fixed snippet reel. */
  viewportDurationMs?: number;
  /** When supplied, render the selection as a playback-progress fill. */
  selectionProgress?: number;
};

const BAR_WIDTH = 3;
const BAR_GAP = 5;
const BAR_PITCH = BAR_WIDTH + BAR_GAP;
const NOTE_BARS_PER_SECOND = 12 / 30;
const FRAME_BORDER_WIDTH = 3.5;
const MIN_FRAME_WIDTH = 24;
const HANDLE_HIT_AREA = 14;
const DEFAULT_CONTAINER_WIDTH = Math.max(
  1,
  Dimensions.get('window').width - 48
);

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(value, maximum));

export function MusicWaveformReel({
  totalDurationMs,
  selectionStartMs,
  selectionDurationMs,
  seed,
  onMoveToStart,
  onScrubStart,
  onScrubEnd,
  onResizeStart,
  onResizeEnd,
  viewportDurationMs,
  selectionProgress,
}: MusicWaveformReelProps) {
  const [containerWidth, setContainerWidth] = React.useState(
    DEFAULT_CONTAINER_WIDTH
  );
  const scrollAnim = React.useRef(new Animated.Value(0)).current;
  const scrollValueRef = React.useRef(0);
  const isDraggingRef = React.useRef(false);
  const panStartRef = React.useRef(0);
  const actionRef = React.useRef<'move' | 'resize-start' | 'resize-end'>(
    'move'
  );
  const appliedResizeDeltaRef = React.useRef(0);
  const tapPositionRef = React.useRef<number | undefined>(undefined);

  const safeDurationMs = Math.max(1, totalDurationMs);
  const safeSelectionDurationMs = clamp(selectionDurationMs, 1, safeDurationMs);
  const safeSelectionProgress =
    selectionProgress === undefined
      ? undefined
      : clamp(selectionProgress, 0, 1);
  const isViewportMode = typeof viewportDurationMs === 'number';
  const visibleDurationMs = Math.min(
    safeDurationMs,
    Math.max(
      safeSelectionDurationMs,
      viewportDurationMs ?? safeSelectionDurationMs
    )
  );
  const totalBars = isViewportMode
    ? Math.max(
        12,
        Math.ceil(
          (safeDurationMs / visibleDurationMs) * (containerWidth / BAR_PITCH)
        )
      )
    : Math.max(
        12,
        Math.round(Math.max(30, safeDurationMs / 1000) * NOTE_BARS_PER_SECOND)
      );
  const waveformWidth = totalBars * BAR_WIDTH + (totalBars - 1) * BAR_GAP;
  const pixelsPerMs = waveformWidth / safeDurationMs;
  const maxStartMs = Math.max(0, safeDurationMs - safeSelectionDurationMs);
  const frameWidth = Math.min(
    containerWidth,
    Math.max(
      MIN_FRAME_WIDTH,
      isViewportMode
        ? (safeSelectionDurationMs / visibleDurationMs) * containerWidth
        : (safeSelectionDurationMs / 1000) * BAR_PITCH * NOTE_BARS_PER_SECOND
    )
  );
  const frameLeft = Math.max(0, (containerWidth - frameWidth) / 2);
  const maxScroll = Math.max(0, waveformWidth - frameWidth);
  const valuesRef = React.useRef({
    frameLeft,
    frameWidth,
    maxScroll,
    maxStartMs,
    onMoveToStart,
    onResizeEnd,
    onResizeStart,
    onScrubEnd,
    onScrubStart,
    pixelsPerMs,
    selectionDurationMs: safeSelectionDurationMs,
    selectionStartMs,
  });

  valuesRef.current = {
    frameLeft,
    frameWidth,
    maxScroll,
    maxStartMs,
    onMoveToStart,
    onResizeEnd,
    onResizeStart,
    onScrubEnd,
    onScrubStart,
    pixelsPerMs,
    selectionDurationMs: safeSelectionDurationMs,
    selectionStartMs,
  };

  const getScrollForStart = React.useCallback(
    (startMs: number) =>
      maxStartMs > 0 && maxScroll > 0
        ? (clamp(startMs, 0, maxStartMs) / maxStartMs) * maxScroll
        : 0,
    [maxScroll, maxStartMs]
  );

  React.useEffect(() => {
    // Moving keeps its own continuous scroll value. Resizing changes the
    // interval geometry, so it must re-center the fixed selector immediately.
    if (isDraggingRef.current && actionRef.current === 'move') return;
    const nextScroll = getScrollForStart(selectionStartMs);
    scrollValueRef.current = nextScroll;
    scrollAnim.setValue(nextScroll);
  }, [getScrollForStart, scrollAnim, selectionStartMs]);

  const waveformHeights = React.useMemo(() => {
    const titleLength = seed.length || 5;
    return Array.from({ length: totalBars }, (_, index) => {
      const position = index / Math.max(1, totalBars);
      const envelope = Math.sin(position * Math.PI) * 0.7 + 0.3;
      const peakSeed = (index * 23 + titleLength * 13) % 100;
      const base = 10 + (peakSeed % 28);
      return Math.min(42, Math.max(8, Math.round(base * envelope * 1.2)));
    });
  }, [seed.length, totalBars]);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const values = valuesRef.current;
        // `locationX` stays relative to this fixed selector on native, while
        // `pageX` can be stale during a gesture after layout changes.
        const x = event.nativeEvent.locationX;
        const resizable = Boolean(values.onResizeStart && values.onResizeEnd);
        actionRef.current =
          resizable && Math.abs(x - values.frameLeft) <= HANDLE_HIT_AREA
            ? 'resize-start'
            : resizable &&
                Math.abs(x - (values.frameLeft + values.frameWidth)) <=
                  HANDLE_HIT_AREA
              ? 'resize-end'
              : 'move';
        tapPositionRef.current =
          actionRef.current === 'move' &&
          x >= values.frameLeft &&
          x <= values.frameLeft + values.frameWidth
            ? values.selectionStartMs +
              ((x - values.frameLeft) / values.frameWidth) *
                values.selectionDurationMs
            : undefined;
        panStartRef.current = scrollValueRef.current;
        appliedResizeDeltaRef.current = 0;
        isDraggingRef.current = true;
        values.onScrubStart?.();
      },
      onPanResponderMove: (_event, gesture) => {
        const values = valuesRef.current;
        const action = actionRef.current;
        if (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4) {
          tapPositionRef.current = undefined;
        }

        if (action === 'move') {
          const requestedStartMs =
            values.maxScroll > 0
              ? (clamp(panStartRef.current - gesture.dx, 0, values.maxScroll) /
                  values.maxScroll) *
                values.maxStartMs
              : 0;
          const acceptedStartMs = values.onMoveToStart(requestedStartMs);
          const acceptedScroll =
            values.maxStartMs > 0
              ? (clamp(acceptedStartMs, 0, values.maxStartMs) /
                  values.maxStartMs) *
                values.maxScroll
              : 0;
          scrollValueRef.current = acceptedScroll;
          scrollAnim.setValue(acceptedScroll);
          return;
        }

        const totalDeltaMs = Math.round(gesture.dx / values.pixelsPerMs);
        const deltaMs = totalDeltaMs - appliedResizeDeltaRef.current;
        if (!deltaMs) return;
        const appliedDeltaMs =
          action === 'resize-start'
            ? values.onResizeStart?.(deltaMs)
            : values.onResizeEnd?.(deltaMs);
        appliedResizeDeltaRef.current += appliedDeltaMs || 0;
      },
      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        Haptics.selectionAsync().catch(() => {});
        valuesRef.current.onScrubEnd?.(tapPositionRef.current);
        tapPositionRef.current = undefined;
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        valuesRef.current.onScrubEnd?.();
        tapPositionRef.current = undefined;
      },
    })
  ).current;

  const reelPadding = frameLeft;
  const selectionReelLeft = reelPadding - frameLeft - FRAME_BORDER_WIDTH;
  const selectionProgressReelLeft = reelPadding - frameLeft;

  return (
    <View
      accessibilityHint="Arraste onda para mover trecho. Arraste pontos laterais para alterar intervalo."
      accessibilityLabel="Seletor de trecho da música"
      accessibilityRole="adjustable"
      onLayout={(event: LayoutChangeEvent) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (nextWidth > 0) setContainerWidth(nextWidth);
      }}
      style={styles.container}
      {...panResponder.panHandlers}
    >
      <Animated.View
        style={[
          styles.waveformReel,
          {
            paddingLeft: reelPadding,
            paddingRight: reelPadding,
            transform: [{ translateX: Animated.multiply(scrollAnim, -1) }],
          },
        ]}
      >
        {waveformHeights.map((height, index) => (
          <View key={index} style={[styles.waveformBar, { height }]} />
        ))}
      </Animated.View>
      <View
        pointerEvents="none"
        style={[
          styles.frame,
          safeSelectionProgress === undefined
            ? styles.frameFilled
            : styles.frameProgress,
          { left: frameLeft, width: frameWidth },
        ]}
      >
        {safeSelectionProgress === undefined ? (
          <View style={styles.selectionClip}>
            <Animated.View
              style={[
                styles.selectionReel,
                {
                  left: selectionReelLeft,
                  width: waveformWidth,
                  transform: [
                    { translateX: Animated.multiply(scrollAnim, -1) },
                  ],
                },
              ]}
            >
              {waveformHeights.map((height, index) => (
                <View key={index} style={[styles.selectionBar, { height }]} />
              ))}
            </Animated.View>
          </View>
        ) : (
          <View
            style={[
              styles.selectionProgressFill,
              { width: `${safeSelectionProgress * 100}%` },
            ]}
          >
            <Animated.View
              style={[
                styles.selectionReel,
                {
                  left: selectionProgressReelLeft,
                  width: waveformWidth,
                  transform: [
                    { translateX: Animated.multiply(scrollAnim, -1) },
                  ],
                },
              ]}
            >
              {waveformHeights.map((height, index) => (
                <View key={index} style={[styles.selectionBar, { height }]} />
              ))}
            </Animated.View>
          </View>
        )}
        {onResizeStart && onResizeEnd ? (
          <>
            <View style={[styles.handle, styles.handleStart]} />
            <View style={[styles.handle, styles.handleEnd]} />
          </>
        ) : null}
        <View style={styles.frameBorder} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 58,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  waveformReel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
  },
  waveformBar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    backgroundColor: '#FFFFFF',
  },
  frame: {
    position: 'absolute',
    top: 4,
    height: 50,
    zIndex: 10,
    borderRadius: 10,
    overflow: 'visible',
    justifyContent: 'center',
  },
  frameFilled: {
    backgroundColor: '#FFFFFF',
  },
  frameProgress: {
    backgroundColor: 'transparent',
  },
  selectionClip: {
    position: 'absolute',
    top: FRAME_BORDER_WIDTH,
    right: FRAME_BORDER_WIDTH,
    bottom: FRAME_BORDER_WIDTH,
    left: FRAME_BORDER_WIDTH,
    borderRadius: 10 - FRAME_BORDER_WIDTH,
    overflow: 'hidden',
  },
  selectionReel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
  },
  selectionBar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    backgroundColor: '#101116',
  },
  selectionProgressFill: {
    borderRadius: 10,
    height: '100%',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  frameBorder: {
    ...(StyleSheet.absoluteFill as any),
    borderRadius: 10,
    borderWidth: FRAME_BORDER_WIDTH,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  handle: {
    position: 'absolute',
    top: '50%',
    width: 10,
    height: 10,
    marginTop: -5,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#101116',
  },
  handleStart: { left: -5 },
  handleEnd: { right: -5 },
});
