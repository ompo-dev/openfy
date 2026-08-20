/**
 * MarqueeText Component
 * Smooth marquee text that scrolls horizontally when text overflows the container,
 * with customizable alignment (left or center) and subtle left/right gradient alpha fade masks.
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

interface MarqueeTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  speed?: number; // pixels per second
  delay?: number; // ms delay before scroll
  fadeWidth?: number;
  align?: 'left' | 'center';
}

export const MarqueeText: React.FC<MarqueeTextProps> = ({
  text,
  style,
  containerStyle,
  speed = 28,
  delay = 1800,
  fadeWidth = 8,
  align = 'left',
}) => {
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [textWidth, setTextWidth] = React.useState(0);
  const scrollAnim = React.useRef(new Animated.Value(0)).current;
  const isOverflowing = textWidth > containerWidth && containerWidth > 0;

  React.useEffect(() => {
    if (!isOverflowing) {
      scrollAnim.setValue(0);
      return;
    }

    const distance = textWidth - containerWidth + fadeWidth * 2;
    const duration = Math.max(2000, (distance / speed) * 1000);

    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(scrollAnim, {
          toValue: -distance,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.delay(delay),
        Animated.timing(scrollAnim, {
          toValue: 0,
          duration: duration * 0.8,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [isOverflowing, textWidth, containerWidth, speed, delay, fadeWidth, scrollAnim]);

  const onContainerLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  const onTextLayout = (e: LayoutChangeEvent) => {
    setTextWidth(e.nativeEvent.layout.width);
  };

  const isCenter = align === 'center';

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
      <Animated.View
        style={{
          transform: [{ translateX: scrollAnim }],
          flexDirection: 'row',
          justifyContent: isOverflowing
            ? 'flex-start'
            : isCenter
            ? 'center'
            : 'flex-start',
          alignItems: 'center',
          width: isOverflowing ? undefined : '100%',
        }}
      >
        <Text
          onLayout={onTextLayout}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    width: '100%',
  },
  text: {
    flexShrink: 0,
  },
});
