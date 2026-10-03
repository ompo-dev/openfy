import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

type Props = {
  current: string;
  previous: string;
  next: string;
  progress: SharedValue<number>;
};

export const ArtworkBackground = React.memo(function ArtworkBackground({
  current, previous, next, progress,
}: Props) {
  const previousStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, progress.value)),
  }));
  const nextStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, -progress.value)),
  }));
  const cover = (uri: string) => uri ? (
    <Image source={{ uri }} cachePolicy="memory-disk" contentFit="cover"
      blurRadius={28} style={StyleSheet.absoluteFill} />
  ) : null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.background]}>
      {cover(current)}
      <Animated.View style={[StyleSheet.absoluteFill, previousStyle]}>{cover(previous)}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, nextStyle]}>{cover(next)}</Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  background: { opacity: 0.64, transform: [{ scale: 1.1 }] },
});
