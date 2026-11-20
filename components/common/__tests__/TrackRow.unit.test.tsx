import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { TrackRow } from '../TrackRow';
import { markTrackUnavailable, useTrackAvailabilityStore } from '../../../stores/useTrackAvailabilityStore';

const mockRepair = jest.fn();
jest.mock('@context', () => ({ usePlayer: (selector: any) => selector({ playTrack: mockRepair }) }));

const track = { spotifyId: 'track', title: 'Song', artistName: 'Artist' };
const point = (pageX: number, pageY = 100) => ({ nativeEvent: { pageX, pageY } });
const setup = (onPress = jest.fn()) => render(<TrackRow track={track} title="Song" subtitle="Artist"
  active={false} playing={false} downloadState="idle" onDownload={jest.fn()} onPress={onPress} />);

beforeEach(() => { jest.clearAllMocks(); useTrackAvailabilityStore.setState({ failures: {} }); });

it.each([[50, 100], [150, 100], [100, 150], [100, 50]])('does not play after dragging to (%s, %s), even if the finger returns to the start', async (x, y) => {
  const play = jest.fn();
  const view = await setup(play);
  const row = view.getByLabelText('Tocar Song');
  await fireEvent(row, 'touchStart', point(100));
  await fireEvent(row, 'touchMove', point(x, y));
  await fireEvent(row, 'touchMove', point(100));
  await fireEvent.press(row, point(100));
  expect(play).not.toHaveBeenCalled();
  await fireEvent(row, 'touchStart', point(100));
  await fireEvent.press(row, point(102));
  expect(play).toHaveBeenCalledTimes(1);
});

it('rejects a displaced release or a cancelled touch without requiring a move callback', async () => {
  const play = jest.fn();
  const view = await setup(play);
  const row = view.getByLabelText('Tocar Song');
  await fireEvent(row, 'touchStart', point(100));
  await fireEvent.press(row, point(170));
  await fireEvent(row, 'touchStart', point(100));
  await fireEvent(row, 'touchCancel', point(100));
  await fireEvent.press(row, point(100));
  expect(play).not.toHaveBeenCalled();
});

it('accepts stationary and accessibility presses without an initial touch', async () => {
  const play = jest.fn();
  const view = await setup(play);
  const row = view.getByLabelText('Tocar Song');
  await fireEvent.press(row, point(100));
  await fireEvent(row, 'touchStart', point(100));
  await fireEvent(row, 'touchMove', point(103, 102));
  await fireEvent.press(row, point(103, 102));
  expect(play).toHaveBeenCalledTimes(2);
});

it('does not open link repair while swiping an unavailable recording', async () => {
  markTrackUnavailable(track, 'no-canonical-match');
  const view = await setup();
  const row = view.getByLabelText('Corrigir áudio de Song');
  await fireEvent(row, 'touchStart', point(100));
  await fireEvent(row, 'touchMove', point(30));
  await fireEvent.press(row, point(30));
  expect(mockRepair).not.toHaveBeenCalled();
});
