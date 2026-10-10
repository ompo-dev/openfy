import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
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

  it('opens dynamic listening collections as playlist pages, not modals', async () => {
    const view = await render(<ListeningHome home={home} loading={false} />);
    await fireEvent.press(await view.findByLabelText('Mostrar tudo: Tocados recentemente'));
    expect(mockOpen).toHaveBeenCalledWith('playlist', 'home_mix_recent', 'home');
    await fireEvent.press(await view.findByLabelText('Mostrar tudo: Não sai do seu fone'));
    expect(mockOpen).toHaveBeenCalledWith('playlist', 'home_mix_most_played', 'home');
  });
});
