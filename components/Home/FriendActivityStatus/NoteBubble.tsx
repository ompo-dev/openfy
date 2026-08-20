import * as React from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MarqueeText } from '../../common/MarqueeText';
import { getNoteColorTheme } from '../../../utils/colorContrast';
import { resolveNoteTailTuning } from './noteTailTuning';
import type { NoteTailTuning } from './noteTailTuning';

const NOTE_ASSEMBLY_WIDTH = 100;
const NOTE_BUBBLE_WIDTH = 97;
const NOTE_BUBBLE_MIN_HEIGHT = 44;
const NOTE_BUBBLE_MAX_HEIGHT = 68;
const NOTE_BUBBLE_RADIUS = 16;
const TAIL_MAIN_SIZE = 14;
const TAIL_SMALL_SIZE = 8;

interface NoteBubbleProps {
  color: string;
  title: string;
  subtitle?: string;
  text?: string;
  showWave?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  tailTuning?: Partial<NoteTailTuning>;
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}

type NoteBubbleFullWidthProps = Omit<NoteBubbleProps, 'fullWidth'>;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

const getGradientTone = (color: string, progress: number) => {
  const channels = color.replace('#', '').match(/.{2}/g);
  if (!channels || channels.length !== 3) return '#0A0E13';

  return `rgb(${channels
    .map((channel, index) => {
      const base = parseInt(channel, 16);
      const start = base * 0.9 + 255 * 0.1;
      const end = base * 0.32 + [4, 9, 15][index] * 0.68;
      return Math.round(start + (end - start) * progress);
    })
    .join(',')})`;
};

const getTailDotPositions = ({
  orbitAngle,
  mainDistance,
  smallAngleOffset,
  smallDistance,
  colorReferenceInset,
  noteHeight,
  bubbleWidth,
  assemblyWidth,
}: NoteTailTuning & {
  noteHeight: number;
  bubbleWidth: number;
  assemblyWidth: number;
}) => {
  const radius = Math.min(NOTE_BUBBLE_RADIUS, bubbleWidth / 2, noteHeight / 2);
  const straightHalfWidth = bubbleWidth / 2 - radius;
  const straightHalfHeight = noteHeight / 2 - radius;
  const horizontalInset = (assemblyWidth - bubbleWidth) / 2;

  const getEdgePoint = (angle: number) => {
    const radians = (angle * Math.PI) / 180;
    const direction = { x: Math.cos(radians), y: Math.sin(radians) };
    let lower = 0;
    let upper = Math.hypot(bubbleWidth / 2, noteHeight / 2);

    for (let step = 0; step < 16; step += 1) {
      const distance = (lower + upper) / 2;
      const x = direction.x * distance;
      const y = direction.y * distance;
      const closestX = clamp(x, -straightHalfWidth, straightHalfWidth);
      const closestY = clamp(y, -straightHalfHeight, straightHalfHeight);

      if ((x - closestX) ** 2 + (y - closestY) ** 2 <= radius ** 2)
        lower = distance;
      else upper = distance;
    }

    const x = direction.x * lower;
    const y = direction.y * lower;
    const closestX = clamp(x, -straightHalfWidth, straightHalfWidth);
    const closestY = clamp(y, -straightHalfHeight, straightHalfHeight);
    const normalLength = Math.hypot(x - closestX, y - closestY) || 1;

    return {
      x: horizontalInset + bubbleWidth / 2 + x,
      y: noteHeight / 2 + y,
      normal: {
        x: (x - closestX) / normalLength,
        y: (y - closestY) / normalLength,
      },
    };
  };

  const mainEdge = getEdgePoint(orbitAngle);
  const smallEdge = getEdgePoint(orbitAngle + smallAngleOffset);

  return {
    main: {
      left: mainEdge.x + mainEdge.normal.x * mainDistance - TAIL_MAIN_SIZE / 2,
      top: mainEdge.y + mainEdge.normal.y * mainDistance - TAIL_MAIN_SIZE / 2,
      reference: {
        x: mainEdge.x - mainEdge.normal.x * colorReferenceInset,
        y: mainEdge.y - mainEdge.normal.y * colorReferenceInset,
      },
    },
    small: {
      left:
        smallEdge.x + smallEdge.normal.x * smallDistance - TAIL_SMALL_SIZE / 2,
      top:
        smallEdge.y + smallEdge.normal.y * smallDistance - TAIL_SMALL_SIZE / 2,
    },
  };
};

