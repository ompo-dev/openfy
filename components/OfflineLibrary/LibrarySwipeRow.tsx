import * as React from 'react';
import { StyleSheet } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { AppIcon, LoggedPressable } from '../native';

const ACTION_WIDTH = 80;

function RemoveAction({ translation, label, onPress }: {
  translation: SharedValue<number>; label: string; onPress: () => void;
}) {
  const motion = useAnimatedStyle(() => ({ transform: [{ translateX: Math.max(0, ACTION_WIDTH + translation.value) }] }));
  return <Animated.View testID="library-remove-action" style={[styles.action, motion]}>
    <LoggedPressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.button}>
      <AppIcon name="trash-outline" size={24} color="#FFFFFF" />
    </LoggedPressable>
  </Animated.View>;
}

/** The entire row, including native download icons, moves on the UI thread. */
export function LibrarySwipeRow({ children, label, onRemove, onWillOpen }: {
  children: React.ReactNode; label: string; onRemove: () => void; onWillOpen: (close: () => void) => void;
}) {
  const ref = React.useRef<SwipeableMethods>(null);
  const close = React.useCallback(() => ref.current?.close(), []);
  return <Swipeable ref={ref} testID="library-swipe-row" friction={1} rightThreshold={32}
    dragOffsetFromRightEdge={16} overshootLeft={false} overshootRight={false}
    containerStyle={styles.container} childrenContainerStyle={styles.foreground}
    onSwipeableWillOpen={() => onWillOpen(close)}
    renderRightActions={(_progress, translation) => <RemoveAction translation={translation} label={label}
      onPress={() => { close(); onRemove(); }} />}>
    {children}
  </Swipeable>;
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: '#121212' },
  foreground: { backgroundColor: '#121212' },
  action: { width: ACTION_WIDTH, backgroundColor: '#E5484D' },
  button: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 64 },
});
