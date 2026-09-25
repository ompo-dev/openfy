import * as React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useDownloads, usePlayer } from '@context';
import { CollectionDetail } from '../CollectionDetail';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSegments: () => ['(tabs)', 'library'],
}));

jest.mock('@context', () => ({
  useDownloads: jest.fn(),
  usePlayer: jest.fn(),
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
  playerState: { isPlaying: false },
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

    fireEvent.press(screen.getByLabelText('Abrir artista Artista sem id'));
    expect(onArtistPress).toHaveBeenCalledWith('', 'Artista sem id');
  });

  it('shows active shuffle and pause states for the current collection', async () => {
    jest.mocked(usePlayer).mockReturnValue(
      playerValue({
        isShuffle: true,
        playerState: { isPlaying: true },
        queueSourceId: 'album:album-test',
      }) as any
    );

    const screen = await renderCollection();

    expect(screen.getByText('Desativar aleatório:#1ED760')).toBeTruthy();
    expect(screen.getByLabelText('Pausar')).toBeTruthy();
  });
});
