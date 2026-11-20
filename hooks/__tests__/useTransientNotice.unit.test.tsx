import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useTransientNotice } from '../useTransientNotice';

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'setImmediate'] });
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('expires the same notice despite rerenders and cancels the previous notice timer', async () => {
  const dismiss = jest.fn();
  const hook = await renderHook(({ id }) => useTransientNotice(id, dismiss), { initialProps: { id: 'first' } });
  await act(() => jest.advanceTimersByTime(4000));
  await hook.rerender({ id: 'first' });
  await act(() => jest.advanceTimersByTime(2000));
  expect(dismiss).toHaveBeenCalledTimes(1);
  await hook.rerender({ id: 'second' });
  await act(() => jest.advanceTimersByTime(4000));
  await hook.rerender({ id: 'third' });
  await act(() => jest.advanceTimersByTime(2000));
  expect(dismiss).toHaveBeenCalledTimes(1);
  await act(() => jest.advanceTimersByTime(4000));
  expect(dismiss).toHaveBeenCalledTimes(2);
  await hook.unmount();
  jest.useRealTimers();
});

it('gives screen-reader users more time and leaves no timer after unmount', async () => {
  jest.mocked(AccessibilityInfo.isScreenReaderEnabled).mockResolvedValue(true);
  const dismiss = jest.fn();
  const hook = await renderHook(() => useTransientNotice('notice', dismiss));
  await act(() => jest.advanceTimersByTime(6000));
  expect(dismiss).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(9000));
  expect(dismiss).toHaveBeenCalledTimes(1);
  await hook.unmount();
  await act(() => jest.runOnlyPendingTimers());
  expect(dismiss).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});

it('announces a notice without moving accessibility focus or resetting it on rerender', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
  const hook = await renderHook(() => useTransientNotice('notice', jest.fn(), 6000, 'Saved'));
  await hook.rerender();
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenCalledWith('Saved');
  expect(focus).not.toHaveBeenCalled();
  await hook.unmount();
  jest.useRealTimers();
});
