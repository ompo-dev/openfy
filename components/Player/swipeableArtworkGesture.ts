export type SwipeDirection = 'previous' | 'next';

export type SwipeGestureInput = {
  translationX: number;
  translationY: number;
  velocityX: number;
  velocityY?: number;
  size: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
};

export const SWIPE_DISTANCE_RATIO = 0.22;
export const SWIPE_VELOCITY_THRESHOLD = 720;
export const HORIZONTAL_ACTIVATION_DISTANCE = 10;
export const VERTICAL_CANCEL_DISTANCE = 16;

export const clampArtworkDrag = (
  translationX: number,
  size: number,
  canGoPrevious: boolean,
  canGoNext: boolean
) => {
  'worklet';

  const maxPreviewOffset = size;

  if (translationX > 0 && !canGoPrevious) {
    return Math.min(translationX * 0.18, maxPreviewOffset * 0.14);
  }

  if (translationX < 0 && !canGoNext) {
    return Math.max(translationX * 0.18, -maxPreviewOffset * 0.14);
  }

  return Math.max(-maxPreviewOffset, Math.min(maxPreviewOffset, translationX));
};

export const shouldCaptureArtworkSwipe = (
  translationX: number,
  translationY: number
) => {
  'worklet';

  return (
    Math.abs(translationX) >= HORIZONTAL_ACTIVATION_DISTANCE &&
    Math.abs(translationX) > Math.abs(translationY) * 1.35
  );
};

export const shouldCancelArtworkSwipe = (
  translationX: number,
  translationY: number
) => {
  'worklet';

  return (
    Math.abs(translationY) >= VERTICAL_CANCEL_DISTANCE &&
    Math.abs(translationY) > Math.abs(translationX)
  );
};

export const resolveArtworkSwipe = ({
  translationX,
  translationY,
  velocityX,
  velocityY = 0,
  size,
  canGoPrevious,
  canGoNext,
}: SwipeGestureInput): SwipeDirection | null => {
  'worklet';

  if (
    shouldCancelArtworkSwipe(translationX, translationY) ||
    Math.abs(velocityY) > Math.abs(velocityX) * 1.25
  ) {
    return null;
  }

  const distanceThreshold = size * SWIPE_DISTANCE_RATIO;
  const wantsPrevious =
    translationX >= distanceThreshold ||
    (translationX > HORIZONTAL_ACTIVATION_DISTANCE &&
      velocityX >= SWIPE_VELOCITY_THRESHOLD);
  const wantsNext =
    translationX <= -distanceThreshold ||
    (translationX < -HORIZONTAL_ACTIVATION_DISTANCE &&
      velocityX <= -SWIPE_VELOCITY_THRESHOLD);

  if (wantsPrevious && canGoPrevious) return 'previous';
  if (wantsNext && canGoNext) return 'next';

  return null;
};

export const createSwipeCallbackGate = () => {
  let locked = false;

  return {
    isLocked: () => locked,
    reset: () => {
      locked = false;
    },
    run: (callback: () => void | Promise<void>, onSettled?: () => void) => {
      if (locked) return false;

      locked = true;
      const settle = () => {
        locked = false;
        onSettled?.();
      };

      try {
        const result = callback();

        if (result && typeof result.then === 'function') {
          void result.then(settle, settle);
        } else {
          void Promise.resolve().then(settle);
        }
      } catch {
        settle();
      }

      return true;
    },
  };
};
