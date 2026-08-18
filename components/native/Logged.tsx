import { useState, type Ref } from 'react';
import {
  Pressable,
  ScrollView,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewProps,
  type TextInputProps,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_IN = { duration: 90, easing: Easing.out(Easing.quad) };
const PRESS_OUT = { duration: 160, easing: Easing.out(Easing.quad) };

/**
 * Drop-in replacements for raw RN primitives that add native Apple tactile press scaling.
 */
export function LoggedPressable({
  onPress,
  onPressIn,
  onPressOut,
  style,
  ...rest
}: PressableProps & { ref?: Ref<View> }) {
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const [pressed, setPressed] = useState(false);

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        setPressed(true);
        scale.value = withTiming(0.97, PRESS_IN);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        scale.value = withTiming(1, PRESS_OUT);
        onPressOut?.(event);
      }}
      style={[
        typeof style === 'function'
          ? style({ pressed, hovered: false })
          : style,
        pressStyle,
      ]}
      onPress={(event) => {
        onPress?.(event);
      }}
    />
  );
}

export function LoggedTextInput({
  label,
  onChangeText,
  onFocus,
  onBlur,
  onSubmitEditing,
  ...rest
}: TextInputProps & { label?: string; ref?: Ref<TextInput> }) {
  return (
    <TextInput
      {...rest}
      onChangeText={onChangeText}
      onFocus={onFocus}
      onBlur={onBlur}
      onSubmitEditing={onSubmitEditing}
    />
  );
}

export function LoggedScrollView({
  label,
  onScroll,
  ...rest
}: ScrollViewProps & { label?: string }) {
  return (
    <ScrollView
      {...rest}
      scrollEventThrottle={rest.scrollEventThrottle ?? 200}
      onScroll={onScroll}
    />
  );
}
