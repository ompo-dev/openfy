import React from 'react';
import { Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, View, type ModalProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WithoutGlassBackdrop } from './GlassBackdrop';

type PlayerModalProps = Omit<ModalProps, 'animationType' | 'presentationStyle' | 'transparent'> & {
  fullScreen?: boolean;
  scrollOffset?: React.RefObject<number>;
};

export const shouldDismissSheet = (distance: number, velocity: number) =>
  distance > 96 || (distance > 24 && velocity > 0.65);

/** Content sheets hug their contents; only the music player owns a full page sheet. */
export function PlayerModal({ children, fullScreen = false, scrollOffset, ...props }: PlayerModalProps) {
  const insets = useSafeAreaInsets();
  const translateY = React.useRef(new Animated.Value(0)).current;
  const closeRef = React.useRef(props.onRequestClose);
  closeRef.current = props.onRequestClose;
  const offsetRef = React.useRef(scrollOffset);
  offsetRef.current = scrollOffset;
  const surfaceRef = React.useRef<View>(null);
  const surfaceTop = React.useRef(0);
  React.useEffect(() => { translateY.stopAnimation(); translateY.setValue(0); }, [props.visible, translateY]);
  const responder = React.useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => !fullScreen &&
      (gesture.y0 < surfaceTop.current + 104 ||
        (offsetRef.current !== undefined && offsetRef.current.current <= 0)) &&
      gesture.dy > 8 && gesture.dy > Math.abs(gesture.dx) * 1.4,
    onPanResponderMove: (_, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (event, gesture) => {
      if (shouldDismissSheet(gesture.dy, gesture.vy) && closeRef.current) {
        Animated.timing(translateY, { toValue: 700, duration: 180, useNativeDriver: Platform.OS !== 'web' })
          .start(({ finished }) => { if (finished) closeRef.current?.(event); });
      } else Animated.spring(translateY, { toValue: 0, useNativeDriver: Platform.OS !== 'web', damping: 24, stiffness: 260 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(translateY, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start(),
  }), [fullScreen, translateY]);
  if (!fullScreen) {
    return (
      <Modal {...props} testID="player-modal" animationType="slide" transparent presentationStyle="overFullScreen">
        <KeyboardAvoidingView testID="player-modal-layout" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.layout, { paddingTop: insets.top + 12, paddingBottom: Math.max(12, insets.bottom), paddingHorizontal: 12 }]}>
          <Pressable testID="player-modal-backdrop" style={styles.backdrop} onPress={props.onRequestClose} />
          <Animated.View ref={surfaceRef} onLayout={() => surfaceRef.current?.measureInWindow((_, y) => { surfaceTop.current = y; })}
            {...responder.panHandlers} testID="player-modal-surface"
            style={[styles.surface, styles.fittedSurface, { transform: [{ translateY }] }]}>
            <WithoutGlassBackdrop>{children}</WithoutGlassBackdrop>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }
  return (
    <Modal {...props} allowSwipeDismissal={!!props.onRequestClose} testID="player-modal" animationType="slide" presentationStyle="pageSheet">
      <View testID="player-modal-surface" style={[styles.surface, styles.fullSurface]}>
        <WithoutGlassBackdrop>{children}</WithoutGlassBackdrop>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, justifyContent: 'flex-end', minHeight: 0 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)' },
  surface: { minHeight: 0, backgroundColor: '#101116', overflow: 'hidden', width: '100%' },
  fittedSurface: { flexShrink: 1, maxHeight: '90%', borderRadius: 28 },
  fullSurface: { flex: 1 },
});
