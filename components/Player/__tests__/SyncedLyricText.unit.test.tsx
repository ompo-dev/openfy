import * as React from 'react';
import { render } from '@testing-library/react-native';
import { SyncedLyricText } from '../SyncedLyricText.ios';

jest.mock('@expo/ui/swift-ui', () => {
  const { View, Text } = require('react-native');
  return { Host: View, Text };
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
