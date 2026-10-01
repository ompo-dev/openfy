import * as React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

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
  // Jest evaluates this isolated factory before module imports are available.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockReact = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable: MockPressable, View: MockView } = require('react-native');

  return {
    LoggedPressable: MockPressable,
    SheetFrame: ({ children }: { children: React.ReactNode }) =>
      mockReact.createElement(MockView, null, children),
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
