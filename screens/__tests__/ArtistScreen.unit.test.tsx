import { render, waitFor } from '@testing-library/react-native';

import {
  getArtist,
  getArtistAlbums,
  getArtistTopTracks,
  getCachedArtistSearchSeed,
  getYouTubeMusicArtistBiography,
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
  rememberCachedArtistImage,
} from '@services';
import { ArtistScreen } from '../ArtistScreen';

jest.mock('@api', () => ({
  getArtist: jest.fn(),
  getArtistAlbums: jest.fn(),
  getArtistTopTracks: jest.fn(),
  getYouTubeMusicArtistImage: jest.fn(),
  getYouTubeMusicArtistBiography: jest.fn().mockResolvedValue(''),
  getYouTubeMusicArtistProfile: jest.fn(),
  getCachedArtistSearchSeed: jest.fn(),
}));
jest.mock('@context', () => ({ usePlayer: jest.fn() }));
jest.mock('@services', () => ({
  getCachedArtistImage: jest.fn(),
  rememberCachedArtistImage: jest.fn(),
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
    CollectionDetail: ({ title, tracks, imageURL, extraTrackSections, description, metadata }: {
      title: string;
      tracks: unknown[];
      imageURL: string;
      extraTrackSections?: Array<{ id: string; tracks: unknown[] }>;
      description?: string;
      metadata?: string;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        React.createElement(Text, { testID: 'artist-image' }, imageURL || 'no-artist-image'),
        React.createElement(Text, null, `track-count:${tracks.length}`),
        React.createElement(Text, null, `participation-count:${extraTrackSections?.find((section) => section.id === 'participations')?.tracks.length || 0}`),
        React.createElement(Text, { testID: 'artist-description' }, description || '<empty>'),
        React.createElement(Text, { testID: 'artist-metadata' }, metadata || '<empty>')
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
    jest.mocked(getYouTubeMusicArtistBiography).mockResolvedValue('');
    jest.mocked(getCachedArtistSearchSeed).mockReturnValue(null);
    jest.mocked(rememberCachedArtistImage).mockResolvedValue(undefined);
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
      primaryTracks: [...value.primaryTracks, ...value.contextualTracks.filter((track) => {
        const primaryArtist = track.artists?.[0];
        const matches = primaryArtist?.id === value.artistId ||
          primaryArtist?.name.toLocaleLowerCase() === value.artistName.toLocaleLowerCase();
        return matches && !value.primaryTracks.some((primary) => primary.id === track.id);
      })],
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

  it('keeps the artist portrait and tracks found in search when profile loading fails', async () => {
    const artistId = 'ytartist_UCseed~Seed%20artist';
    const seedTrack = {
      id: 'yt_abcdefghijk',
      title: 'Seed track',
      subtitle: 'Seed artist',
      imageURL: 'https://images.example/seed-cover.jpg',
      durationMs: 180_000,
      artists: [{ id: artistId, name: 'Seed artist' }],
    };
    jest.mocked(getCachedArtistSearchSeed).mockReturnValue({
      artist: {
        id: artistId,
        type: 'artist',
        name: 'Seed artist',
        imageURL: 'https://images.example/seed-portrait.jpg',
      },
      tracks: [seedTrack],
    } as never);
    const view = await render(<ArtistScreen artistId={artistId} />);

    await waitFor(() => {
      expect(view.getByText('Seed artist')).toBeTruthy();
      expect(view.getByTestId('artist-image').props.children).toBe(
        'https://images.example/seed-portrait.jpg'
      );
      expect(view.getByText('track-count:1')).toBeTruthy();
    });
  });

  it('passes remote catalog tracks and participations without generic profile text', async () => {
    const artistId = 'ytartist_UCremote~Remote%20artist';
    jest.mocked(getYouTubeMusicArtistProfile).mockResolvedValue({
      artist: {
        id: artistId,
        type: 'artist',
        name: 'Remote artist',
        imageURL: 'https://images.example/remote-artist.jpg',
      },
      tracks: [{ id: 'primary-track', title: 'Primary', artists: [] }],
      participationTracks: [{ id: 'guest-track', title: 'Guest', artists: [] }],
    } as never);
    const view = await render(<ArtistScreen artistId={artistId} />);

    await waitFor(() => {
      expect(view.getByText('track-count:1')).toBeTruthy();
      expect(view.getByText('participation-count:1')).toBeTruthy();
    });
    expect(view.getByTestId('artist-description').props.children).toBe('<empty>');
    expect(view.getByTestId('artist-metadata').props.children).toBe('<empty>');
    expect(view.queryByText('Artista')).toBeNull();
  });
});
