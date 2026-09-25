import {
  buildPersonalizedHome,
  type PersonalizedHomeTrack,
} from '../personalizedHome';
import type { LibraryTrack } from '../../library/catalogLibrary';
import type { LocalPlaylist } from '../../library/localPlaylistManager';
import type { UserProfile } from '../../recommendation/recommendationEngine';

const track = (
  spotifyId: string,
  title: string,
  artist: { id: string; name: string },
  overrides: Partial<LibraryTrack> = {}
): LibraryTrack => ({
  id: `catalog_${spotifyId}`,
  spotifyId,
  title,
  artistName: artist.name,
  artists: [artist],
  albumName: `${artist.name} Album`,
  imageURL: `https://images.example/${spotifyId}.jpg`,
  duration_ms: 180_000,
  sourcePlatform: 'spotify',
  addedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  isDownloaded: false,
  ...overrides,
});

const profile: UserProfile = {
  artistWeights: { Sotam: 20, 'Pedro Qualy': 8 },
  genreWeights: {},
  recentlyPlayedTracks: [],
  totalListens: 12,
};

const playlists: LocalPlaylist[] = [{
  id: 'playlist-1',
  sourcePlatform: 'spotify',
  sourceId: 'source-playlist-1',
  title: 'Favoritas',
  trackIds: ['track-sotam-2'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}];

const library = [
  track('track-sotam-1', 'Primeira', { id: 'artist-sotam', name: 'Sotam' }),
  track('track-sotam-2', 'Segunda', { id: 'artist-sotam', name: 'Sotam' }),
  track('track-pedro-1', 'Terceira', { id: 'artist-pedro', name: 'Pedro Qualy' }),
  track('track-outro-1', 'Quarta', { id: 'artist-outro', name: 'Outro Artista' }),
];

describe('personalizedHome', () => {
  it('builds deterministic, diverse recommendations from local signals', () => {
    const first = buildPersonalizedHome({
      allowExplicitRecommendations: true,
      personalized: true,
      playlists,
      profile,
      seed: 'fixed-seed',
      tracks: library,
    });
    const second = buildPersonalizedHome({
      allowExplicitRecommendations: true,
      personalized: true,
      playlists,
      profile,
      seed: 'fixed-seed',
      tracks: library,
    });

    expect(first.quickPicks.map((item) => item.spotifyId)).toEqual(
      second.quickPicks.map((item) => item.spotifyId)
    );
    expect(new Set(first.quickPicks.map((item) => item.spotifyId)).size).toBe(
      first.quickPicks.length
    );
    expect(first.seeds[0]).toMatchObject({ id: 'artist-sotam', name: 'Sotam' });
    expect(first.artists).toEqual([]);
    expect(first.playlists[0].id).toBe('playlist-1');
  });

  it('keeps discoveries new and honors the explicit-content preference', () => {
    const discoveries: PersonalizedHomeTrack[] = [
      {
        id: 'known',
        spotifyId: 'track-sotam-1',
        title: 'Primeira',
        artistName: 'Sotam',
        albumName: 'Album',
        imageURL: '',
        duration_ms: 100_000,
      },
      {
        id: 'explicit',
        spotifyId: 'new-explicit',
        title: 'Nova explícita',
        artistName: 'Sotam',
        albumName: 'Album',
        imageURL: '',
        duration_ms: 100_000,
        explicit: true,
      },
      {
        id: 'clean',
        spotifyId: 'new-clean',
        title: 'Nova limpa',
        artistName: 'Pedro Qualy',
        albumName: 'Album',
        imageURL: '',
        duration_ms: 100_000,
      },
    ];
    const home = buildPersonalizedHome({
      allowExplicitRecommendations: false,
      discoveries,
      personalized: true,
      playlists,
      profile,
      seed: 'fixed-seed',
      tracks: library,
    });

    expect(home.discoveries.map((item) => item.spotifyId)).toEqual(['new-clean']);
    expect(home.discoveryTitle).toBe('Descobertas para você');
  });

  it('recommends discovered artists that are not already in the library', () => {
    const discoveries: PersonalizedHomeTrack[] = [{
      id: 'discovery-collab',
      spotifyId: 'new-collab-track',
      title: 'Colaboração nova',
      artistName: 'Sotam, Artista Nova',
      artists: [
        { id: 'artist-sotam', name: 'Sotam' },
        { id: 'artist-new', name: 'Artista Nova' },
      ],
      albumName: 'Single',
      imageURL: 'https://images.example/new.jpg',
      duration_ms: 180_000,
    }];

    const home = buildPersonalizedHome({
      allowExplicitRecommendations: true,
      discoveries,
      personalized: true,
      playlists,
      profile,
      seed: 'fixed-seed',
      tracks: library,
    });

    expect(home.artists).toEqual([
      expect.objectContaining({
        spotifyArtistId: 'artist-new',
        title: 'Artista Nova',
      }),
    ]);
    expect(home.artists).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Sotam' })])
    );
  });

  it('keeps listening-history artists as seeds before they are saved', () => {
    const historyOnlyProfile: UserProfile = {
      artistWeights: { 'Artista do streaming': 7 },
      genreWeights: {},
      recentlyPlayedTracks: [],
      totalListens: 2,
    };
    const home = buildPersonalizedHome({
      allowExplicitRecommendations: true,
      personalized: true,
      playlists: [],
      profile: historyOnlyProfile,
      seed: 'fixed-seed',
      tracks: [],
    });

    expect(home.seeds[0]).toEqual({
      id: undefined,
      name: 'Artista do streaming',
      score: 28,
    });
  });
});