const getGradientProgress = ({
  x,
  y,
  noteHeight,
  bubbleWidth,
  assemblyWidth,
}: {
  x: number;
  y: number;
  noteHeight: number;
  bubbleWidth: number;
  assemblyWidth: number;
}) => {
  const horizontalInset = (assemblyWidth - bubbleWidth) / 2;
  return clamp(
    ((x - horizontalInset) / bubbleWidth + y / noteHeight) / 2,
    0,
    1
  );
};

const getTailGradientProgress = ({
  dot,
  dotSize,
  reference,
  noteHeight,
  bubbleWidth,
  assemblyWidth,
}: {
  dot: { left: number; top: number };
  dotSize: number;
  reference: { x: number; y: number };
  noteHeight: number;
  bubbleWidth: number;
  assemblyWidth: number;
}) => {
  const referenceProgress = getGradientProgress({
    x: reference.x,
    y: reference.y,
    noteHeight,
    bubbleWidth,
    assemblyWidth,
  });
  const referencePosition =
    ((reference.x - dot.left) / dotSize + (reference.y - dot.top) / dotSize) /
    2;
  const dotProgressSpan = (dotSize / bubbleWidth + dotSize / noteHeight) / 2;

  return [
    clamp(referenceProgress - referencePosition * dotProgressSpan, 0, 1),
    clamp(referenceProgress + (1 - referencePosition) * dotProgressSpan, 0, 1),
  ] as const;
};

const SoundWaveIcon = ({ color }: { color: string }) => {
  const first = React.useRef(new Animated.Value(6)).current;
  const second = React.useRef(new Animated.Value(12)).current;
  const third = React.useRef(new Animated.Value(7)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(first, {
            toValue: 13,
            duration: 280,
            useNativeDriver: false,
          }),
          Animated.timing(second, {
            toValue: 6,
            duration: 260,
            useNativeDriver: false,
          }),
          Animated.timing(third, {
            toValue: 15,
            duration: 300,
            useNativeDriver: false,
          }),
        ]),
        Animated.parallel([
          Animated.timing(first, {
            toValue: 6,
            duration: 280,
            useNativeDriver: false,
          }),
          Animated.timing(second, {
            toValue: 14,
            duration: 300,
            useNativeDriver: false,
          }),
          Animated.timing(third, {
            toValue: 7,
            duration: 260,
            useNativeDriver: false,
          }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [first, second, third]);

  return (
    <View style={styles.waveContainer}>
      <Animated.View
        style={[styles.waveBar, { height: first, backgroundColor: color }]}
      />
      <Animated.View
        style={[styles.waveBar, { height: second, backgroundColor: color }]}
      />
      <Animated.View
        style={[styles.waveBar, { height: third, backgroundColor: color }]}
      />
    </View>
  );
};

export const NoteBubble = ({
  color,
  title,
  subtitle,
  text,
  showWave = false,
  leading,
  trailing,
  tailTuning,
  onLayout,
  style,
  fullWidth = false,
}: NoteBubbleProps) => {
  const [layout, setLayout] = React.useState({
    width: NOTE_ASSEMBLY_WIDTH,
    height: NOTE_BUBBLE_MIN_HEIGHT,
  });
  const assemblyWidth = fullWidth
    ? Math.max(NOTE_BUBBLE_WIDTH, layout.width)
    : NOTE_ASSEMBLY_WIDTH;
  const bubbleWidth = fullWidth ? assemblyWidth : NOTE_BUBBLE_WIDTH;
  const tuning = resolveNoteTailTuning(tailTuning);
  const colorTheme = getNoteColorTheme(color);
  const tails = getTailDotPositions({
    ...tuning,
    noteHeight: layout.height,
    bubbleWidth,
    assemblyWidth,
  });
  const { reference: mainReference, ...mainTailStyle } = tails.main;
  const mainProgress = getTailGradientProgress({
    dot: mainTailStyle,
    dotSize: TAIL_MAIN_SIZE,
    reference: mainReference,
    noteHeight: layout.height,
    bubbleWidth,
    assemblyWidth,
  });
  const smallProgress = [
    getGradientProgress({
      x: tails.small.left,
      y: tails.small.top,
      noteHeight: layout.height,
      bubbleWidth,
      assemblyWidth,
    }),
    getGradientProgress({
      x: tails.small.left + TAIL_SMALL_SIZE,
      y: tails.small.top + TAIL_SMALL_SIZE,
      noteHeight: layout.height,
      bubbleWidth,
      assemblyWidth,
    }),
  ] as const;
  const mainColors = [
    getGradientTone(color, clamp(mainProgress[0] + tuning.mainStartFine, 0, 1)),
    getGradientTone(color, clamp(mainProgress[1] + tuning.mainEndFine, 0, 1)),
  ] as const;
  const smallColors = [
    getGradientTone(
      color,
      clamp(smallProgress[0] + tuning.smallStartFine, 0, 1)
    ),
    getGradientTone(color, clamp(smallProgress[1] + tuning.smallEndFine, 0, 1)),
  ] as const;

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextLayout = event.nativeEvent.layout;
    setLayout((current) =>
      current.width === nextLayout.width && current.height === nextLayout.height
        ? current
        : { width: nextLayout.width, height: nextLayout.height }
    );
    onLayout?.(event);
  };

  return (
    <View
      style={[styles.assembly, fullWidth && styles.fullWidthAssembly, style]}
      onLayout={handleLayout}
    >
      <LinearGradient
        pointerEvents="none"
        colors={mainColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.tailMain, mainTailStyle]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={smallColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.tailSmall, tails.small]}
      />
      <View
        style={[styles.bubble, { width: bubbleWidth, backgroundColor: color }]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.60)', 'rgba(255,255,255,0.04)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.borderGradient}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[getGradientTone(color, 0), getGradientTone(color, 1)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bubbleGradient}
          />
        </LinearGradient>
        <View style={styles.titleRow}>
          {leading ??
            (showWave && <SoundWaveIcon color={colorTheme.waveColor} />)}
          <View style={styles.textFlex}>
            <MarqueeText
              text={title}
              style={[styles.title, { color: colorTheme.titleColor }]}
              align="center"
              fadeWidth={6}
              fadeColor={color}
            />
            {subtitle ? (
              <MarqueeText
                text={subtitle}
                style={[styles.subtitle, { color: colorTheme.artistColor }]}
                align="center"
                fadeWidth={6}
                fadeColor={color}
              />
            ) : null}
          </View>
          {trailing}
        </View>
        {text ? (
          <MarqueeText
            text={text.slice(0, 30)}
            style={[styles.text, { color: colorTheme.customTextColor }]}
            align="center"
            fadeWidth={6}
            fadeColor={color}
          />
        ) : null}
      </View>
    </View>
  );
};

