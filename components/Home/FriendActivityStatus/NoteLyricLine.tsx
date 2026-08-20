import * as React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

export interface NoteLyricSegment {
  text: string;
  startTimeMs: number;
  endTimeMs: number;
}

interface NoteLyricInlineProps {
  text?: string | null;
  style?: StyleProp<ViewStyle>;
}

interface NoteLyricBlocksProps {
  segments: NoteLyricSegment[];
  activeIndex: number;
  onSeek: (positionMs: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  isTimelineScrubbing?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SCRUB_LINE_HEIGHT = 28;
const SCRUB_SIDE_LINES = 3;
const MIN_VERTICAL_DRAG_PX = 8;

const clamp = (value: number, maximum: number) =>
  Math.max(0, Math.min(value, maximum));

const MusicalPlaceholder = () => (
  <View style={styles.notesRow}>
    <Text style={styles.musicNote}>♪</Text>
    <Text style={styles.musicNote}>♪</Text>
    <Text style={styles.musicNote}>♪</Text>
  </View>
);

export const NoteLyricInline = ({ text, style }: NoteLyricInlineProps) => (
  <View style={[styles.inlineContainer, style]}>
    {text ? (
      <Text style={styles.inlineText} numberOfLines={1}>
        {text}
      </Text>
    ) : (
      <MusicalPlaceholder />
    )}
  </View>
);

export const NoteLyricBlocks = ({
  segments,
  activeIndex,
  onSeek,
  onScrubStart,
  onScrubEnd,
  isTimelineScrubbing = false,
  style,
}: NoteLyricBlocksProps) => {
  const isScrubbingRef = React.useRef(false);
  const startIndexRef = React.useRef(0);
  const focusedIndexRef = React.useRef(0);
  const selectIndexRef = React.useRef<(index: number) => void>(() => {});
  const blockTransition = React.useRef(new Animated.Value(0)).current;
  const scrubTranslate = React.useMemo(
    () => Animated.add(blockTransition, -SCRUB_LINE_HEIGHT),
    [blockTransition]
  );
  const [isPressing, setIsPressing] = React.useState(false);
  const [focusedIndex, setFocusedIndex] = React.useState(0);
  const safeActiveIndex = clamp(activeIndex, Math.max(0, segments.length - 1));
  const isScrubbing = isPressing || isTimelineScrubbing;

  const animateBlockChange = React.useCallback(
    (previousIndex: number, nextIndex: number) => {
      if (previousIndex === nextIndex) return;

      blockTransition.stopAnimation();
      blockTransition.setValue((nextIndex - previousIndex) * SCRUB_LINE_HEIGHT);
      Animated.timing(blockTransition, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [blockTransition]
  );

  React.useEffect(() => {
    if (!isScrubbingRef.current) {
      const previousIndex = focusedIndexRef.current;
      focusedIndexRef.current = safeActiveIndex;
      setFocusedIndex(safeActiveIndex);
      if (isTimelineScrubbing)
        animateBlockChange(previousIndex, safeActiveIndex);
    }
  }, [animateBlockChange, isTimelineScrubbing, safeActiveIndex]);

  selectIndexRef.current = (index: number) => {
    const nextIndex = clamp(index, Math.max(0, segments.length - 1));
    if (nextIndex === focusedIndexRef.current || !segments[nextIndex]) return;

    const previousIndex = focusedIndexRef.current;
    focusedIndexRef.current = nextIndex;
    setFocusedIndex(nextIndex);
    animateBlockChange(previousIndex, nextIndex);
    onSeek(segments[nextIndex].startTimeMs);
  };

  const startScrubbing = React.useCallback(() => {
    if (isScrubbingRef.current) return;

    isScrubbingRef.current = true;
    startIndexRef.current = focusedIndexRef.current;
    setIsPressing(true);
    onScrubStart?.();
  }, [onScrubStart]);

  const stopScrubbing = React.useCallback(() => {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
    blockTransition.stopAnimation();
    blockTransition.setValue(0);
    setIsPressing(false);
    onScrubEnd?.();
  }, [blockTransition, onScrubEnd]);

  const lyricPanGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(!isTimelineScrubbing)
        .activeOffsetY([-MIN_VERTICAL_DRAG_PX, MIN_VERTICAL_DRAG_PX])
        .shouldCancelWhenOutside(false)
        .runOnJS(true)
        .onStart(startScrubbing)
        .onUpdate((event) => {
          selectIndexRef.current(
            startIndexRef.current -
              Math.round(event.translationY / SCRUB_LINE_HEIGHT)
          );
        })
        .onFinalize(stopScrubbing),
    [isTimelineScrubbing, startScrubbing, stopScrubbing]
  );

  if (segments.length === 0) return <NoteLyricInline style={style} />;

  const visibleIndexes = isScrubbing
    ? Array.from(
        { length: SCRUB_SIDE_LINES * 2 + 3 },
        (_, offset) => focusedIndex - SCRUB_SIDE_LINES - 1 + offset
      )
    : [safeActiveIndex - 1, safeActiveIndex, safeActiveIndex + 1];

  const lyricStack = (
    <Animated.View
      style={[
        styles.blocksStack,
        isScrubbing && {
          transform: [{ translateY: scrubTranslate }],
        },
      ]}
    >
      {visibleIndexes.map((index) => {
        const segment = segments[index];
        const active = index === focusedIndex;

        return (
          <View
            key={index}
            style={isScrubbing ? styles.scrubRow : styles.blockRow}
          >
            {segment ? (
              <Text
                style={[
                  isScrubbing ? styles.scrubText : styles.blockText,
                  active &&
                    (isScrubbing
                      ? styles.scrubTextActive
                      : styles.blockTextActive),
                ]}
                numberOfLines={isScrubbing ? 1 : 2}
              >
                {segment.text}
              </Text>
            ) : null}
          </View>
        );
      })}
    </Animated.View>
  );

  return (
    <GestureDetector gesture={lyricPanGesture}>
      <View
        collapsable={false}
        style={[styles.blocksContainer, style]}
        accessibilityRole="adjustable"
        accessibilityLabel="Letra da música"
        accessibilityHint="Segure e arraste para avançar ou voltar a música"
      >
        {isScrubbing ? (
          <View style={styles.scrubViewport}>{lyricStack}</View>
        ) : (
          lyricStack
        )}
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  inlineContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 10,
  },
  inlineText: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 14.5,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  notesRow: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  musicNote: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 26,
  },
  blocksContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  blocksStack: {
    width: '100%',
  },
  scrubViewport: {
    width: '100%',
    height: SCRUB_LINE_HEIGHT * (SCRUB_SIDE_LINES * 2 + 1),
    overflow: 'hidden',
  },
  blockRow: {
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  blockText: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: 17,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  blockTextActive: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 28,
  },
  scrubRow: {
    height: SCRUB_LINE_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  scrubText: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: 14.5,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  scrubTextActive: {
    color: '#FFFFFF',
  },
});
