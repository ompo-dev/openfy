import React from 'react';
import { PanResponder, View, useWindowDimensions, type ModalProps } from 'react-native';
import { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useMotionPreferences as useReducedMotion } from '../../hooks/useMotionPreferences';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WithoutGlassBackdrop } from './GlassBackdrop';
import { SheetFrame as GymSheetFrame } from '../../vendor/gym-notes/src/components/organisms/SheetFrame';

type PlayerModalProps = Omit<ModalProps, 'animationType' | 'presentationStyle' | 'transparent' | 'onRequestClose'> & {
  onRequestClose?: () => void;
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

/** Gym owns the modal; this coordinator keeps header gestures and the cover flight on one clock. */
export function PlayerModal({ children, fullScreen = false, sharedArtworkTransition = false,
  artworkFlightProgress, artworkDestinationY, artworkOverlay, artworkOverlayRef, closing = false, dismissEnabled = true,
  scrollOffset: _scrollOffset, ...props }: PlayerModalProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const dragY = useSharedValue(0);
  const dragStart = React.useRef(0);
  const dragDismissPending = React.useRef(false);
  const dismissalEnabledRef = React.useRef(dismissEnabled && !closing);
  dismissalEnabledRef.current = dismissEnabled && !closing;
  const closeRef = React.useRef(props.onRequestClose);
  closeRef.current = props.onRequestClose;
  const surfaceRef = React.useRef<View>(null);
  const surfaceTop = React.useRef(fullScreen ? insets.top + 8 : 0);
  React.useEffect(() => {
    cancelAnimation(dragY); dragY.value = 0;
    dragDismissPending.current = false;
  }, [props.visible, dragY]);
  const completeClose = React.useCallback(() => closeRef.current?.(), []);
  const restorePosition = React.useCallback(() => {
    dragY.value = reduceMotion ? 0 : withSpring(0, { damping: 24, stiffness: 260 });
  }, [dragY, reduceMotion]);
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
    onMoveShouldSetPanResponderCapture: (_, gesture) => fullScreen &&
      dismissalEnabledRef.current && !dragDismissPending.current &&
      gesture.y0 >= surfaceTop.current &&
      gesture.y0 < surfaceTop.current + (fullScreen && sharedArtworkTransition ? dragY.value : 0) + 104 &&
      gesture.dy > 8 && gesture.dy > Math.abs(gesture.dx) * 1.4,
    onPanResponderGrant: () => {
      cancelAnimation(dragY);
      dragStart.current = dragY.value;
    },
    onPanResponderMove: (_, gesture) => {
      dragY.value = Math.max(0, dragStart.current + gesture.dy);
    },
    onPanResponderRelease: (_, gesture) => {
      if (shouldDismissSheet(gesture.dy, gesture.vy) && closeRef.current) {
        if (sharedArtworkTransition && fullScreen) {
          dragDismissPending.current = true;
          closeRef.current();
          return;
        }
        dragDismissPending.current = true;
        dragY.value = withTiming(height, { duration: reduceMotion ? 0 : 180 }, (finished) => {
          if (finished) runOnJS(completeClose)();
        });
      } else restorePosition();
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: restorePosition,
  }), [completeClose, dragY, fullScreen, height, reduceMotion, restorePosition, sharedArtworkTransition]);
  return <GymSheetFrame visible={props.visible ?? false} title="" onClose={() => closeRef.current?.()}
    onShow={props.onShow} onDismiss={props.onDismiss} testID="player-modal" chrome={false}
    size={fullScreen ? 'full' : 'sheet'} scroll={false}
    transition={fullScreen ? {
      surfaceStyle: surfaceMotionStyle, backdropStyle: backdropMotionStyle,
      panHandlers: responder.panHandlers, surfaceRef,
      onSurfaceLayout: () => surfaceRef.current?.measureInWindow((_, y) => { surfaceTop.current = y; }),
      overlay: artworkOverlay, overlayRef: artworkOverlayRef,
    } : undefined}>
    <WithoutGlassBackdrop>{children}</WithoutGlassBackdrop>
  </GymSheetFrame>;
}
