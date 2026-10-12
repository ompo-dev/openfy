/* eslint-disable @typescript-eslint/no-require-imports -- Hoisted Jest factories model the native renderer. */
import * as React from 'react';
import { act, render, renderHook } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SyncedLyricText } from '../SyncedLyricText.ios';
import { TimedLyricPreview } from '../TimedLyricPreview';
import { useLyricClock } from '../useLyricClock';
const mockNativeTextProps = jest.fn();

jest.mock('@expo/ui/swift-ui', () => {
  const { View, Text } = require('react-native');
  const React = require('react');
  // Model Expo's retained native `text` field when a mounted node gains children.
  const NativeText = (props: any) => {
    mockNativeTextProps(props);
    const previousText = React.useRef('');
    const previousChildren = React.useRef(null);
    if (typeof props.children === 'string') previousText.current = props.children;
    else previousChildren.current = props.children;
    return React.createElement(Text, props, previousText.current, previousChildren.current);
  };
  return { Host: View, VStack: View, Text: NativeText };
});

beforeEach(() => mockNativeTextProps.mockClear());

it('never appends stale native text during plain/word/plain switches and restores blur', async () => {
  const words = [{ text: 'Hello', startTimeMs: 1000, endTimeMs: 2000 },
    { text: 'world', startTimeMs: 2000, endTimeMs: 3000 }];
  const screen = await render(<SyncedLyricText active={false} blurred words={words}>Hello world</SyncedLyricText>);
  for (let index = 0; index < 4; index++) {
    await screen.rerender(<SyncedLyricText active blurred={false} words={words} positionMs={1500}>Hello world</SyncedLyricText>);
    expect(screen.getAllByText('Hello world')).toHaveLength(1);
    await screen.rerender(<SyncedLyricText active={false} blurred words={words}>Hello world</SyncedLyricText>);
    expect(screen.getAllByText('Hello world')).toHaveLength(1);
    expect(screen.getByText('Hello world').props.modifiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ $type: 'blur', radius: 3 }),
    ]));
  }
});

it('uses the preview word renderer in the expanded active line, without SwiftUI or blur', async () => {
  const words = [{ text: 'Hello ', startTimeMs: 1000, endTimeMs: 2000 },
    { text: 'world', startTimeMs: 2000, endTimeMs: 3000 }];
  const screen = await render(<SyncedLyricText active blurred={false} words={words} positionMs={1500}>Hello world</SyncedLyricText>);
  expect(screen.getByText('H').props.style.color).toBe('rgba(255,255,255,1)');
  expect(screen.getByText('world').props.style.color).toBe('rgba(255,255,255,0.48)');
  await screen.rerender(<SyncedLyricText active blurred words={words} positionMs={3000}>Hello world</SyncedLyricText>);
  expect(screen.getByText('world').props.style.color).toBe('#FFFFFF');
  expect(screen.getAllByText('Hello world')).toHaveLength(1);
  expect(mockNativeTextProps).not.toHaveBeenCalled();
});

it('has identical word runs to the working preview through word boundaries and seeks', async () => {
  const words = [{ text: 'Hello ', startTimeMs: 1000, endTimeMs: 2000 },
    { text: 'world', startTimeMs: 2000, endTimeMs: 3000 }];
  const example = (positionMs: number) => <>
    <SyncedLyricText active blurred={false} words={words} positionMs={positionMs}>Hello world</SyncedLyricText>
    <TimedLyricPreview testID="preview" active words={words} positionMs={positionMs}>Hello world</TimedLyricPreview>
  </>;
  const content = (node: any): any => node.children.map((child: any) => typeof child === 'string' ? child :
    { color: StyleSheet.flatten(child.props.style)?.color, children: content(child) });
  const screen = await render(example(0));
  for (const time of [1000, 1500, 1999, 2000, 2500, 3000, 1200, 2800]) {
    await screen.rerender(example(time));
    expect(content(screen.getByTestId('lyric-text-content'))).toEqual(content(screen.getByTestId('preview')));
  }
  expect(mockNativeTextProps).not.toHaveBeenCalled();
});

it('remounts when corrected provider words replace a plain fallback and scales backing vocals', async () => {
  const screen = await render(<SyncedLyricText active blurred={false} words={[
    { text: 'Unmatched', startTimeMs: 1000, endTimeMs: 2000 },
  ]}>Hello world</SyncedLyricText>);
  await screen.rerender(<SyncedLyricText active blurred={false} fontSize={34} words={[
    { text: 'Hello', startTimeMs: 1000, endTimeMs: 2000 },
    { text: 'world', startTimeMs: 2000, endTimeMs: 3000 },
  ]} background={{ text: 'Harmony', words: [{ text: 'Harmony', startTimeMs: 1000, endTimeMs: 3000 }] }}>
    Hello world
  </SyncedLyricText>);
  expect(screen.getAllByText('Hello world')).toHaveLength(1);
  expect(StyleSheet.flatten(screen.getByTestId('lyric-background-content').props.style).fontSize).toBe(34 * 19 / 26);
  expect(mockNativeTextProps).not.toHaveBeenCalled();
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

it('keeps SwiftUI blur only on inactive plain strings and removes that tree on focus', async () => {
  const screen = await render(<SyncedLyricText active={false} blurred>Next lyric</SyncedLyricText>);
  const modifiers = () => screen.getByText('Next lyric').props.modifiers;
  expect(modifiers()).toEqual(expect.arrayContaining([
    expect.objectContaining({ $type: 'blur', radius: 3 }),
    expect.objectContaining({ $type: 'multilineTextAlignment', alignment: 'leading' }),
    expect.objectContaining({ $type: 'font', size: 26, weight: 'bold' }),
  ]));
  const nativeCalls = mockNativeTextProps.mock.calls.length;
  await screen.rerender(<SyncedLyricText active={false} blurred={false}>Next lyric</SyncedLyricText>);
  expect(screen.getByTestId('lyric-text-content')).toBeTruthy();
  await screen.rerender(<SyncedLyricText active blurred>Next lyric</SyncedLyricText>);
  expect(StyleSheet.flatten(screen.getByTestId('lyric-text-content').props.style)).toMatchObject({
    fontSize: 26, fontWeight: '700', color: '#FFFFFF' });
  expect(mockNativeTextProps).toHaveBeenCalledTimes(nativeCalls);
  expect(mockNativeTextProps.mock.calls.every(([props]) => typeof props.children === 'string')).toBe(true);
});

it('disables timed backing vocals as well as foreground words', async () => {
  const screen = await render(<SyncedLyricText active blurred={false} playing wordHighlight={false}
    words={[{ text: 'Hello', startTimeMs: 0, endTimeMs: 3000 }]}
    background={{ text: 'Harmony', words: [{ text: 'Harmony', startTimeMs: 0, endTimeMs: 3000 }] }}>
    Hello
  </SyncedLyricText>);
  expect(screen.getByTestId('lyric-text-content').children).toEqual(['Hello']);
  expect(screen.getByTestId('lyric-background-content').children).toEqual(['Harmony']);
});
