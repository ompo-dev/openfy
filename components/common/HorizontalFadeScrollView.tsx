import * as React from 'react';
import { Animated, Platform, ScrollView, StyleSheet, View, processColor, type ScrollViewProps, type NativeSyntheticEvent, type NativeScrollEvent, type ViewStyle, type StyleProp } from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { COLORS } from '@config';

type Edges = { left: boolean; right: boolean };
export function horizontalScrollEdges(offset: number, viewport: number, content: number): Edges {
  if (viewport <= 0 || content <= viewport + 1) return { left: false, right: false };
  return { left: offset > 1, right: offset < content - viewport - 1 };
}

export function fadeColorAtAlpha(color: string, alpha: number): string {
  const value = processColor(color);
  if (typeof value !== 'number') return 'transparent';
  const rgb = value >>> 0;
  return `rgba(${rgb >>> 16 & 255},${rgb >>> 8 & 255},${rgb & 255},${alpha})`;
}
export const transparentColor = (color: string) => fadeColorAtAlpha(color, 0);
// Sample a smoothstep curve: zero slope at both ends avoids visible seams.
const STOPS = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1] as const;
const ALPHAS = [1, 0.93925, 0.784, 0.5, 0.216, 0.06075, 0] as const;
export function horizontalFadeColors(color: string, reverse = false): [string, string, ...string[]] {
  const values = ALPHAS.map((alpha) => fadeColorAtAlpha(color, alpha));
  return (reverse ? values.reverse() : values) as [string, string, ...string[]];
}

/** Stationary, touch-through edge gradients. Use matching surface colors on opaque backgrounds. */
export function HorizontalFadeEdges({ left, right, color = COLORS.PRIMARY, width = 28 }: Edges & { color?: string; width?: number }) {
  return <>
    {left && width > 0 ? <LinearGradient testID="horizontal-fade-left" pointerEvents="none" colors={horizontalFadeColors(color)} locations={STOPS}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[S.edge, { left: 0, width }]} /> : null}
    {right && width > 0 ? <LinearGradient testID="horizontal-fade-right" pointerEvents="none" colors={horizontalFadeColors(color, true)} locations={STOPS}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[S.edge, { right: 0, width }]} /> : null}
  </>;
}

export function HorizontalFadeMask({ left, right, width = 28, style, children }: Edges & {
  width?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  if (Platform.OS === 'web') {
    const start = STOPS.map((stop, i) => `rgba(0,0,0,${left ? 1 - ALPHAS[i] : 1}) ${stop * width}px`);
    const end = STOPS.map((stop, i) => `rgba(0,0,0,${right ? ALPHAS[i] : 1}) calc(100% - ${(1 - stop) * width}px)`);
    const mask = `linear-gradient(to right, ${[...start, ...end].join(', ')})`;
    return <View style={[style, { maskImage: mask, WebkitMaskImage: mask } as ViewStyle]}>{children}</View>;
  }
  return <MaskedView style={style} androidRenderingMode="software" maskElement={<View style={S.mask}>
    <LinearGradient colors={left ? horizontalFadeColors('#000000', true) : ['#000000', '#000000']} locations={left ? STOPS : undefined} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width }} />
    <View style={S.maskCenter} />
    <LinearGradient colors={right ? horizontalFadeColors('#000000') : ['#000000', '#000000']} locations={right ? STOPS : undefined} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width }} />
  </View>}>{children}</MaskedView>;
}

type Props = ScrollViewProps & {
  fadeColor?: string;
  fadeWidth?: number;
  /** Alpha masking preserves translucent and variable backgrounds (e.g. Liquid Glass sheets). */
  fadeMode?: 'overlay' | 'mask';
  kind?: 'native' | 'gesture' | 'animated';
  animatedOffset?: Animated.Value;
};

export const HorizontalFadeScrollView = React.forwardRef<ScrollView, Props>(function HorizontalFadeScrollView({
  fadeColor = COLORS.PRIMARY, fadeWidth = 28, fadeMode = 'overlay', kind = 'native', animatedOffset,
  style, onLayout, onContentSizeChange, onScroll, scrollEventThrottle = 16, children, ...props
}, ref) {
  const metrics = React.useRef({ offset: props.contentOffset?.x ?? 0, viewport: 0, content: 0 });
  const [edges, setEdges] = React.useState<Edges>({ left: false, right: false });
  const lastEdges = React.useRef(edges);
  const update = React.useCallback(() => {
    const { offset, viewport, content } = metrics.current;
    const next = horizontalScrollEdges(offset, viewport, content);
    if (next.left !== lastEdges.current.left || next.right !== lastEdges.current.right) {
      lastEdges.current = next;
      setEdges(next);
    }
  }, []);
  const handleScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    metrics.current.offset = contentOffset.x;
    if (layoutMeasurement?.width > 0) metrics.current.viewport = layoutMeasurement.width;
    if (contentSize?.width >= 0) metrics.current.content = contentSize.width;
    update();
    onScroll?.(event);
  }, [onScroll, update]);
  const animatedScroll = React.useMemo(() => animatedOffset ? Animated.event(
    [{ nativeEvent: { contentOffset: { x: animatedOffset } } }],
    { useNativeDriver: Platform.OS !== 'web', listener: handleScroll }
  ) : handleScroll, [animatedOffset, handleScroll]);
  const Component = (kind === 'animated' ? Animated.ScrollView : kind === 'gesture' ? GestureScrollView : ScrollView) as unknown as React.ComponentType<ScrollViewProps & React.RefAttributes<ScrollView>>;
  const scroll = <Component {...props} ref={ref} horizontal showsHorizontalScrollIndicator={props.showsHorizontalScrollIndicator ?? false}
    style={S.scroll} scrollEventThrottle={scrollEventThrottle}
    onLayout={(event) => { metrics.current.viewport = event.nativeEvent.layout.width; update(); onLayout?.(event); }}
    onContentSizeChange={(width, height) => { metrics.current.content = width; update(); onContentSizeChange?.(width, height); }}
    onScroll={animatedScroll}>{children}</Component>;
  if (fadeMode === 'mask') {
    return <HorizontalFadeMask {...edges} width={fadeWidth} style={[S.frame, style]}>{scroll}</HorizontalFadeMask>;
  }
  return <View style={[S.frame, style]}>{scroll}<HorizontalFadeEdges {...edges} color={fadeColor} width={fadeWidth} /></View>;
});

const S = StyleSheet.create({
  frame: { position: 'relative', flexGrow: 0, alignSelf: 'stretch', overflow: 'hidden' },
  scroll: { flexGrow: 0 },
  edge: { position: 'absolute', top: 0, bottom: 0, zIndex: 10 },
  mask: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' },
  maskCenter: { flex: 1, backgroundColor: '#000000' },
});
