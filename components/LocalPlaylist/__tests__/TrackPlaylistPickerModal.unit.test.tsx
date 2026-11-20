import * as React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';

import {
  addTracksToLocalPlaylist,
  getLibraryTracks,
  getLocalPlaylists,
  upsertCatalogTracks,
} from '@services';
import { TrackPlaylistPickerModal } from '../TrackPlaylistPickerModal';
import { addTracksToMix, getMixProjects } from '../../../services/mix/mixRepository';
import { downloadMixSources } from '../../../services/mix/mixAudio';
jest.mock('../../../services/mix/mixRepository', () => ({ getMixProjects: jest.fn().mockResolvedValue([]), addTracksToMix: jest.fn() }));
jest.mock('../../../services/mix/mixAudio', () => ({ downloadMixSources: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../gym', () => {
  const actual = jest.requireActual('../../gym');
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return { ...actual, NativeSegmented: ({ options, onChange }: any) => <View>{options.map((option: any) =>
    <Pressable key={option.value} accessibilityLabel={option.label} onPress={() => onChange(option.value)}><Text>{option.label}</Text></Pressable>)}</View> };
});

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
      expect(screen.getByLabelText('Adicionar em 1 destino')).toBeTruthy()
    );
    await fireEvent.press(screen.getByLabelText('Adicionar em 1 destino'));

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

  it('adds to Mix and queues local sources while keeping playlist and mix selections across tabs', async () => {
    const mix = { id: 'local_mix_test', title: 'Treino', clips: [], tracks: [], createdAt: '', updatedAt: '' };
    jest.mocked(getMixProjects).mockResolvedValue([mix as never]);
    jest.mocked(addTracksToMix).mockResolvedValue(mix as never);
    const view = await render(<TrackPlaylistPickerModal track={track} visible onClose={jest.fn()} />);
    await fireEvent.press(await view.findByLabelText('Adicionar em Favoritas'));
    await fireEvent.press(view.getByLabelText('Mix'));
    await fireEvent.press(await view.findByLabelText('Adicionar em Treino'));
    await fireEvent.press(view.getByLabelText('Adicionar em 2 destinos'));
    await waitFor(() => expect(addTracksToMix).toHaveBeenCalledWith('local_mix_test', [track]));
    expect(addTracksToLocalPlaylist).toHaveBeenCalledWith('playlist-1', [track.spotifyId]);
    expect(downloadMixSources).toHaveBeenCalledWith(mix);
  });
});
