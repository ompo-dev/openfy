import { render, waitFor } from '@testing-library/react-native';

import {
  findArtistIdByName,
  getArtist,
  getArtistDiscography,
  getArtistTopTracks,
  getCachedArtistSearchSeed,
  getYouTubeMusicArtistBiography,
  getYouTubeMusicArtistImage,
  getYouTubeMusicArtistProfile,
} from '@api';
import { usePlayer } from '@context';
import { useDetailNavigation } from '@hooks';
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
  findArtistIdByName: jest.fn(),
  getArtist: jest.fn(),
  getArtistCatalogImage: jest.fn().mockResolvedValue(''),
  getArtistDiscography: jest.fn(),
  getArtistTopTracks: jest.fn(),
  getYouTubeMusicArtistImage: jest.fn(),
  getYouTubeMusicArtistBiography: jest.fn().mockResolvedValue(''),
  getYouTubeMusicArtistProfile: jest.fn(),
  getCachedArtistSearchSeed: jest.fn(),
}));
jest.mock('@context', () => ({ usePlayer: jest.fn() }));
jest.mock('@hooks', () => ({ useDetailNavigation: jest.fn() }));
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
  const openDetail = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useDetailNavigation).mockReturnValue({
      openDetail,
      section: 'library',
    } as never);
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
    jest.mocked(findArtistIdByName).mockResolvedValue('');
    jest.mocked(getArtistTopTracks).mockResolvedValue([] as never);
    jest.mocked(getArtistDiscography).mockResolvedValue({ albums: [], tracks: [] });
  });

  afterEach(() => consoleError.mockRestore());

  it('keeps existing local artist profiles visible when remote Spotify data fails', async () => {
    const view = await render(<ArtistScreen artistId="existing-artist-id" />);

    await waitFor(() => {
      expect(view.getByText('Artista existente')).toBeTruthy();
      expect(view.getByText('track-count:1')).toBeTruthy();
    });
  });

  it('uses the canonical Spotify artist id for a legacy name-only route', async () => {
    const spotifyArtistId = '1234567890123456789012';
    jest.mocked(findArtistIdByName).mockResolvedValue(spotifyArtistId);
    jest.mocked(getArtist).mockResolvedValue({
      id: spotifyArtistId,
      type: 'artist',
      name: 'Ebony',
      imageURL: '',
    } as never);

    await render(<ArtistScreen artistId="ytartist_name_Ebony" />);

    await waitFor(() => {
      expect(getArtist).toHaveBeenCalledWith(spotifyArtistId);
    });
    expect(openDetail).not.toHaveBeenCalled();
  });

  it('does not let a late local-library response overwrite the full public artist catalog', async () => {
    const artistId = 'ytartist_UCEbony~Ebony';
    const remoteTracks = [
      { id: 'catalog-1', title: 'Catalog one', artists: [{ name: 'Ebony' }] },
      { id: 'catalog-2', title: 'Catalog two', artists: [{ name: 'Ebony' }] },
    ];
    jest.mocked(findArtistIdByName).mockResolvedValue('');
    jest.mocked(getLibraryTracks).mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve([localTrack] as never), 25);
    }));
    jest.mocked(groupLocalArtists).mockReturnValue([{
      id: 'spotify:ebony-id',
      spotifyArtistId: 'ebony-id',
      title: 'Ebony',
      imageURL: '',
      tracks: [localTrack],
    }] as never);
    jest.mocked(getYouTubeMusicArtistProfile).mockResolvedValue({
      artist: { id: artistId, type: 'artist', name: 'Ebony', imageURL: '' },
      tracks: remoteTracks,
      participationTracks: [],
    } as never);

    const view = await render(<ArtistScreen artistId={artistId} />);
    await waitFor(() => expect(view.getByText('track-count:2')).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(view.getByText('track-count:2')).toBeTruthy();
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

  it('supplements a sparse Spotify discography for a YouTube search artist route', async () => {
    const artistId = 'ytartist_UCspotify~Artista%20Real';
    const spotifyArtistId = '1234567890123456789012';
    jest.mocked(findArtistIdByName).mockResolvedValue(spotifyArtistId);
    jest.mocked(getArtist).mockResolvedValue({
      id: spotifyArtistId,
      type: 'artist',
      name: 'Artista Real',
      imageURL: 'https://images.example/spotify-artist.jpg',
    } as never);
    jest.mocked(getArtistTopTracks).mockResolvedValue([{
      id: 'spotify-popular-track',
      title: 'Faixa popular oficial',
      artists: [{ id: spotifyArtistId, name: 'Artista Real' }],
    }] as never);
    jest.mocked(getArtistDiscography).mockResolvedValue({
      albums: [{
        id: 'spotify-album',
        type: 'album',
        title: 'Álbum oficial',
        imageURL: 'https://images.example/album.jpg',
        subtitle: '2025 · album',
      }],
      tracks: [{
        id: 'spotify-catalog-track',
        title: 'Faixa do catálogo oficial',
        artists: [{ id: spotifyArtistId, name: 'Artista Real' }],
      }],
    } as never);

    const view = await render(<ArtistScreen artistId={artistId} />);

    await waitFor(() => {
      expect(view.getByText('track-count:2')).toBeTruthy();
    });
    expect(view.getByText('Artista Real')).toBeTruthy();
    expect(getYouTubeMusicArtistProfile).toHaveBeenCalledWith(
      'ytartist_name_Artista%20Real'
    );
    expect(getArtistDiscography).toHaveBeenCalledWith(spotifyArtistId);
  });

  it('enriches a sparse canonical artist profile with the full public catalog', async () => {
    const spotifyArtistId = '1234567890123456789012';
    const spotifyTracks = Array.from({ length: 19 }, (_, index) => ({
      id: `spotify-${index}`,
      title: `Spotify track ${index}`,
      artists: [{ id: spotifyArtistId, name: 'Ebony' }],
    }));
    const publicTracks = Array.from({ length: 45 }, (_, index) => ({
      id: `youtube-${index}`,
      title: `Public track ${index}`,
      artists: [{ name: 'Ebony' }],
    }));
    jest.mocked(getArtist).mockResolvedValue({
      id: spotifyArtistId,
      type: 'artist',
      name: 'Ebony',
      imageURL: '',
    } as never);
    jest.mocked(getArtistTopTracks).mockResolvedValue([] as never);
    jest.mocked(getArtistDiscography).mockResolvedValue({
      albums: [],
      tracks: spotifyTracks,
    } as never);
    jest.mocked(getYouTubeMusicArtistProfile).mockResolvedValue({
      artist: {
        id: 'ytartist_UCEbony~Ebony',
        type: 'artist',
        name: 'Ebony',
        imageURL: 'https://images.example/ebony.jpg',
      },
      tracks: publicTracks,
      participationTracks: [],
    } as never);

    const view = await render(<ArtistScreen artistId={spotifyArtistId} />);

    await waitFor(() => {
      expect(view.getByText('track-count:64')).toBeTruthy();
    });
    expect(getYouTubeMusicArtistProfile).toHaveBeenCalledWith(
      'ytartist_name_Ebony'
    );
  });

  it('falls back to the public YouTube Music catalog when Spotify has no session', async () => {
    const artistId = 'ytartist_UCpedro~Pedro%20Qualy';
    const spotifyArtistId = '1234567890123456789012';
    jest.mocked(findArtistIdByName).mockResolvedValue(spotifyArtistId);
    jest.mocked(getArtist).mockResolvedValue(null as never);
    jest.mocked(getArtistTopTracks).mockResolvedValue([] as never);
    jest.mocked(getArtistDiscography).mockRejectedValue(new Error('Spotify session missing'));
    jest.mocked(getYouTubeMusicArtistProfile).mockResolvedValue({
      artist: {
        id: artistId,
        type: 'artist',
        name: 'Pedro Qualy',
        imageURL: 'https://images.example/pedro.jpg',
      },
      tracks: [
        { id: 'yt_first', title: 'Tarôs', artists: [{ name: 'Pedro Qualy' }] },
        { id: 'yt_second', title: 'Papel de Parede', artists: [{ name: 'Pedro Qualy' }] },
      ],
      participationTracks: [{ id: 'yt_feature', title: 'Participação', artists: [{ name: 'Other' }, { name: 'Pedro Qualy' }] }],
    } as never);

    const view = await render(<ArtistScreen artistId={artistId} />);

    await waitFor(() => {
      expect(view.getByText('track-count:2')).toBeTruthy();
      expect(view.getByText('participation-count:1')).toBeTruthy();
    });
    expect(getYouTubeMusicArtistProfile).toHaveBeenCalledWith(artistId);
  });

  it('supplements a Spotify-id local profile with the public artist catalog', async () => {
    const spotifyArtistId = '1234567890123456789012';
    jest.mocked(groupLocalArtists).mockReturnValue([{
      id: `spotify:${spotifyArtistId}`,
      spotifyArtistId,
      title: 'Artista existente',
      imageURL: '',
      tracks: [localTrack],
    }] as never);
    jest.mocked(getYouTubeMusicArtistProfile).mockResolvedValue({
      artist: {
        id: 'ytartist_UCartist~Artista%20existente',
        type: 'artist',
        name: 'Artista existente',
        imageURL: 'https://images.example/artist.jpg',
      },
      tracks: [{ id: 'yt_full_catalog', title: 'Faixa fora da biblioteca' }],
      participationTracks: [],
    } as never);

    const view = await render(<ArtistScreen artistId={spotifyArtistId} />);

    await waitFor(() => {
      expect(view.getByText('track-count:2')).toBeTruthy();
    });
    expect(getYouTubeMusicArtistProfile).toHaveBeenCalledWith(
      'ytartist_name_Artista%20existente'
    );
  });
});
