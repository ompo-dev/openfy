import { render, waitFor } from '@testing-library/react-native';

import {
  getArtist,
  getArtistAlbums,
  getArtistTopTracks,
  getYouTubeMusicArtistImage,
  getYouTubeMusicArtistProfile,
} from '@api';
import { usePlayer } from '@context';
import {
  getCachedArtistImage,
  getLibraryTracks,
  getUserProfile,
  groupLocalAlbums,
  groupLocalArtists,
  isTrackParticipantArtist,
  isTrackPrimaryArtist,
  mergeArtistProfileTracks,
} from '@services';
import { ArtistScreen } from '../ArtistScreen';

jest.mock('@api', () => ({
  getArtist: jest.fn(),
  getArtistAlbums: jest.fn(),
  getArtistTopTracks: jest.fn(),
  getYouTubeMusicArtistImage: jest.fn(),
  getYouTubeMusicArtistProfile: jest.fn(),
}));
jest.mock('@context', () => ({ usePlayer: jest.fn() }));
jest.mock('@services', () => ({
  getCachedArtistImage: jest.fn(),
  getLibraryTracks: jest.fn(),
  getUserProfile: jest.fn(),
  groupLocalAlbums: jest.fn(),
  groupLocalArtists: jest.fn(),
  isTrackParticipantArtist: jest.fn(),
  isTrackPrimaryArtist: jest.fn(),
  mergeArtistProfileTracks: jest.fn(),
}));
jest.mock('@components', () => {
  const React = jest.requireActual('react');
  const { Text, View } = jest.requireActual('react-native');
  return {
    CollectionDetail: ({ title, tracks, imageURL }: {
      title: string;
      tracks: unknown[];
      imageURL: string;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        React.createElement(Text, { testID: 'artist-image' }, imageURL || 'no-artist-image'),
        React.createElement(Text, null, `track-count:${tracks.length}`)
      ),
  };
});
jest.mock('../../components/Slider', () => ({ Slider: () => null }));
jest.mock('../../services/metadata/spotifyMetadata', () => ({
  getSpotifyArtistImage: jest.fn().mockResolvedValue(''),
}));

const localTrack = {
  spotifyId: 'saved-track',
  title: 'Faixa salva',
  artistName: 'Artista existente',
  albumName: 'Álbum salvo',
  duration_ms: 180_000,
  imageURL: 'https://images.example/cover.jpg',
  artists: [{ id: 'existing-artist-id', name: 'Artista existente' }],
  albumArtists: [{ id: 'existing-artist-id', name: 'Artista existente' }],
};

describe('ArtistScreen', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(usePlayer).mockReturnValue({ currentTrack: null } as never);
    jest.mocked(getLibraryTracks).mockResolvedValue([localTrack] as never);
    jest.mocked(getCachedArtistImage).mockResolvedValue('');
    jest.mocked(getYouTubeMusicArtistImage).mockResolvedValue('');
    jest.mocked(getYouTubeMusicArtistProfile).mockRejectedValue(new Error('YTM profile unavailable'));
    jest.mocked(getUserProfile).mockResolvedValue({ recentlyPlayedTracks: [] } as never);
    jest.mocked(groupLocalArtists).mockReturnValue([{
      id: 'spotify:existing-artist-id',
      spotifyArtistId: 'existing-artist-id',
      title: 'Artista existente',
      imageURL: '',
      tracks: [localTrack],
    }] as never);
    jest.mocked(groupLocalAlbums).mockReturnValue([] as never);
    jest.mocked(isTrackPrimaryArtist).mockReturnValue(true);
    jest.mocked(isTrackParticipantArtist).mockReturnValue(false);
    jest.mocked(mergeArtistProfileTracks).mockImplementation((value) => ({
      primaryTracks: value.primaryTracks,
      participationTracks: value.participationTracks,
    }));
    jest.mocked(getArtist).mockRejectedValue(new Error('Spotify profile unavailable'));
    jest.mocked(getArtistTopTracks).mockResolvedValue([] as never);
    jest.mocked(getArtistAlbums).mockResolvedValue([] as never);
  });

  afterEach(() => consoleError.mockRestore());

  it('keeps existing local artist profiles visible when remote Spotify data fails', async () => {
    const view = await render(<ArtistScreen artistId="existing-artist-id" />);

    await waitFor(() => {
      expect(view.getByText('Artista existente')).toBeTruthy();
      expect(view.getByText('track-count:1')).toBeTruthy();
    });
  });

  it('never uses a song cover as the artist portrait when the remote profile is unavailable', async () => {
    const view = await render(
      <ArtistScreen artistId="ytartist_UCartist~Artista%20existente" />
    );

    await waitFor(() => {
      expect(view.getByText('Artista existente')).toBeTruthy();
      expect(view.getByTestId('artist-image').props.children).toBe('no-artist-image');
    });
    expect(view.queryByText('https://images.example/cover.jpg')).toBeNull();
  });
});
