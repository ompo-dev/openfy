import * as React from 'react';
import { StyleSheet } from 'react-native';
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

it('rounds music covers, preserves square selection backgrounds and compacts rows by about 40%', async () => {
  const screen = await render(<TrackRow track={track} title="Song" subtitle="Artist"
    active playing downloadState="idle" onDownload={jest.fn()} onPress={jest.fn()} />);
  const rowStyle = StyleSheet.flatten(screen.getByLabelText('Tocar Song').props.style);
  const artworkStyle = StyleSheet.flatten(screen.getByTestId('track-row-artwork').props.style);
  expect(rowStyle.borderRadius).toBe(0);
  expect(artworkStyle.borderRadius).toBe(8);
  expect(rowStyle.minHeight).toBe(55);
  expect(rowStyle.paddingVertical).toBe(5);
  expect((64 - 42 - (55 - 42)) / (64 - 42)).toBeCloseTo(0.41, 1);
});

it('shows artist names, duration and the explicit-content indicator beside the title', async () => {
  const screen = await render(<TrackRow track={{ ...track, artistName: 'Sotam, Rob, Vertigo', duration_ms: 155_000, explicit: true }}
    title="Song" subtitle="Sotam, Rob, Vertigo" imageURL="https://images.example/song.jpg"
    active={false} playing={false} downloadState="idle" onDownload={jest.fn()} onPress={jest.fn()} />);
  expect(screen.getByText('Sotam, Rob, Vertigo • 2:35')).toBeTruthy();
  expect(screen.getByTestId('track-explicit-badge')).toBeTruthy();
  expect(screen.getByText('E')).toBeTruthy();
});

it('keeps artist links clickable and puts the duration after the linked names', async () => {
  const onArtistPress = jest.fn();
  const onPress = jest.fn();
  const screen = await render(<TrackRow track={{ ...track, durationMs: 155_000 }}
    title="Song" subtitle="Sotam, Rob, Vertigo" active={false} playing={false}
    downloadState="idle" onDownload={jest.fn()} onPress={onPress}
    artists={[{ id: 's', name: 'Sotam' }, { id: 'r', name: 'Rob' }, { id: 'v', name: 'Vertigo' }]}
    onArtistPress={onArtistPress} />);
  expect(screen.getByText(' • 2:35')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Abrir artista Rob'));
  expect(onArtistPress).toHaveBeenCalledWith('r', 'Rob');
  expect(onPress).not.toHaveBeenCalled();
});

it('does not invent a duration or an explicit badge when metadata is missing', async () => {
  const screen = await setup();
  expect(screen.getByText('Artist')).toBeTruthy();
  expect(screen.queryByText('Artist • 0:00')).toBeNull();
  expect(screen.queryByTestId('track-explicit-badge')).toBeNull();
});

it('does not append duration to playlist state labels instead of artist names', async () => {
  const screen = await render(<TrackRow track={{ ...track, duration_ms: 180_000 }}
    title="Song" subtitle="Já está na playlist" active={false} playing={false}
    downloadState="idle" onPress={jest.fn()} onDownload={jest.fn()} />);
  expect(screen.getByText('Já está na playlist')).toBeTruthy();
  expect(screen.queryByText('Já está na playlist • 3:00')).toBeNull();
});

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