export const NoteBubbleFullWidth = (props: NoteBubbleFullWidthProps) => (
  <NoteBubble {...props} fullWidth />
);

const styles = StyleSheet.create({
  assembly: {
    width: NOTE_ASSEMBLY_WIDTH,
    minHeight: NOTE_BUBBLE_MIN_HEIGHT,
    maxHeight: NOTE_BUBBLE_MAX_HEIGHT,
    alignItems: 'center',
    position: 'relative',
  },
  fullWidthAssembly: {
    width: '100%',
  },
  bubble: {
    width: NOTE_BUBBLE_WIDTH,
    minHeight: NOTE_BUBBLE_MIN_HEIGHT,
    maxHeight: NOTE_BUBBLE_MAX_HEIGHT,
    borderRadius: NOTE_BUBBLE_RADIUS,
    paddingHorizontal: 8,
    paddingVertical: 5,
    justifyContent: 'center',
    zIndex: 2,
    position: 'relative',
    overflow: 'visible',
  },
  borderGradient: {
    ...StyleSheet.absoluteFill,
    borderRadius: NOTE_BUBBLE_RADIUS,
    overflow: 'hidden',
  },
  bubbleGradient: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: -1,
    bottom: -1,
    borderRadius: NOTE_BUBBLE_RADIUS - 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  textFlex: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 15,
    width: 11,
    flexShrink: 0,
  },
  waveBar: {
    width: 2.2,
    borderRadius: 1.1,
  },
  title: {
    fontSize: 11.5,
    fontFamily: 'SimplyRounded-Bold',
    fontWeight: '700',
    letterSpacing: 0.05,
  },
  subtitle: {
    fontSize: 10,
    fontFamily: 'SimplyRounded',
    marginTop: 1,
  },
  text: {
    fontSize: 9.5,
    fontFamily: 'SimplyRounded',
    fontStyle: 'italic',
    marginTop: 1,
  },
  tailMain: {
    position: 'absolute',
    width: TAIL_MAIN_SIZE,
    height: TAIL_MAIN_SIZE,
    borderRadius: TAIL_MAIN_SIZE / 2,
    zIndex: 1,
  },
  tailSmall: {
    position: 'absolute',
    width: TAIL_SMALL_SIZE,
    height: TAIL_SMALL_SIZE,
    borderRadius: TAIL_SMALL_SIZE / 2,
    zIndex: 1,
  },
});
