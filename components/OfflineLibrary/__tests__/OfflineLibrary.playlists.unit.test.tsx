import * as React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { deleteLocalPlaylist, getLocalPlaylists } from '@services';
import { OfflineLibrary } from '../OfflineLibrary';

const mockRefresh = jest.fn();
const mockOpen = jest.fn();
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('@api', () => ({ getArtistCatalogImage: jest.fn(), getYouTubeMusicArtistProfile: jest.fn() }));
jest.mock('@hooks', () => ({ useDetailNavigation: () => ({ openDetail: mockOpen }) }));
jest.mock('@services', () => ({ getLocalPlaylists: jest.fn(), deleteLocalPlaylist: jest.fn(),
  getLibraryTracks: jest.fn().mockResolvedValue([]), groupLocalAlbums: jest.fn(() => []) }));
jest.mock('@context', () => ({
  usePlayer: (selector: any) => selector({ currentTrack: null, playerState: { isPlaying: false }, playWithQueue: jest.fn() }),
  useDownloads: () => ({ downloads: [] }),
  useLibrarySelectedCategory: () => ({ libraryView: 'playlists', librarySort: 'title', librarySearchQuery: '',
    libraryRevision: 0, refreshLibrary: mockRefresh }),
}));
jest.mock('../LibrarySwipeRow', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View, Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { LibrarySwipeRow: ({ children, label, onRemove }: any) => <View>
    <Pressable accessibilityLabel={label} onPress={onRemove}><Text>Swipe action</Text></Pressable>{children}
  </View> };
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(getLocalPlaylists).mockResolvedValue([{ id: 'playlist', title: 'Favoritas', trackIds: [],
    sourceId: 'playlist', sourcePlatform: 'local', createdAt: '', updatedAt: '' }]);
  jest.mocked(deleteLocalPlaylist).mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

it('keeps opening playlists normally and only deletes after confirming the swipe action', async () => {
  const view = await render(<OfflineLibrary />);
  await fireEvent.press(await view.findByLabelText('Abrir playlist Favoritas'));
  expect(mockOpen).toHaveBeenCalledWith('playlist', 'playlist', 'library');
  await fireEvent.press(view.getByLabelText('Excluir playlist Favoritas'));
  expect(deleteLocalPlaylist).not.toHaveBeenCalled();
  const buttons = jest.mocked(Alert.alert).mock.calls[0][2]!;
  expect(buttons.find((button) => button.style === 'cancel')).toBeTruthy();
  jest.mocked(getLocalPlaylists).mockResolvedValue([]);
  await act(async () => { await buttons.find((button) => button.style === 'destructive')!.onPress?.(); });
  await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  expect(deleteLocalPlaylist).toHaveBeenCalledWith('playlist');
  await waitFor(() => expect(view.queryByLabelText('Abrir playlist Favoritas')).toBeNull());
});

it('keeps the playlist visible and reports a failed deletion', async () => {
  jest.mocked(deleteLocalPlaylist).mockRejectedValue(new Error('storage failed'));
  const view = await render(<OfflineLibrary />);
  await fireEvent.press(await view.findByLabelText('Excluir playlist Favoritas'));
  const buttons = jest.mocked(Alert.alert).mock.calls[0][2]!;
  await act(async () => { await buttons.find((button) => button.style === 'destructive')!.onPress?.(); });
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Não foi possível excluir', 'Tente novamente.'));
  expect(view.getByLabelText('Abrir playlist Favoritas')).toBeTruthy();
});
