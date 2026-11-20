import * as React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { PlayerSheetBackground } from '../PlayerSheetBackground';

jest.mock('@context', () => ({ usePlayer: () => ({ currentTrack: { imageURL: 'https://cover.test/current.jpg' } }) }));

it('disables both custom and fallback artwork while preserving the sheet material', async () => {
  const screen = await render(<PlayerSheetBackground />);
  expect(screen.getByTestId('sheet-artwork-background').props.source).toEqual([{ uri: 'https://cover.test/current.jpg' }]);
  await screen.rerender(<PlayerSheetBackground artworkEnabled={false}><Text>Artwork animation</Text></PlayerSheetBackground>);
  expect(screen.queryByTestId('sheet-artwork-background')).toBeNull();
  expect(screen.queryByText('Artwork animation')).toBeNull();
  await screen.rerender(<PlayerSheetBackground artworkURL="https://cover.test/selected.jpg" />);
  expect(screen.getByTestId('sheet-artwork-background').props.source).toEqual([{ uri: 'https://cover.test/selected.jpg' }]);
});
