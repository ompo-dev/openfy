import { act, renderHook } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import * as Motion from 'react-native-reanimated';
import { useLyricsArtworkTransition } from '../useLyricsArtworkTransition';

const measure = (x: number, y: number, width: number, height: number) => ({
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(x, y, width, height),
}) as View;

describe('lyrics artwork transition', () => {
  let completions: (() => void)[];
  beforeEach(() => {
    completions = [];
    jest.spyOn(Motion, 'useReducedMotion').mockReturnValue(false);
    jest.spyOn(Motion, 'withTiming').mockImplementation((value, _config, callback) => {
      if (callback) completions.push(() => callback(true, value));
      return value;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  const mount = async () => {
    const hook = await renderHook(({ trackKey, lyricsVisible }) =>
      useLyricsArtworkTransition(true, trackKey, 'cover.jpg', 320, lyricsVisible),
    { initialProps: { trackKey: 'first', lyricsVisible: false } });
    hook.result.current.containerRef.current = measure(0, 60, 393, 700);
    hook.result.current.mediaRef.current = measure(24, 164, 345, 380);
    hook.result.current.rowRef.current = measure(24, 552, 345, 50);
    hook.result.current.captureFrames();
    return hook;
  };

  it('moves one cached image to the pill and back with matching measured centers and scales', async () => {
    const hook = await mount();
    const update = jest.fn();
    await act(() => hook.result.current.transition(true, update));
    expect(hook.result.current.overlay!.props.style[1].transform[2].scale).toBe(1);
    // The test worklet is static; render the next frame after the shared clock starts.
    await hook.rerender({ trackKey: 'first', lyricsVisible: false });
    let style = StyleSheet.flatten(hook.result.current.overlay!.props.style);
    expect(style.left + 160 + style.transform[0].translateX).toBe(62);
    expect(style.top + 160 + style.transform[1].translateY).toBe(517);
    expect(style.transform[2].scale).toBe(36 / 320);
    expect(style.borderRadius * style.transform[2].scale).toBe(10);
    expect(update).toHaveBeenCalledTimes(1);
    expect(Motion.withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 460 }), expect.any(Function));
    await act(() => completions[0]());
    expect(hook.result.current.overlay).toBeNull();

    await hook.rerender({ trackKey: 'first', lyricsVisible: true });
    await act(() => hook.result.current.transition(false, update));
    expect(hook.result.current.overlay!.props.style[1].transform[2].scale).toBe(36 / 320);
    await hook.rerender({ trackKey: 'first', lyricsVisible: true });
    style = StyleSheet.flatten(hook.result.current.overlay!.props.style);
    expect(style.left + 160 + style.transform[0].translateX).toBe(196.5);
    expect(style.top + 160 + style.transform[1].translateY).toBe(264);
    expect(style.transform[2].scale).toBe(1);
    expect(style.borderRadius).toBe(16);
    await act(() => completions[1]());
    expect(hook.result.current.overlay).toBeNull();
  });

  it('cancels an old cover flight when the track changes', async () => {
    const hook = await mount();
    await act(() => hook.result.current.transition(true, jest.fn()));
    expect(hook.result.current.transitioning).toBe(true);
    await hook.rerender({ trackKey: 'replacement', lyricsVisible: true });
    expect(hook.result.current.transitioning).toBe(false);
    await act(() => completions[0]());
    expect(hook.result.current.overlay).toBeNull();
  });

  it('uses the lyrics renderer, timing and curve for the mini-player flight in both directions', async () => {
    const hook = await mount();
    const mini = { x: 34, y: 590, width: 36, height: 36 };
    const cover = { x: 36.5, y: 104, width: 320, height: 320 };
    await act(() => hook.result.current.transition(true, jest.fn()));
    const lyricsTiming = jest.mocked(Motion.withTiming).mock.calls[0][1];
    await act(() => completions[0]());

    const complete = jest.fn();
    await act(() => hook.result.current.flyBetweenFrames(mini, cover, 'mini.jpg', complete));
    expect(hook.result.current.overlay!.props.testID).toBe('player-artwork-transition');
    expect(hook.result.current.overlay!.props.children.props).toMatchObject({
      source: { uri: 'mini.jpg' }, transition: 0, cachePolicy: 'memory-disk',
    });
    expect(hook.result.current.overlay!.props.style[1].transform[2].scale).toBe(36 / 320);
    expect(Motion.withTiming).toHaveBeenLastCalledWith(1, lyricsTiming, expect.any(Function));
    await hook.rerender({ trackKey: 'first', lyricsVisible: false });
    let style = StyleSheet.flatten(hook.result.current.overlay!.props.style);
    expect(style.left + 160 + style.transform[0].translateX).toBe(196.5);
    expect(style.top + 160 + style.transform[1].translateY).toBe(264);
    expect(style.borderRadius).toBe(16);
    expect(complete).not.toHaveBeenCalled();
    await act(() => completions[1]());
    expect(complete).toHaveBeenCalledTimes(1);

    await act(() => hook.result.current.flyBetweenFrames(cover, mini, 'mini.jpg', complete));
    expect(Motion.withTiming).toHaveBeenLastCalledWith(1, lyricsTiming, expect.any(Function));
    await hook.rerender({ trackKey: 'first', lyricsVisible: false });
    style = StyleSheet.flatten(hook.result.current.overlay!.props.style);
    expect(style.left + 160 + style.transform[0].translateX).toBe(52);
    expect(style.top + 160 + style.transform[1].translateY).toBe(608);
    expect(style.borderRadius * style.transform[2].scale).toBe(10);
    await act(() => completions[2]());
    expect(complete).toHaveBeenCalledTimes(2);
    expect(hook.result.current.overlay).toBeNull();
  });

  it('keeps small artwork corners unchanged when closing from the lyrics pill', async () => {
    const hook = await mount();
    await act(() => hook.result.current.flyBetweenFrames(
      { x: 44, y: 499, width: 36, height: 36 },
      { x: 34, y: 590, width: 36, height: 36 }, 'cover.jpg',
    ));
    const style = StyleSheet.flatten(hook.result.current.overlay!.props.style);
    expect(style.transform[2].scale).toBe(36 / 320);
    expect(style.borderRadius * style.transform[2].scale).toBe(10);
  });

  it('cancels stale external completions and respects reduced motion on dismissal', async () => {
    const hook = await mount();
    const mini = { x: 34, y: 590, width: 36, height: 36 };
    const cover = { x: 36.5, y: 104, width: 320, height: 320 };
    const complete = jest.fn();
    await act(() => hook.result.current.flyBetweenFrames(cover, mini, 'cover.jpg', complete));
    await hook.rerender({ trackKey: 'replacement', lyricsVisible: false });
    await act(() => completions[0]());
    expect(complete).not.toHaveBeenCalled();
    jest.mocked(Motion.useReducedMotion).mockReturnValue(true);
    await hook.rerender({ trackKey: 'replacement', lyricsVisible: false });
    jest.mocked(Motion.withTiming).mockClear();
    await act(() => hook.result.current.flyBetweenFrames(cover, mini, 'cover.jpg', complete));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(hook.result.current.overlay).toBeNull();
    expect(Motion.withTiming).not.toHaveBeenCalled();
  });

  it('does not fade a parent of the native lyrics glass button', async () => {
    const hook = await mount();
    expect(hook.result.current.toggleStyle.opacity).toBeUndefined();
    await act(() => hook.result.current.transition(true, jest.fn()));
    expect(hook.result.current.toggleStyle.opacity).toBeUndefined();
  });

  it('refreshes positions at the tap after the modal or scroll position moves', async () => {
    const hook = await mount();
    hook.result.current.containerRef.current = measure(0, 80, 393, 700);
    hook.result.current.mediaRef.current = measure(24, 184, 345, 380);
    hook.result.current.rowRef.current = measure(24, 430, 345, 50);
    await act(() => hook.result.current.transition(true, jest.fn()));
    await hook.rerender({ trackKey: 'first', lyricsVisible: false });
    const style = StyleSheet.flatten(hook.result.current.overlay!.props.style);
    expect(style.top + 160 + style.transform[1].translateY).toBe(375);
  });

  it('discards pending measurements when the player closes', async () => {
    const hook = await mount();
    const update = jest.fn();
    hook.result.current.rowRef.current = { measureInWindow: () => {} } as View;
    await act(() => hook.result.current.transition(true, update));
    expect(update).not.toHaveBeenCalled();
    await hook.unmount();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(update).not.toHaveBeenCalled();
  });

  it('does not let stale measurements cancel the fallback for a newer tap', async () => {
    const hook = await mount();
    jest.useFakeTimers();
    try {
      const first = jest.fn();
      const latest = jest.fn();
      const callbacks: ((x: number, y: number, width: number, height: number) => void)[] = [];
      hook.result.current.rowRef.current = { measureInWindow: (callback) => callbacks.push(callback) } as View;
      await act(() => hook.result.current.transition(true, first));
      await act(() => hook.result.current.transition(true, latest));
      await act(() => callbacks[0](24, 552, 345, 50));
      await act(() => jest.advanceTimersByTime(51));
      expect(first).not.toHaveBeenCalled();
      expect(latest).toHaveBeenCalledTimes(1);
      await hook.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it('respects reduced motion without blocking the mode change', async () => {
    jest.mocked(Motion.useReducedMotion).mockReturnValue(true);
    const hook = await mount();
    const update = jest.fn();
    await act(() => hook.result.current.transition(true, update));
    expect(update).toHaveBeenCalledTimes(1);
    expect(hook.result.current.overlay).toBeNull();
    expect(Motion.withTiming).not.toHaveBeenCalled();
    await hook.rerender({ trackKey: 'first', lyricsVisible: true });
    expect(hook.result.current.lyricsStyle.opacity).toBe(1);
  });
});
