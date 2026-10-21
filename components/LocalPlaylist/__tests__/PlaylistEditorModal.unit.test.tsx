import * as React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { updateLocalPlaylist, type LibraryTrack, type LocalPlaylist } from '@services';
import { PlaylistEditorModal } from '../PlaylistEditorModal';
import { markTrackUnavailable, useTrackAvailabilityStore } from '../../../stores/useTrackAvailabilityStore';

const mockPlay = jest.fn();
const mockRepair = jest.fn();
jest.mock('@services', () => ({ updateLocalPlaylist: jest.fn() }));
jest.mock('@context', () => ({ usePlayer: (selector: any) => selector({
  playWithQueue: mockPlay, playTrack: mockRepair, currentTrack: null, playerState: { isPlaying: false },
}) }));
jest.mock('../../OfflineLibrary/LibrarySwipeRow', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View, Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { LibrarySwipeRow: ({ children, label, onRemove, disabled }: any) => <View>
    <Pressable testID={`swipe:${label}`} disabled={disabled} onPress={onRemove}><Text>{label}</Text></Pressable>{children}
  </View> };
});

const tracks = Array.from({ length: 120 }, (_, i) => ({ spotifyId: `track-${i}`, title: `Track ${i}`,
  artistName: 'Artist', albumName: 'Album', imageURL: '', duration_ms: 180000 })) as LibraryTrack[];
const playlist = { id: 'playlist', title: 'My playlist', trackIds: tracks.map((track) => track.spotifyId) } as LocalPlaylist;

beforeEach(() => {
  jest.clearAllMocks();
  useTrackAvailabilityStore.setState({ failures: {} });
  jest.mocked(updateLocalPlaylist).mockResolvedValue(playlist);
});

it('fills the page with normal track rows and removes the redundant form heading', async () => {
  markTrackUnavailable(tracks[0], 'source-unavailable');
  const view = await render(<PlaylistEditorModal visible playlist={playlist} tracks={tracks} onAddTracks={jest.fn()} onClose={jest.fn()} onSaved={jest.fn()} />);
  expect(view.queryByText('Playlist')).toBeNull();
  expect(view.queryByText('Áudio indisponível')).toBeNull();
  const content = StyleSheet.flatten(view.getByTestId('sheet-frame-content').props.style);
  expect(content.flex).toBe(1);
  expect(content.height).toBeUndefined();
  await fireEvent.press(view.getByLabelText('Tocar Track 0'));
  expect(mockPlay).toHaveBeenCalledWith(tracks, 0, 'playlist:playlist');
  expect(mockRepair).not.toHaveBeenCalled();
  expect(updateLocalPlaylist).not.toHaveBeenCalled();
});

it('stages swipe removals and undo, then saves the exact remaining track order', async () => {
  const close = jest.fn();
  const saved = jest.fn();
  const view = await render(<PlaylistEditorModal visible playlist={playlist} tracks={tracks} onAddTracks={jest.fn()} onClose={close} onSaved={saved} />);
  await fireEvent.press(view.getByTestId('swipe:Remover Track 0'));
  expect(view.getByText('Músicas · 119')).toBeTruthy();
  expect(updateLocalPlaylist).not.toHaveBeenCalled();
  await fireEvent.press(view.getByTestId('swipe:Manter Track 0'));
  expect(view.getByText('Músicas · 120')).toBeTruthy();
  await fireEvent.press(view.getByTestId('swipe:Remover Track 0'));
  await fireEvent.press(view.getByLabelText('Salvar playlist'));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(updateLocalPlaylist).toHaveBeenCalledWith('playlist', {
    title: playlist.title, description: '', trackIds: playlist.trackIds.slice(1),
  });
  expect(saved).toHaveBeenCalledTimes(1);
});

it('does not persist a removal when the editor is closed without saving', async () => {
  const close = jest.fn();
  const props = { playlist, tracks, onAddTracks: jest.fn(), onClose: close, onSaved: jest.fn() };
  const view = await render(<PlaylistEditorModal {...props} visible />);
  await fireEvent.press(view.getByTestId('swipe:Remover Track 0'));
  await fireEvent.press(view.getByLabelText('Fechar'));
  expect(close).toHaveBeenCalledTimes(1);
  expect(updateLocalPlaylist).not.toHaveBeenCalled();
  await view.rerender(<PlaylistEditorModal {...props} visible={false} />);
  await view.rerender(<PlaylistEditorModal {...props} visible />);
  expect(view.getByText('Músicas · 120')).toBeTruthy();
});
