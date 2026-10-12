import * as React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { ListeningHome } from '../ListeningHome';
import { EMPTY_PERSONALIZED_HOME, type PersonalizedHomeSnapshot, type PersonalizedHomeTrack } from '../../../services/home/personalizedHome';
import { getPlayerAlbum } from '../../../services/library/playerAlbum';

const mockPlay = jest.fn().mockResolvedValue(undefined);
const mockToggle = jest.fn();
const mockOpen = jest.fn();
const song: PersonalizedHomeTrack = { id: 'one', spotifyId: 'one', title: 'Disco', artistName: 'Ebony',
  albumName: 'KM2', albumId: 'album', artists: [{ id: 'ebony', name: 'Ebony' }], duration_ms: 150_000,
  imageURL: 'cover', youtubeVideoId: 'abcdefghijk' };
let mockCurrent: PersonalizedHomeTrack | null = null;

jest.mock('@context', () => ({
  usePlayer: () => ({ currentTrack: mockCurrent, isPlaying: true, playWithQueue: mockPlay, togglePlayPause: mockToggle }),
  useDownloads: () => ({ downloads: [], enqueueDownloads: jest.fn() }),
}));
jest.mock('@hooks', () => ({ useDetailNavigation: () => ({ openDetail: mockOpen }) }));
jest.mock('@api', () => ({ getArtistCatalogImage: jest.fn().mockResolvedValue('portrait') }));
jest.mock('@services', () => ({ getCachedArtistImage: jest.fn().mockResolvedValue('portrait') }));
jest.mock('../../../services/library/playerAlbum', () => ({ getPlayerAlbum: jest.fn() }));
jest.mock('../../../services/navigation/detailPrefetch', () => ({ prefetchDetail: jest.fn() }));
jest.mock('lucide-react-native', () => Object.fromEntries(['Clock3', 'Disc3', 'Headphones', 'ListMusic', 'Pin', 'Radio', 'Sparkles', 'ChevronRight', 'Play'].map((name) => [name, () => null])));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../PlaylistMosaic', () => ({ PlaylistMosaic: () => null }));
jest.mock('../../common/SkeletonImage', () => ({ SkeletonImage: () => null }));
jest.mock('../../common/TrackRow', () => ({ TrackRow: () => null }));
jest.mock('../../native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, View } = require('react-native');
  return { LoggedPressable: Pressable, GlassSurface: View, AppIcon: () => null };
});

const home: PersonalizedHomeSnapshot = {
  ...EMPTY_PERSONALIZED_HOME, continueListening: [song], pinnedTracks: [song], mostPlayed: [song],
  playlists: [{ id: 'playlist', title: 'Favoritas', trackIds: ['one'], sourcePlatform: 'local', sourceId: 'playlist', createdAt: '', updatedAt: '' }],
  releases: [{ id: 'album', title: 'KM2', artistName: 'Ebony', artistId: 'ebony', artistImageURL: '',
    imageURL: 'cover', releaseDate: '2026-09-01', releaseType: 'album' }],
  tracksById: new Map(),
};

