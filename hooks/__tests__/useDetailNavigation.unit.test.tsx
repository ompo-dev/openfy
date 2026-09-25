import { act, renderHook } from '@testing-library/react-native';
import { useRouter, useSegments } from 'expo-router';
import {
  getDetailHref,
  getSectionFromSegments,
  isDetailRoute,
  useDetailNavigation,
} from '../useDetailNavigation';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useSegments: jest.fn(),
}));

describe('useDetailNavigation', () => {
  const navigate = jest.fn();
  const replace = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useRouter).mockReturnValue({ navigate, replace } as any);
  });

  it('opens the first detail as a singular route in the current tab', async () => {
    jest.mocked(useSegments).mockReturnValue(['(tabs)', 'library'] as any);
    const { result } = await renderHook(() => useDetailNavigation());

    await act(() => result.current.openDetail('artist', 'artist_1'));

    expect(navigate).toHaveBeenCalledWith(
      '/(tabs)/library/artist/artist_1',
      { dangerouslySingular: true }
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('replaces an existing detail instead of stacking another screen', async () => {
    jest
      .mocked(useSegments)
      .mockReturnValue(['(tabs)', 'library', 'artist', '[id]'] as any);
    const { result } = await renderHook(() => useDetailNavigation());

    await act(() => result.current.openDetail('album', 'album_2'));

    expect(replace).toHaveBeenCalledWith(
      '/(tabs)/library/album/album_2'
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('builds stable detail paths and recognizes tab context', () => {
    expect(getSectionFromSegments(['(tabs)', 'home', 'album'])).toBe('home');
    expect(getSectionFromSegments(['(tabs)', 'library', 'playlist'])).toBe(
      'library'
    );
    expect(isDetailRoute(['(tabs)', 'home'])).toBe(false);
    expect(isDetailRoute(['(tabs)', 'home', 'show', '[id]'])).toBe(true);
    expect(getDetailHref('home', 'episode', 'episode_3')).toBe(
      '/(tabs)/home/episode/episode_3'
    );
  });
});
