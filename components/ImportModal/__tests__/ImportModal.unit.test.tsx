import * as React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ImportModal } from '../ImportModal';
import { useDownloads, usePlayer } from '@context';
import { parseSpotifyLink, upsertCatalogTracks } from '@services';
import { fetchSpotifyTrackMetadata } from '../../../services/metadata/spotifyMetadata';

jest.mock('@context', () => ({ useDownloads: jest.fn(), usePlayer: jest.fn() }));
jest.mock('@services', () => ({
  parseSpotifyLink: jest.fn(), getDownloadedTracks: jest.fn().mockResolvedValue([]),
  getLibraryTracks: jest.fn().mockResolvedValue([{ spotifyId: 'track-id' }]), getLocalPlaylists: jest.fn().mockResolvedValue([]),
  isTrackDownloaded: jest.fn().mockResolvedValue(false), upsertCatalogTracks: jest.fn(),
  upsertLocalPlaylist: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../services/metadata/spotifyMetadata', () => ({
  fetchSpotifyTrackMetadata: jest.fn(), fetchSpotifyCollectionMetadata: jest.fn(),
}));
jest.mock('../../native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View, Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SheetFrame: jest.requireActual('../../native/SheetFrame').SheetFrame,
    GlassSurface: ({ children, ...props }: any) => React.createElement(View, props, children),
    LoggedPressable: Pressable };
});
jest.mock('../../Home/FriendActivityStatus/NoteBubble', () => ({ SoundWaveIcon: () => null }));

const track = { spotifyId: 'track-id', title: 'Faixa', artistName: 'Ebony', albumName: 'KM2',
  imageURL: '', duration_ms: 150000 };
const enqueue = jest.fn();

describe('music import sheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useDownloads).mockReturnValue({ downloads: [], enqueueDownloads: enqueue } as any);
    jest.mocked(usePlayer).mockReturnValue({ currentTrack: null, isPlaying: false, playWithQueue: jest.fn() } as any);
    jest.mocked(parseSpotifyLink).mockReturnValue({ platform: 'spotify', type: 'track', id: 'track-id' });
    jest.mocked(fetchSpotifyTrackMetadata).mockResolvedValue(track);
    jest.mocked(upsertCatalogTracks).mockResolvedValue([]);
  });

  it('replaces add with download after saving and does not resolve the same link again', async () => {
    const onClose = jest.fn();
    const props = { visible: true, initialInput: 'https://open.spotify.com/track/track-id', onClose };
    const screen = await render(<ImportModal {...props} />);
    await fireEvent.press(screen.getByLabelText('Adicionar à biblioteca'));
    await waitFor(() => expect(screen.queryByLabelText('Adicionar à biblioteca')).toBeNull());
    expect(await screen.findByText('Faixa')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Baixar todas as músicas'));
    expect(enqueue).toHaveBeenCalledWith([expect.objectContaining({ spotifyId: 'track-id' })]);
    await screen.rerender(<ImportModal {...props} visible={false} />);
    await screen.rerender(<ImportModal {...props} />);
    expect(screen.queryByLabelText('Adicionar à biblioteca')).toBeNull();
    expect(fetchSpotifyTrackMetadata).toHaveBeenCalledTimes(1);
    expect(upsertCatalogTracks).toHaveBeenCalledTimes(1);
  });

  it('reuses resolved metadata on a save failure and does not enqueue an active download', async () => {
    jest.mocked(upsertCatalogTracks).mockRejectedValueOnce(new Error('storage'));
    jest.mocked(useDownloads).mockReturnValue({ downloads: [{ spotifyId: 'track-id', status: 'queued' }],
      enqueueDownloads: enqueue } as any);
    const screen = await render(<ImportModal visible initialInput="link" onClose={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Adicionar à biblioteca'));
    await screen.findByText('Erro ao buscar dados. Verifique o link e tente novamente.');
    await fireEvent.press(screen.getByLabelText('Adicionar à biblioteca'));
    await waitFor(() => expect(screen.queryByLabelText('Adicionar à biblioteca')).toBeNull());
    expect(fetchSpotifyTrackMetadata).toHaveBeenCalledTimes(1);
    expect(upsertCatalogTracks).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('Baixar todas as músicas')).toBeNull();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
