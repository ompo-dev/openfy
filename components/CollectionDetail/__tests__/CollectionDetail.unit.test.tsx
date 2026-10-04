import * as React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { Keyboard } from 'react-native';

import { useDownloads, usePlayer } from '@context';
import { CollectionDetail } from '../CollectionDetail';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/(tabs)/library/album/album-test',
  useSegments: () => ['(tabs)', 'library'],
}));

jest.mock('@context', () => ({
  useDownloads: jest.fn(),
  usePlayer: jest.fn(),
}));

jest.mock('@api', () => ({
  findArtistIdByName: jest.fn().mockResolvedValue(null),
  getYouTubeMusicArtistImage: jest.fn().mockResolvedValue(null),
}));

jest.mock('@services', () => ({
  getCachedArtistImage: jest.fn().mockResolvedValue(''),
}));

jest.mock('../../../services/metadata/spotifyMetadata', () => ({
  getSpotifyArtistImage: jest.fn().mockResolvedValue(null),
}));

jest.mock('expo-image', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});

jest.mock('expo-linear-gradient', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { LinearGradient: ({ children, ...props }: any) => React.createElement(View, props, children) };
});

jest.mock('../../native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {
    Pressable,
    Text,
    TextInput,
    View,
  } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SheetFrame: jest.requireActual('../../native/SheetFrame').SheetFrame,
    GlassSurface: ({ children, ...props }: any) =>
      React.createElement(View, props, children),
    LoggedPressable: Pressable,
    LoggedTextInput: TextInput,
    NativeIconButton: ({ label, onPress, tint = '#FFFFFF' }: any) =>
      React.createElement(
        Pressable,
        { accessibilityLabel: label, onPress },
        React.createElement(Text, null, `${label}:${tint}`)
      ),
  };
});

jest.mock('../../PlaylistMosaic', () => ({ PlaylistMosaic: () => null }));
jest.mock('../../Home/FriendActivityStatus/NoteBubble', () => ({
  SoundWaveIcon: () => null,
}));
jest.mock('../../common/MarqueeText', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MarqueeText: ({ children, text, ...props }: any) =>
      React.createElement(View, props, React.createElement(Text, null, children || text)),
  };
});

const playWithQueue = jest.fn().mockResolvedValue(undefined);
const togglePlayPause = jest.fn().mockResolvedValue(undefined);
const toggleShuffle = jest.fn();

const tracks = [
  {
    id: 'track-one',
    title: 'Primeira música',
    subtitle: 'Artista sem id',
    albumName: 'Álbum teste',
    durationMs: 180_000,
  },
  {
    id: 'track-two',
    title: 'Outra faixa',
    subtitle: 'Segundo artista',
    albumName: 'Álbum teste',
    durationMs: 210_000,
  },
];

const playerValue = (overrides = {}) => ({
  addToQueue: jest.fn(),
  currentTrack: null,
  isLoadingAudio: false,
  isShuffle: false,
  isPlaying: false,
  playWithQueue,
  queueSourceId: null,
  togglePlayPause,
  toggleShuffle,
  ...overrides,
});

const renderCollection = (props = {}) =>
  render(
    <CollectionDetail
      collectionId="album-test"
      imageURL=""
      kind="album"
      title="Álbum teste"
      tracks={tracks}
      {...props}
    />
  );

