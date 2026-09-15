import {
  clampArtworkDrag,
  createSwipeCallbackGate,
  resolveArtworkSwipe,
  shouldCancelArtworkSwipe,
  shouldCaptureArtworkSwipe,
} from '../swipeableArtworkGesture';

describe('swipeable artwork gesture helpers', () => {
  it('captures only horizontal intent', () => {
    expect(shouldCaptureArtworkSwipe(18, 4)).toBe(true);
    expect(shouldCaptureArtworkSwipe(8, 1)).toBe(false);
    expect(shouldCaptureArtworkSwipe(18, 20)).toBe(false);
  });

  it('cancels vertical drags before they become track navigation', () => {
    expect(shouldCancelArtworkSwipe(8, 24)).toBe(true);
    expect(shouldCancelArtworkSwipe(30, 18)).toBe(false);
  });

  it('resolves previous and next swipes by distance or velocity', () => {
    const base = {
      translationY: 0,
      velocityY: 0,
      size: 320,
      canGoPrevious: true,
      canGoNext: true,
    };

    expect(
      resolveArtworkSwipe({ ...base, translationX: 90, velocityX: 80 })
    ).toBe('previous');
    expect(
      resolveArtworkSwipe({ ...base, translationX: -90, velocityX: -80 })
    ).toBe('next');
    expect(
      resolveArtworkSwipe({ ...base, translationX: 20, velocityX: 900 })
    ).toBe('previous');
    expect(
      resolveArtworkSwipe({ ...base, translationX: -20, velocityX: -900 })
    ).toBe('next');
  });

  it('does not resolve swipes at the queue edges or for vertical movement', () => {
    expect(
      resolveArtworkSwipe({
        translationX: 120,
        translationY: 0,
        velocityX: 900,
        size: 320,
        canGoPrevious: false,
        canGoNext: true,
      })
    ).toBeNull();
    expect(
      resolveArtworkSwipe({
        translationX: -120,
        translationY: 0,
        velocityX: -900,
        size: 320,
        canGoPrevious: true,
        canGoNext: false,
      })
    ).toBeNull();
    expect(
      resolveArtworkSwipe({
        translationX: 80,
        translationY: 120,
        velocityX: 900,
        velocityY: 1300,
        size: 320,
        canGoPrevious: true,
        canGoNext: true,
      })
    ).toBeNull();
  });

  it('bounds preview drag and resists missing neighbors', () => {
    expect(clampArtworkDrag(500, 300, true, true)).toBe(300);
    expect(clampArtworkDrag(-500, 300, true, true)).toBe(-300);
    expect(clampArtworkDrag(100, 300, false, true)).toBe(18);
    expect(clampArtworkDrag(-100, 300, true, false)).toBe(-18);
  });

  it('gates callbacks until an async swipe finishes or the parent resets it', async () => {
    const gate = createSwipeCallbackGate();
    const callback = jest.fn();
    let resolve!: () => void;
    const asyncCallback = jest.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        })
    );

    expect(gate.run(asyncCallback)).toBe(true);
    expect(gate.run(callback)).toBe(false);
    expect(callback).not.toHaveBeenCalled();

    resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(gate.run(callback)).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);

    gate.reset();
    expect(gate.isLocked()).toBe(false);
  });

  it('cleans the gate after sync no-op callbacks', async () => {
    const gate = createSwipeCallbackGate();
    const callback = jest.fn();
    const onSettled = jest.fn();

    expect(gate.run(callback, onSettled)).toBe(true);
    expect(gate.run(callback)).toBe(false);

    await Promise.resolve();

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(gate.run(callback)).toBe(true);
  });

  it('cleans the gate after thrown or rejected callbacks without unhandled rejections', async () => {
    const gate = createSwipeCallbackGate();
    const onSettled = jest.fn();

    expect(
      gate.run(() => {
        throw new Error('navigation failed');
      }, onSettled)
    ).toBe(true);
    expect(gate.isLocked()).toBe(false);
    expect(onSettled).toHaveBeenCalledTimes(1);

    expect(
      gate.run(
        () => Promise.reject(new Error('async navigation failed')),
        onSettled
      )
    ).toBe(true);
    expect(gate.run(jest.fn())).toBe(false);

    await Promise.resolve();

    expect(gate.isLocked()).toBe(false);
    expect(onSettled).toHaveBeenCalledTimes(2);
  });
});