describe('ListeningHome', () => {
  beforeEach(() => { jest.clearAllMocks(); mockCurrent = null; });

  it('renders listening sections and preserves playback metadata in the queue', async () => {
    const view = await render(<ListeningHome home={home} loading={false} />);
    for (const title of ['Pinados', 'Tocados recentemente', 'Playlists recentes', 'Novos lançamentos para você', 'Não sai do seu fone']) {
      expect(await view.findByText(title)).toBeTruthy();
    }
    await fireEvent.press(view.getAllByLabelText('Tocar Disco, Ebony')[0]);
    expect(mockPlay).toHaveBeenCalledWith([expect.objectContaining({ albumId: 'album', youtubeVideoId: 'abcdefghijk' })], 0, 'home:pinned');
  });

  it('toggles the current song instead of restarting it', async () => {
    mockCurrent = song;
    const view = await render(<ListeningHome home={home} loading={false} />);
    await fireEvent.press(view.getAllByLabelText('Tocar Disco, Ebony')[0]);
    expect(mockToggle).toHaveBeenCalledTimes(1);
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('opens recent playlists and starts a release with its complete queue', async () => {
    jest.mocked(getPlayerAlbum).mockResolvedValue({ tracks: [song] } as never);
    const view = await render(<ListeningHome home={home} loading={false} />);
    await fireEvent.press(await view.findByLabelText('Abrir playlist Favoritas'));
    expect(mockOpen).toHaveBeenCalledWith('playlist', 'playlist', 'home');
    await fireEvent.press(await view.findByLabelText('Tocar KM2'));
    expect(mockOpen).toHaveBeenCalledWith('album', 'album', 'home');
    expect(mockPlay).toHaveBeenCalledWith([song], 0, 'album:album', { continueCurrent: true });
  });

  it('shows a skeleton while initial data is loading', async () => {
    const view = await render(<ListeningHome home={EMPTY_PERSONALIZED_HOME} loading />);
    expect(view.getByTestId('home-skeleton')).toBeTruthy();
  });

  it('shows multiple different radio and discovery shelves and plays the complete radio queue', async () => {
    const second = { ...song, spotifyId: 'two', title: 'Outra', artistName: 'Sotam' };
    const discoveries = Array.from({ length: 17 }, (_, index) => ({ ...song, spotifyId: `discovery-${index}`, title: `Descoberta ${index}` }));
    const expanded = { ...home, discoveries, radios: [
      { seed: { name: 'Ebony', score: 1 }, tracks: [song] },
      { seed: { name: 'Sotam', score: 1 }, tracks: [song, second] },
    ] };
    const view = await render(<ListeningHome home={expanded} loading={false} />);
    expect(await view.findByText('Parecido com Ebony')).toBeTruthy();
    expect(await view.findByText('Parecido com Sotam')).toBeTruthy();
    await waitFor(() => expect(view.getAllByText('Mais descobertas para você')).toHaveLength(2));
    await fireEvent.press(await view.findByLabelText('Tocar Outra, Sotam'));
    expect(mockPlay).toHaveBeenCalledWith([song, second], 1, expect.stringMatching(/^playlist:home_mix_radio_/));
  });

  it('renders recommendation families interleaved, not in repeated vertical runs', async () => {
    const discoveries = Array.from({ length: 17 }, (_, index) => ({ ...song, spotifyId: `fresh-${index}` }));
    const releases = Array.from({ length: 24 }, (_, index) => ({ ...home.releases[0], id: `album-${index}`,
      artistId: `artist-${index % 3}`, artistName: `Artist ${index % 3}`, title: `Release ${index}` }));
    const radios = [0, 1, 2].map((index) => ({ seed: { name: `Artist ${index}`, score: 1 },
      tracks: [{ ...song, spotifyId: `radio-${index}` }] }));
    const view = await render(<ListeningHome home={{ ...home, releases, discoveries, radios }} loading={false} />);
    await waitFor(() => expect(view.getAllByTestId('home-listening-section')).toHaveLength(16), { timeout: 5000 });
    const families = view.getAllByTestId('home-listening-section').map((section) => {
      const heading = within(section).getByRole('header');
      const title = (heading.props.accessibilityLabel || heading.props.children) as string;
      if (/lançamentos para/.test(title)) return 'releases';
      if (/descobertas/.test(title)) return 'discoveries';
      if (/Parecido com/.test(title)) return 'radio';
      if (title.startsWith('Lançamento de')) return 'spotlight';
      return title;
    });
    families.slice(1).forEach((family, index) => expect(family).not.toBe(families[index]));
  });

  it('opens dynamic listening collections as playlist pages, not modals', async () => {
    const view = await render(<ListeningHome home={home} loading={false} />);
    await fireEvent.press(await view.findByLabelText('Mostrar tudo: Tocados recentemente'));
    expect(mockOpen).toHaveBeenCalledWith('playlist', 'home_mix_recent', 'home');
    await fireEvent.press(await view.findByLabelText('Mostrar tudo: Não sai do seu fone'));
    expect(mockOpen).toHaveBeenCalledWith('playlist', 'home_mix_most_played', 'home');
  });
});
