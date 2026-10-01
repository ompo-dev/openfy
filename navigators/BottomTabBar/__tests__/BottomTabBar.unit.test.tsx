import * as React from 'react';
import { render, RenderResult } from '@testing-library/react-native';
import {
  DownloadProvider,
  LibrarySelectedCategoryProvider,
} from '@context';
import { BottomTabBar } from '../BottomTabBar';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useSegments: jest.fn(),
}));

describe('BottomTabBar', () => {
  let container: RenderResult;

  const mockProps: any = {
    state: {
      index: 0,
      routes: [
        { key: 'home', name: 'home' },
        { key: 'feed', name: 'feed' },
        { key: 'library', name: 'library' },
      ],
    },
    descriptors: {
      home: { options: {} },
      feed: { options: {} },
      library: { options: {} },
    },
    navigation: {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    },
  };

  const renderTabBar = () =>
    render(
      <LibrarySelectedCategoryProvider>
        <DownloadProvider>
          <BottomTabBar {...mockProps} />
        </DownloadProvider>
      </LibrarySelectedCategoryProvider>
    );

  beforeEach(async () => {
    container = await renderTabBar();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the home, feed, and library tabs', () => {
    expect(container.getByText('Home')).toBeTruthy();
    expect(container.getByText('Feed')).toBeTruthy();
    expect(container.getByText('Library')).toBeTruthy();
  });
});
