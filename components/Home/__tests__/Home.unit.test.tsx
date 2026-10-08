import * as React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import { getCatalogSearchSuggestions, searchCatalog } from '@api';
import { getCachedArtistImage, upsertCatalogTracks } from '@services';
import { rememberSearchSelection, removeSearchHistoryEntry, type SearchHistoryEntry } from '../../../services/search/searchHistory';

import { Home } from '../index';
const mockPlayQueue = jest.fn();
const mockOpenDetail = jest.fn();
let mockHistoryEntries: SearchHistoryEntry[] = [];
let mockTabPressListener: (() => void) | undefined;

jest.mock('@api', () => ({
  searchCatalog: jest.fn(),
  getArtistCatalogImage: jest.fn().mockResolvedValue(''),
  getCatalogSearchSuggestions: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../services/search/searchHistory', () => ({
  getSearchHistory: jest.fn().mockResolvedValue([]),
  subscribeSearchHistory: (listener: (entries: SearchHistoryEntry[]) => void) => { listener(mockHistoryEntries); return () => {}; },
  rememberSearchSelection: jest.fn().mockResolvedValue(undefined),
  removeSearchHistoryEntry: jest.fn().mockResolvedValue(undefined),
  clearSearchHistory: jest.fn().mockResolvedValue(undefined),
  searchHistoryKey: (entry: SearchHistoryEntry) => `${entry.kind}:${entry.kind === 'artist' ? entry.artist.id : entry.track.id}`,
}));
jest.mock('@config', () => ({ BOTTOM_NAVIGATION_HEIGHT: 64 }));
jest.mock('@context', () => ({
  useLibrarySelectedCategory: () => ({ refreshLibrary: jest.fn() }),
  usePlayer: () => ({ currentTrack: null, isPlaying: false, playWithQueue: mockPlayQueue, togglePlayPause: jest.fn() }),
}));
jest.mock('@hooks', () => ({
  useDetailNavigation: () => ({ openDetail: mockOpenDetail }),
  usePersonalizedHome: () => ({
    home: {
      discoveries: [],
      quickPicks: [],
      tracksById: new Map(),
      featured: [],
      artists: [],
      continueListening: [],
      discoveryTitle: 'Para você',
    },
    isLoading: false,
    isRefreshing: false,
    refresh: jest.fn(),
  }),
}));
jest.mock('@services', () => ({
  getCachedArtistImage: jest.fn(),
  rememberCachedArtistImage: jest.fn(),
  upsertCatalogTracks: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({
    addListener: jest.fn((_event: string, listener: () => void) => {
      mockTabPressListener = listener;
      return jest.fn();
    }),
  }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../CompactMusicCarousel', () => ({ CompactMusicCarousel: () => null }));
jest.mock('../HeroBanner/HeroBanner', () => ({ HeroBanner: () => null }));
jest.mock('../CatalogHome', () => ({ CatalogHome: () => null }));
jest.mock('../ListeningHome', () => ({ ListeningHome: () => null }));
jest.mock('../../ImportModal', () => ({ ImportModal: () => null }));
jest.mock('../../native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, View } = require('react-native');
  return { LoggedPressable: Pressable, GlassSurface: View };
});

describe('Home', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHistoryEntries = [];
    mockTabPressListener = undefined;
    jest.mocked(getCatalogSearchSuggestions).mockResolvedValue([]);
    jest.mocked(getCachedArtistImage).mockResolvedValue('');
  });
  it('dismisses the keyboard when clearing music and artist search', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const view = await render(<Home />);

    await fireEvent.changeText(view.getByLabelText('Buscar músicas e artistas'), 'Tarôs');
    await fireEvent.press(await view.findByLabelText('Limpar busca'));

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(view.queryByLabelText('Limpar busca')).toBeNull();
    dismiss.mockRestore();
  });

  it('leaves search mode when the Home tab is pressed', async () => {
    const view = await render(<Home />);

    const input = view.getByLabelText('Buscar músicas e artistas');
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, 'aotam');
    expect(view.getByLabelText('Cancelar busca')).toBeTruthy();
    mockTabPressListener?.();

    await waitFor(() => {
      expect(view.getByLabelText('Buscar músicas e artistas').props.value).toBe('');
      expect(view.queryByLabelText('Cancelar busca')).toBeNull();
    });
  });

  it('hydrates portraits for artists recovered from song credits', async () => {
    jest.mocked(searchCatalog).mockResolvedValue({
      artists: [{ type: 'artist', id: 'ytartist_UCsotam~Sotam', name: 'Sotam', imageURL: '' }],
      tracks: [],
    });
    jest.mocked(getCachedArtistImage).mockResolvedValue('sotam.jpg');
    const view = await render(<Home />);

    await fireEvent.changeText(view.getByLabelText('Buscar músicas e artistas'), 'aotam');
    await view.findByLabelText('Abrir artista Sotam');

    await waitFor(() => expect(getCachedArtistImage).toHaveBeenCalledWith(
      'Sotam',
      expect.any(Function),
      ['ytartist_UCsotam~Sotam'],
    ));
  });

  it('uses the common music row and preserves search queue metadata without playing when saving', async () => {
    const track = { id: 'yt_OZphib375D0', title: 'KIA', subtitle: 'Ebony',
      durationMs: 140000, imageURL: 'cover', youtubeVideoId: 'OZphib375D0' };
    jest.mocked(searchCatalog).mockResolvedValue({ artists: [], tracks: [track] } as never);
    const view = await render(<Home />);
    await fireEvent.changeText(view.getByLabelText('Buscar músicas e artistas'), 'KIA');
    await view.findByLabelText('Tocar KIA');
    await fireEvent.press(view.getByLabelText('Tocar KIA'));
    expect(mockPlayQueue).toHaveBeenCalledWith([expect.objectContaining({
      youtubeVideoId: 'OZphib375D0', duration_ms: 140000,
    })], 0, 'home:search');
    expect(rememberSearchSelection).toHaveBeenCalledWith({ kind: 'track', track });
    const stopPropagation = jest.fn();
    await fireEvent.press(view.getByLabelText('Adicionar KIA à Biblioteca'), { stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
    expect(upsertCatalogTracks).toHaveBeenCalled();
    expect(mockPlayQueue).toHaveBeenCalledTimes(1);
  });

  it('records the actual artist selected from a corrected search, not the typed typo', async () => {
    const artist = { type: 'artist' as const, id: 'ytartist_sotam', name: 'Sotam', imageURL: 'artist.jpg' };
    jest.mocked(searchCatalog).mockResolvedValue({ artists: [artist], tracks: [] });
    const view = await render(<Home />);
    await fireEvent.changeText(view.getByLabelText('Buscar músicas e artistas'), 'aotam');
    await fireEvent.press(await view.findByLabelText('Abrir artista Sotam'));
    expect(mockOpenDetail).toHaveBeenCalledWith('artist', artist.id, 'home');
    expect(rememberSearchSelection).toHaveBeenCalledWith({ kind: 'artist', artist });
  });

  it('shows selected artists and songs as recents and removes an entry without opening it', async () => {
    mockHistoryEntries = [
      { kind: 'artist', artist: { type: 'artist', id: 'sotam', name: 'Sotam', imageURL: 'artist.jpg' }, selectedAt: 2 },
      { kind: 'track', track: { id: 'song', title: 'Cura', subtitle: 'Sotam', youtubeVideoId: 'abcdefghijk' }, selectedAt: 1 },
    ];
    const view = await render(<Home />);
    await fireEvent(view.getByLabelText('Buscar músicas e artistas'), 'focus');
    expect(view.getByText('Recentes')).toBeTruthy();
    expect(view.getByLabelText('Abrir artista Sotam')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Remover Sotam dos recentes'), { stopPropagation: jest.fn() });
    expect(removeSearchHistoryEntry).toHaveBeenCalledWith('artist:sotam');
    expect(mockOpenDetail).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText('Tocar Cura'));
    expect(mockPlayQueue).toHaveBeenCalledWith([expect.objectContaining({ youtubeVideoId: 'abcdefghijk' })], 0, 'home:search-history');
  });

  it('completes the query from a suggestion without adding unselected queries to history', async () => {
    jest.mocked(getCatalogSearchSuggestions).mockResolvedValue(['Sotam sinceramente']);
    jest.mocked(searchCatalog).mockResolvedValue({ artists: [], tracks: [] });
    const view = await render(<Home />);
    await fireEvent.changeText(view.getByLabelText('Buscar músicas e artistas'), 'aot');
    await fireEvent.press(await view.findByLabelText('Pesquisar Sotam sinceramente'));
    expect(view.getByLabelText('Buscar músicas e artistas').props.value).toBe('Sotam sinceramente');
    expect(rememberSearchSelection).not.toHaveBeenCalled();
  });

  it('dismisses on result scrolling and touches outside the field without intercepting input touches', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const view = await render(<Home />);
    const input = view.getByLabelText('Buscar músicas e artistas');
    const stopPropagation = jest.fn();
    await fireEvent(input, 'touchStart', { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(dismiss).not.toHaveBeenCalled();
    await fireEvent(view.getByTestId('home-search-body'), 'touchStart');
    await fireEvent(view.getByTestId('home-scroll'), 'scrollBeginDrag');
    expect(dismiss).toHaveBeenCalledTimes(2);
    dismiss.mockRestore();
  });
});
