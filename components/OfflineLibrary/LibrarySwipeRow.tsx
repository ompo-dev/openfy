import * as React from 'react';
import { StyleSheet } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { AppIcon, LoggedPressable } from '../native';

const ACTION_WIDTH = 80;

function RemoveAction({ translation, label, onPress, undo, disabled }: {
  translation: SharedValue<number>; label: string; onPress: () => void; undo: boolean; disabled: boolean;
}) {
  const motion = useAnimatedStyle(() => ({ transform: [{ translateX: Math.max(0, ACTION_WIDTH + translation.value) }] }));
  return <Animated.View testID="library-remove-action" style={[styles.action, undo && styles.undo, motion]}>
    <LoggedPressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={styles.button}>
      <AppIcon name={undo ? 'arrow-undo' : 'trash-outline'} size={24} color="#FFFFFF" />
    </LoggedPressable>
  </Animated.View>;
}

/** The entire row, including native download icons, moves on the UI thread. */
export function LibrarySwipeRow({ children, label, onRemove, onWillOpen, disabled = false, undo = false, backgroundColor = '#121212' }: {
  children: React.ReactNode; label: string; onRemove: () => void; onWillOpen: (close: () => void) => void;
  disabled?: boolean; undo?: boolean; backgroundColor?: string;
}) {
  const ref = React.useRef<SwipeableMethods>(null);
  const close = React.useCallback(() => ref.current?.close(), []);
  return <Swipeable ref={ref} testID="library-swipe-row" enabled={!disabled} friction={1} rightThreshold={32}
    dragOffsetFromRightEdge={16} overshootLeft={false} overshootRight={false}
    containerStyle={[styles.container, { backgroundColor }]} childrenContainerStyle={{ backgroundColor }}
    onSwipeableWillOpen={() => onWillOpen(close)}
    renderRightActions={(_progress, translation) => <RemoveAction translation={translation} label={label} undo={undo} disabled={disabled}
      onPress={() => { close(); onRemove(); }} />}>
    {children}
  </Swipeable>;
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: '#121212' },
  undo: { backgroundColor: '#228B55' },
  action: { width: ACTION_WIDTH, backgroundColor: '#E5484D' },
  button: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 64 },
});
