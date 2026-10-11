import * as React from 'react';
import { render } from '@testing-library/react-native';
import { SyncedLyricText } from '../SyncedLyricText.ios';

jest.mock('@expo/ui/swift-ui', () => {
  const { View, Text } = require('react-native');
  return { Host: View, Text };
});

it('highlights supplied word starts in the native renderer without changing text spacing', async () => {
  const words = [{ text: 'Hello ', startTimeMs: 1000, endTimeMs: 2000 },
    { text: 'world', startTimeMs: 2000, endTimeMs: 3000 }];
  const screen = await render(<SyncedLyricText active blurred={false} words={words} positionMs={1500}>Hello world</SyncedLyricText>);
  expect(screen.getByText('Hello').props.modifiers).toEqual([expect.objectContaining({ $type: 'foregroundStyle', color: '#FFFFFF' })]);
  expect(screen.getByText('world').props.modifiers).toEqual([expect.objectContaining({ $type: 'foregroundStyle', color: 'rgba(255,255,255,0.48)' })]);
  await screen.rerender(<SyncedLyricText active blurred={false} words={words} positionMs={2000}>Hello world</SyncedLyricText>);
  expect(screen.getByText('world').props.modifiers).toEqual([expect.objectContaining({ $type: 'foregroundStyle', color: '#FFFFFF' })]);
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
