import React from 'react';
import { Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, View, useWindowDimensions, type ModalProps } from 'react-native';
import Motion, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WithoutGlassBackdrop } from './GlassBackdrop';

type PlayerModalProps = Omit<ModalProps, 'animationType' | 'presentationStyle' | 'transparent'> & {
  fullScreen?: boolean;
  sharedArtworkTransition?: boolean;
  artworkFlightProgress?: SharedValue<number>;
  artworkDestinationY?: number;
  artworkOverlay?: React.ReactNode;
  artworkOverlayRef?: React.RefObject<View | null>;
  closing?: boolean;
  dismissEnabled?: boolean;
  scrollOffset?: React.RefObject<number>;
};

export const shouldDismissSheet = (distance: number, velocity: number) =>
  distance > 96 || (distance > 24 && velocity > 0.65);

/** Content sheets hug their contents; only the music player owns a full page sheet. */
export function PlayerModal({ children, fullScreen = false, sharedArtworkTransition = false,
  artworkFlightProgress, artworkDestinationY, artworkOverlay, artworkOverlayRef, closing = false, dismissEnabled = true,
  scrollOffset, ...props }: PlayerModalProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const dragY = useSharedValue(0);
  const dragStart = React.useRef(0);
  const dragDismissPending = React.useRef(false);
  const dismissalEnabledRef = React.useRef(dismissEnabled && !closing);
  dismissalEnabledRef.current = dismissEnabled && !closing;
  const translateY = React.useRef(new Animated.Value(0)).current;
  const closeRef = React.useRef(props.onRequestClose);
  closeRef.current = props.onRequestClose;
  const offsetRef = React.useRef(scrollOffset);
  offsetRef.current = scrollOffset;
  const surfaceRef = React.useRef<View>(null);
  const surfaceTop = React.useRef(fullScreen ? insets.top + 8 : 0);
  React.useEffect(() => {
    translateY.stopAnimation(); translateY.setValue(0);
    cancelAnimation(dragY); dragY.value = 0;
    dragDismissPending.current = false;
  }, [props.visible, translateY, dragY]);
  const restorePosition = React.useCallback(() => {
    if (fullScreen && sharedArtworkTransition) {
      dragY.value = reduceMotion ? 0 : withSpring(0, { damping: 24, stiffness: 260 });
    } else Animated.spring(translateY, { toValue: 0, useNativeDriver: Platform.OS !== 'web', damping: 24, stiffness: 260 }).start();
  }, [dragY, fullScreen, reduceMotion, sharedArtworkTransition, translateY]);
  const surfaceMotionStyle = useAnimatedStyle(() => {
    const progress = closing ? (artworkFlightProgress?.value ?? 0) : 0;
    // The sheet reaches the mini cover alongside the artwork, then disappears
    // in that same flight instead of outrunning the cover to the window bottom.
    const destination = Math.max(dragY.value, artworkDestinationY ?? height);
    return {
      transform: [{ translateY: dragY.value + (destination - dragY.value) * progress }],
      opacity: artworkDestinationY === undefined ? 1 : Math.min(1, (1 - progress) / 0.2),
    };
  }, [artworkDestinationY, artworkFlightProgress, closing, height]);
  const backdropMotionStyle = useAnimatedStyle(() => {
    const progress = closing ? (artworkFlightProgress?.value ?? 0) : 0;
    const distance = dragY.value + (height - dragY.value) * progress;
    return { opacity: Math.max(0, 1 - distance / height) };
  }, [artworkFlightProgress, closing, height]);
  const responder = React.useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => (!fullScreen || sharedArtworkTransition) &&
      dismissalEnabledRef.current && !dragDismissPending.current &&
      (gesture.y0 < surfaceTop.current + (fullScreen && sharedArtworkTransition ? dragY.value : 0) + 104 ||
        (offsetRef.current !== undefined && offsetRef.current.current <= 0)) &&
      gesture.dy > 8 && gesture.dy > Math.abs(gesture.dx) * 1.4,
    onPanResponderGrant: () => {
      cancelAnimation(dragY);
      dragStart.current = dragY.value;
    },
    onPanResponderMove: (_, gesture) => {
      if (fullScreen && sharedArtworkTransition) dragY.value = Math.max(0, dragStart.current + gesture.dy);
      else translateY.setValue(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (event, gesture) => {
      if (shouldDismissSheet(gesture.dy, gesture.vy) && closeRef.current) {
        if (sharedArtworkTransition && fullScreen) {
          dragDismissPending.current = true;
          closeRef.current(event);
          return;
        }
        Animated.timing(translateY, { toValue: 700, duration: 180, useNativeDriver: Platform.OS !== 'web' })
          .start(({ finished }) => { if (finished) closeRef.current?.(event); });
      } else restorePosition();
    },
    onPanResponderTerminationRequest: () => !fullScreen || !sharedArtworkTransition,
    onPanResponderTerminate: restorePosition,
  }), [dragY, fullScreen, restorePosition, sharedArtworkTransition, translateY]);
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
  if (sharedArtworkTransition) {
    return (
      <Modal {...props} testID="player-modal" animationType="none" transparent presentationStyle="overFullScreen">
        <View style={[styles.artworkLayout, { paddingTop: insets.top + 8 }]}>
          <Motion.View pointerEvents="none" testID="player-modal-backdrop" style={[styles.backdrop, backdropMotionStyle]} />
          <Motion.View ref={surfaceRef} collapsable={false}
            onLayout={() => surfaceRef.current?.measureInWindow((_, y) => { surfaceTop.current = y; })}
            {...responder.panHandlers} testID="player-modal-surface"
            style={[styles.surface, styles.fullSurface, styles.artworkSurface, surfaceMotionStyle]}>
            <WithoutGlassBackdrop>{children}</WithoutGlassBackdrop>
          </Motion.View>
          {/* Keep the flying cover outside the moving sheet, in stationary window coordinates. */}
          <View ref={artworkOverlayRef} collapsable={false} pointerEvents="none"
            testID="player-modal-artwork-layer"
            style={[StyleSheet.absoluteFill, { top: insets.top + 8 }]}>
            {artworkOverlay}
          </View>
        </View>
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
  artworkLayout: { flex: 1 },
  artworkSurface: { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
});
