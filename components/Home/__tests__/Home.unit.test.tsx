import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import { Home } from '../index';

jest.mock('@api', () => ({ searchCatalog: jest.fn() }));
jest.mock('@config', () => ({ BOTTOM_NAVIGATION_HEIGHT: 64 }));
jest.mock('@context', () => ({
  useLibrarySelectedCategory: () => ({ refreshLibrary: jest.fn() }),
  usePlayer: () => ({ playTrack: jest.fn() }),
}));
jest.mock('@hooks', () => ({
  useDetailNavigation: () => ({ openDetail: jest.fn() }),
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
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('@expo/vector-icons/Ionicons', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../CompactMusicCarousel', () => ({ CompactMusicCarousel: () => null }));
jest.mock('../HeroBanner/HeroBanner', () => ({ HeroBanner: () => null }));
jest.mock('../CatalogHome', () => ({ CatalogHome: () => null }));
jest.mock('../../ImportModal', () => ({ ImportModal: () => null }));
jest.mock('../../native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable } = require('react-native');
  return { LoggedPressable: Pressable };
});

describe('Home', () => {
  it('dismisses the keyboard when clearing music and artist search', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const view = await render(<Home />);

    await fireEvent.changeText(view.getByLabelText('Buscar músicas e artistas'), 'Tarôs');
    await fireEvent.press(await view.findByLabelText('Limpar busca'));

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(view.queryByLabelText('Limpar busca')).toBeNull();
    dismiss.mockRestore();
  });
});