describe('CollectionDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useDownloads).mockReturnValue({
      downloads: [],
      enqueueDownloads: jest.fn(),
    } as any);
    jest.mocked(usePlayer).mockReturnValue(playerValue() as any);
  });

  it('expands search inline and filters tracks without navigating away', async () => {
    const screen = await renderCollection();

    fireEvent.press(screen.getByLabelText('Buscar'));
    const searchInput = await screen.findByLabelText('Buscar nesta coleção');
    fireEvent.changeText(
      searchInput,
      'segundo'
    );

    await waitFor(() => {
      expect(screen.queryByText('Primeira música')).toBeNull();
      expect(screen.getByText('Outra faixa')).toBeTruthy();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('dismisses the keyboard when closing inline search', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const screen = await renderCollection();

    fireEvent.press(screen.getByLabelText('Buscar'));
    expect(await screen.findByLabelText('Buscar nesta coleção')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Fechar busca'));

    expect(dismiss).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByLabelText('Buscar nesta coleção')).toBeNull()
    );
    dismiss.mockRestore();
  });

  it('plays a single shuffled queue and exposes fallback artist links', async () => {
    const onArtistPress = jest.fn();
    const screen = await renderCollection({ onArtistPress });

    fireEvent.press(screen.getByLabelText('Tocar aleatório'));
    await waitFor(() =>
      expect(playWithQueue).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ spotifyId: 'track-one' }),
          expect.objectContaining({ spotifyId: 'track-two' }),
        ]),
        0,
        'album:album-test',
        { shuffle: true }
      )
    );

    fireEvent.press(screen.getAllByLabelText('Abrir artista Artista sem id')[0]);
    await waitFor(() => expect(onArtistPress).toHaveBeenCalledWith('', 'Artista sem id'));
  });

  it('shows active shuffle and pause states for the current collection', async () => {
    jest.mocked(usePlayer).mockReturnValue(
      playerValue({
        isShuffle: true,
        isPlaying: true,
        queueSourceId: 'album:album-test',
      }) as any
    );

    const screen = await renderCollection();

    expect(screen.getByText('Desativar aleatório:#1ED760')).toBeTruthy();
    expect(screen.getByLabelText('Pausar')).toBeTruthy();
  });

  it('keeps playlist artists inert and replaces sharing with editing', async () => {
    const onArtistPress = jest.fn();
    const onEditPress = jest.fn();
    const screen = await renderCollection({
      kind: 'playlist',
      disableTrackArtistLinks: true,
      onArtistPress,
      onEditPress,
    });

    const artistLabels = screen.getAllByLabelText('Abrir artista Artista sem id');
    expect(artistLabels).toHaveLength(1);
    expect(artistLabels[0].props.accessibilityRole).toBe('link');
    expect(screen.queryByLabelText('Compartilhar')).toBeNull();
    fireEvent.press(screen.getByLabelText('Editar playlist'));

    expect(onEditPress).toHaveBeenCalledTimes(1);
    expect(onArtistPress).not.toHaveBeenCalled();
  });

  it('fills the artist hero with its portrait and omits generic profile copy', async () => {
    const onAddTracksPress = jest.fn();
    const screen = await renderCollection({
      kind: 'artist',
      title: 'Yago Oproprio',
      imageURL: 'https://images.example/yago.jpg',
      description: '',
      metadata: '',
      onAddTracksPress,
    });

    expect(screen.getByTestId('collection-artwork').props.contentFit).toBe('cover');
    expect(screen.queryByText('Artista')).toBeNull();
    expect(screen.queryByText('Músicas, álbuns e singles de Yago Oproprio.')).toBeNull();
    expect(screen.queryByLabelText('Adicionar músicas à playlist')).toBeNull();
    expect(onAddTracksPress).not.toHaveBeenCalled();
  });

  it('keeps the add-tracks action available on an editable playlist', async () => {
    const onAddTracksPress = jest.fn().mockResolvedValue(undefined);
    const screen = await renderCollection({
      kind: 'playlist',
      onAddTracksPress,
    });

    fireEvent.press(screen.getByLabelText('Adicionar músicas à playlist'));
    await waitFor(() => expect(onAddTracksPress).toHaveBeenCalledTimes(1));
  });

  it('lists every credited artist from the collection and removes add and overflow actions', async () => {
    const screen = await renderCollection({
      tracks: [
        { id: 'one', title: 'Faixa 1', subtitle: 'Principal, Participação' },
        { id: 'two', title: 'Faixa 2', subtitle: 'Principal, Outra participação' },
      ],
      metadata: 'EP · 4 músicas · 12 min',
    });

    expect(screen.getByText('EP · 4 músicas · 12 min')).toBeTruthy();
    expect(screen.queryByLabelText('Adicionar músicas à playlist')).toBeNull();
    expect(screen.queryByLabelText('Mais opções')).toBeNull();
    fireEvent.press(screen.getByLabelText('Ver 3 artistas'));
    expect(screen.getAllByText('Principal').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Participação').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Outra participação').length).toBeGreaterThan(0);
  });

  it('does not render collection tracks without a valid artist credit', async () => {
    const screen = await renderCollection({
      tracks: [
        { id: 'credited', title: 'Com artista', subtitle: 'Artista válido' },
        { id: 'uncredited', title: 'Sem artista', subtitle: '' },
        { id: 'placeholder', title: 'Crédito genérico', subtitle: 'Artista desconhecido' },
      ],
    });

    expect(screen.getByText('Com artista')).toBeTruthy();
    expect(screen.queryByText('Sem artista')).toBeNull();
    expect(screen.queryByText('Crédito genérico')).toBeNull();
  });

  it('paginates artist tracks by 10 and exposes the next page on demand', async () => {
    const artistTracks = Array.from({ length: 12 }, (_, index) => ({
      id: `artist-track-${index + 1}`,
      title: `Artist track ${index + 1}`,
      subtitle: 'Artist name',
    }));
    const screen = await renderCollection({
      kind: 'artist',
      tracks: artistTracks,
    });

    expect(screen.getByTestId('collection-track-list').props.data).toHaveLength(10);
    expect(screen.getByText('Artist track 1')).toBeTruthy();
    expect(screen.queryByText('Artist track 16')).toBeNull();
    fireEvent.press(screen.getByLabelText('Mostrar mais músicas do artista'));
    await waitFor(() => {
      expect(screen.getByTestId('collection-track-list').props.data).toHaveLength(12);
    });
  });

  it('loads remaining remote playlist pages when the full artist list is requested', async () => {
    const resolveTracksForPlayback = jest.fn().mockResolvedValue([
      ...tracks,
      {
        id: 'track-three',
        title: 'Faixa de outra página',
        subtitle: 'Artista da página seguinte',
      },
    ]);
    const screen = await renderCollection({
      kind: 'playlist',
      trackCount: 4,
      resolveTracksForPlayback,
    });

    fireEvent.press(screen.getByLabelText('Ver 2 artistas'));
    await waitFor(() => expect(resolveTracksForPlayback).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getAllByLabelText('Abrir artista Artista da página seguinte')
      ).toHaveLength(2)
    );
  });
});
