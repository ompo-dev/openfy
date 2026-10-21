import * as React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';

import {
  addTracksToLocalPlaylist,
  getLibraryTracks,
  getLocalPlaylists,
  upsertCatalogTracks,
} from '@services';
import { TrackPlaylistPickerModal } from '../TrackPlaylistPickerModal';

jest.mock('@services', () => ({
  addTracksToLocalPlaylist: jest.fn(),
  getLibraryTracks: jest.fn(),
  getLocalPlaylists: jest.fn(),
  upsertCatalogTracks: jest.fn(),
}));

jest.mock('../../native', () => {
  const { Pressable: MockPressable, View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    LoggedPressable: MockPressable,
    GlassSurface: MockView,
    SheetFrame: jest.requireActual('../../native/SheetFrame').SheetFrame,
  };
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Image: (props: object) => React.createElement(View, { ...props, testID: 'playlist-cover-image' }),
  };
});

const mockAddTracksToLocalPlaylist = jest.mocked(addTracksToLocalPlaylist);
const mockGetLibraryTracks = jest.mocked(getLibraryTracks);
const mockGetLocalPlaylists = jest.mocked(getLocalPlaylists);
const mockUpsertCatalogTracks = jest.mocked(upsertCatalogTracks);

const track = {
  spotifyId: 'stream-only-track',
  title: 'Descoberta da Home',
  artistName: 'Artista',
  albumName: 'Álbum',
  imageURL: 'https://images.example/cover.jpg',
  duration_ms: 180000,
};

describe('TrackPlaylistPickerModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLocalPlaylists.mockResolvedValue([
      {
        id: 'playlist-1',
        title: 'Favoritas',
        trackIds: [],
      },
    ]);
    mockGetLibraryTracks.mockResolvedValue([]);
    mockUpsertCatalogTracks.mockResolvedValue([]);
    mockAddTracksToLocalPlaylist.mockResolvedValue(undefined);
  });

  it('persists a streamed track before associating it with a playlist', async () => {
    const onClose = jest.fn();
    const screen = await render(
      <TrackPlaylistPickerModal onClose={onClose} track={track} visible />
    );

    await waitFor(() => expect(screen.getByText('Favoritas')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Adicionar em Favoritas'));
    await waitFor(() =>
      expect(screen.getByLabelText('Adicionar em 1 playlist')).toBeTruthy()
    );
    await fireEvent.press(screen.getByLabelText('Adicionar em 1 playlist'));

    await waitFor(() => {
      expect(mockUpsertCatalogTracks).toHaveBeenCalledWith([track]);
      expect(mockAddTracksToLocalPlaylist).toHaveBeenCalledWith('playlist-1', [
        'stream-only-track',
      ]);
      expect(onClose).toHaveBeenCalled();
    });
    expect(mockUpsertCatalogTracks.mock.invocationCallOrder[0]).toBeLessThan(
      mockAddTracksToLocalPlaylist.mock.invocationCallOrder[0]
    );
  });

  it('keeps creation above the playlist cells while sharing the edge-to-edge scroll and glass header', async () => {
    const screen = await render(<TrackPlaylistPickerModal onClose={jest.fn()} track={track} visible />);
    await screen.findByText('Favoritas');
    const list = screen.getByTestId('playlist-picker-list');
    expect(within(list).getByTestId('playlist-create-shortcut')).toBeTruthy();
    expect(within(list).getAllByText(/^(Nova playlist|Favoritas)$/).map((node) => node.props.children)).toEqual(['Nova playlist', 'Favoritas']);
    expect(screen.queryByTestId('gym-sheet-custom-content')).toBeNull();
    await fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 40, x: 0 } } });
    expect(screen.getByTestId('gym-sheet-header-glass')).toBeTruthy();
  });

  it('shows playlist artwork from its saved tracks', async () => {
    mockGetLocalPlaylists.mockResolvedValue([
      {
        id: 'playlist-art',
        title: 'Favoritas',
        trackIds: ['saved-track'],
      },
    ]);
    mockGetLibraryTracks.mockResolvedValue([
      {
        spotifyId: 'saved-track',
        title: 'Faixa salva',
        imageURL: 'https://images.example/saved-cover.jpg',
        localImagePath: '',
      } as never,
    ]);

    const screen = await render(
      <TrackPlaylistPickerModal onClose={jest.fn()} track={track} visible />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Capa da playlist Favoritas')).toBeTruthy();
      expect(screen.getByTestId('playlist-cover-image')).toBeTruthy();
    });
  });
});
