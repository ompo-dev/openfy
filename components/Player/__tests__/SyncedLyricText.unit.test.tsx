import * as React from 'react';
import { act, render, renderHook } from '@testing-library/react-native';
import { SyncedLyricText } from '../SyncedLyricText.ios';
import { useLyricClock } from '../useLyricClock';

jest.mock('@expo/ui/swift-ui', () => {
  const { View, Text } = require('react-native');
  return { Host: View, VStack: View, Text };
});

it('sweeps across supplied word durations in the native renderer without changing spacing', async () => {
  const words = [{ text: 'Hello ', startTimeMs: 1000, endTimeMs: 2000 },
    { text: 'world', startTimeMs: 2000, endTimeMs: 3000 }];
  const screen = await render(<SyncedLyricText active blurred={false} words={words} positionMs={1500}>Hello world</SyncedLyricText>);
  expect(screen.getByText('Hello').props.modifiers).toEqual([expect.objectContaining({ $type: 'foregroundStyle',
    styleType: 'linearGradient', startPoint: { x: 0.48, y: 0 }, endPoint: { x: 0.52, y: 0 } })]);
  expect(screen.getByText('world').props.modifiers).toEqual([expect.objectContaining({ $type: 'foregroundStyle', color: 'rgba(255,255,255,0.48)' })]);
  await screen.rerender(<SyncedLyricText active blurred={false} words={words} positionMs={3000}>Hello world</SyncedLyricText>);
  expect(screen.getByText('world').props.modifiers).toEqual([expect.objectContaining({ $type: 'foregroundStyle', color: '#FFFFFF' })]);
});

it('interpolates only the active line, stops on pause and resynchronizes on seek and rate changes', async () => {
  jest.useFakeTimers();
  const intervals = jest.spyOn(global, 'setInterval');
  const clearIntervals = jest.spyOn(global, 'clearInterval');
  const words = [{ text: 'Hello', startTimeMs: 0, endTimeMs: 10000 }];
  try {
    const hook = await renderHook(({ position, playing, rate, active }) =>
      useLyricClock(position, active, playing, rate, words),
    { initialProps: { position: 1000, playing: true, rate: 1, active: true } });
    await act(() => jest.advanceTimersByTime(330));
    expect(hook.result.current).toBe(1330);
    await hook.rerender({ position: 1330, playing: false, rate: 1, active: true });
    await act(() => jest.advanceTimersByTime(1000));
    expect(hook.result.current).toBe(1330);
    await hook.rerender({ position: 500, playing: true, rate: 2, active: true });
    await act(() => jest.advanceTimersByTime(330));
    expect(hook.result.current).toBe(1160);
    await act(() => jest.advanceTimersByTime(2000));
    expect(hook.result.current).toBe(2000); // Never keep advancing indefinitely without audio status.
    const timer = intervals.mock.results.at(-1)!.value;
    await hook.rerender({ position: 2000, playing: true, rate: 2, active: false });
    expect(clearIntervals).toHaveBeenCalledWith(timer);
    await hook.unmount();
  } finally { intervals.mockRestore(); clearIntervals.mockRestore(); jest.useRealTimers(); }
});

it('uses native SwiftUI blur without changing lyric size or alignment', async () => {
  const screen = await render(<SyncedLyricText active={false} blurred>Next lyric</SyncedLyricText>);
  const modifiers = () => screen.getByText('Next lyric').props.modifiers;
  expect(modifiers()).toEqual(expect.arrayContaining([
    expect.objectContaining({ $type: 'blur', radius: 3 }),
    expect.objectContaining({ $type: 'multilineTextAlignment', alignment: 'leading' }),
    expect.objectContaining({ $type: 'font', size: 26, weight: 'bold' }),
  ]));
  await screen.rerender(<SyncedLyricText active={false} blurred={false}>Next lyric</SyncedLyricText>);
  expect(modifiers()).toEqual(expect.arrayContaining([expect.objectContaining({ $type: 'blur', radius: 0 })]));
  await screen.rerender(<SyncedLyricText active blurred={false}>Next lyric</SyncedLyricText>);
  expect(modifiers()).toEqual(expect.arrayContaining([
    expect.objectContaining({ $type: 'blur', radius: 0 }),
    expect.objectContaining({ $type: 'font', size: 26, weight: 'bold' }),
    expect.objectContaining({ $type: 'foregroundStyle', color: '#FFFFFF' }),
  ]));
});
