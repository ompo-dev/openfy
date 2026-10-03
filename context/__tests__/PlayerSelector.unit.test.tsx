import * as React from 'react';
import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { usePlayer } from '../PlayerContext';
import { usePlayerStore } from '../../stores/usePlayerStore';

jest.mock('@services', () => ({}));
jest.mock('../../stores/usePlayerStore', () => ({
  usePlayerStore: jest.requireActual('zustand').create(() => ({
    currentTrack: { title: 'A song' },
    playerState: { isPlaying: true, positionMs: 0 },
  })),
}));

it('does not redraw a catalog when only the audio clock advances', async () => {
  let catalogRenders = 0;
  function Catalog() {
    const { title, isPlaying } = usePlayer((state) => ({
      title: state.currentTrack?.title,
      isPlaying: state.playerState.isPlaying,
    }));
    catalogRenders += 1;
    return <Text>{title}:{String(isPlaying)}</Text>;
  }
  const screen = await render(<Catalog />);
  const initialRenders = catalogRenders;
  await act(async () => {
    for (let positionMs = 500; positionMs <= 5000; positionMs += 500) {
      usePlayerStore.setState((state) => ({
        playerState: { ...state.playerState, positionMs },
      }));
    }
  });
  expect(catalogRenders).toBe(initialRenders);
  await act(async () => {
    usePlayerStore.setState((state) => ({
      playerState: { ...state.playerState, isPlaying: false },
    }));
  });
  expect(screen.getByText('A song:false')).toBeTruthy();
  expect(catalogRenders).toBe(initialRenders + 1);
});
