/**
 * MarqueeText Component
 * Reliable horizontal marquee ticker that scrolls when text exceeds container width.
 * Features:
 * - Hidden unconstrained layout measurement to reliably detect overflow
 * - Smooth continuous back-and-forth marquee animation
 * - Left and right gradient fade masks (using CSS mask on web or background-matching fade overlays)
 */

import * as React from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';

interface MarqueeTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  speed?: number; // pixels per second
  delay?: number; // ms delay before starting
  fadeWidth?: number;
  fadeColor?: string; // Kept for callers; native fade is now an alpha mask.
  align?: 'left' | 'center';
}

export const MarqueeText: React.FC<MarqueeTextProps> = ({
  text,
  style,
  containerStyle,
  speed = 22,
  delay = 1400,
  fadeWidth = 10,
  fadeColor: _fadeColor,
  align = 'left',
}) => {
  void _fadeColor;
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [measuredTextWidth, setMeasuredTextWidth] = React.useState(0);
  const scrollAnim = React.useRef(new Animated.Value(0)).current;

  const isOverflowing = measuredTextWidth > containerWidth + 2 && containerWidth > 0;

  React.useEffect(() => {
    if (!isOverflowing) {
      scrollAnim.setValue(0);
      return;
    }

    const distance = measuredTextWidth - containerWidth + fadeWidth * 1.5;
    const duration = Math.max(1800, (distance / speed) * 1000);

    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(scrollAnim, {
          toValue: -distance,
          duration,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.delay(delay),
        Animated.timing(scrollAnim, {
          toValue: 0,
          duration: duration * 0.75,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [isOverflowing, measuredTextWidth, containerWidth, speed, delay, fadeWidth, scrollAnim]);

  const onContainerLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (Math.abs(w - containerWidth) > 1) {
      setContainerWidth(w);
    }
  };

  const onMeasureLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (Math.abs(w - measuredTextWidth) > 1) {
      setMeasuredTextWidth(w);
    }
  };

  const isCenter = align === 'center';

  const animatedText = (
    <Animated.View
      style={{
        transform: [{ translateX: scrollAnim }],
        flexDirection: 'row',
        justifyContent: isOverflowing ? 'flex-start' : isCenter ? 'center' : 'flex-start',
        alignItems: 'center',
        width: isOverflowing ? undefined : '100%',
      }}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.text,
          style,
          !isOverflowing && { textAlign: isCenter ? 'center' : 'left' },
        ]}
      >
        {text}
      </Text>
    </Animated.View>
  );

  return (
    <View
      onLayout={onContainerLayout}
      style={[
        styles.container,
        {
          alignItems: isCenter ? 'center' : 'flex-start',
          justifyContent: isCenter ? 'center' : 'flex-start',
        },
        containerStyle,
        isOverflowing && Platform.OS === 'web'
          ? ({
              maskImage: `linear-gradient(to right, transparent 0px, black ${fadeWidth}px, black calc(100% - ${fadeWidth}px), transparent 100%)`,
              WebkitMaskImage: `linear-gradient(to right, transparent 0px, black ${fadeWidth}px, black calc(100% - ${fadeWidth}px), transparent 100%)`,
            } as any)
          : undefined,
      ]}
    >
      {/* Hidden full text measurement layer without width restrictions */}
      <View style={[styles.measureContainer, { pointerEvents: 'none' }]}>
        <Text
          onLayout={onMeasureLayout}
          numberOfLines={1}
          style={[styles.text, style, styles.measureText]}
        >
          {text}
        </Text>
      </View>

      {isOverflowing && Platform.OS !== 'web' ? (
        <MaskedView
          style={styles.nativeMask}
          maskElement={
            <View style={styles.nativeMask}>
              <LinearGradient
                colors={['transparent', '#000000', '#000000', 'transparent']}
                locations={[0, 0.08, 0.92, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
          }
        >
          {animatedText}
        </MaskedView>
      ) : (
        animatedText
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    width: '100%',
    position: 'relative',
  },
  measureContainer: {
    position: 'absolute',
    opacity: 0,
    top: -9999,
    left: 0,
    flexDirection: 'row',
  },
  measureText: {
    flexShrink: 0,
    includeFontPadding: false,
  },
  text: {
    flexShrink: 0,
  },
  nativeMask: { alignSelf: 'stretch' },
});
