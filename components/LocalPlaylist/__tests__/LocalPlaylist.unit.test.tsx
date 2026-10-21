import * as React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { getLibraryTracks, getLocalPlaylist, removeTracksFromLocalPlaylist } from '@services';
import { LocalPlaylist } from '../LocalPlaylist';

const mockRefresh = jest.fn();
let mockCollectionProps: any;
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }),
  useFocusEffect: (effect: () => any) => jest.requireActual('react').useEffect(effect, [effect]),
}));
jest.mock('@context', () => ({ useLibrarySelectedCategory: () => ({ refreshLibrary: mockRefresh }) }));
jest.mock('@services', () => ({ getLocalPlaylist: jest.fn(), getLibraryTracks: jest.fn(), removeTracksFromLocalPlaylist: jest.fn() }));
jest.mock('../../CollectionDetail', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View, Text, Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return { CollectionDetail: (props: any) => {
  mockCollectionProps = props;
  return <View><Text>{props.title}</Text><Pressable accessibilityLabel="Remove track" onPress={() => void props.onRemoveTrack('one')} /></View>;
} }; });
jest.mock('../PlaylistEditorModal', () => ({ PlaylistEditorModal: () => null }));
jest.mock('../PlaylistTrackPickerModal', () => ({ PlaylistTrackPickerModal: () => null }));
jest.mock('../../CollectionDetail/PendingCollectionDetail', () => ({ PendingCollectionDetail: () => null }));

const playlist = { id: 'local', title: 'Playlist', trackIds: ['one', 'two'], createdAt: '', updatedAt: '', sourcePlatform: 'local', sourceId: 'local' };
const tracks = playlist.trackIds.map((spotifyId) => ({ spotifyId, title: spotifyId, artistName: 'Artist', albumName: 'Album', imageURL: '', duration_ms: 10000 }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(getLocalPlaylist).mockResolvedValue(playlist as any);
  jest.mocked(getLibraryTracks).mockResolvedValue(tracks as any);
});
afterEach(() => jest.restoreAllMocks());

it('removes only the selected membership and refreshes the visible playlist', async () => {
  jest.mocked(removeTracksFromLocalPlaylist).mockImplementation(async () => {
    const saved = { ...playlist, trackIds: ['two'] };
    jest.mocked(getLocalPlaylist).mockResolvedValue(saved as any);
    return saved as any;
  });
  const view = await render(<LocalPlaylist playlistId="local" />);
  await fireEvent.press(await view.findByLabelText('Remove track'));
  await waitFor(() => expect(mockCollectionProps.tracks.map((track: any) => track.id)).toEqual(['two']));
  expect(removeTracksFromLocalPlaylist).toHaveBeenCalledWith('local', ['one']);
  expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it('preserves membership and reports storage failures', async () => {
  jest.mocked(removeTracksFromLocalPlaylist).mockRejectedValue(new Error('Storage failed'));
  const view = await render(<LocalPlaylist playlistId="local" />);
  await fireEvent.press(await view.findByLabelText('Remove track'));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Playlist', 'Não foi possível remover a música. Tente novamente.'));
  expect(mockCollectionProps.tracks.map((track: any) => track.id)).toEqual(['one', 'two']);
  expect(mockRefresh).not.toHaveBeenCalled();
});
