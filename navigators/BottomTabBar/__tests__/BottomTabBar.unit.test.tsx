import * as React from 'react';
import { fireEvent, render, RenderResult } from '@testing-library/react-native';
import {
  DownloadProvider,
  LibrarySelectedCategoryProvider,
} from '@context';
import { BottomTabBar } from '../BottomTabBar';
let mockFeedEnabled = false;
jest.mock('../../../config/features', () => ({ get FEED_ENABLED() { return mockFeedEnabled; } }));

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
    mockFeedEnabled = false;
    container = await renderTabBar();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders Home and Library without loading a Feed button by default', async () => {
    expect(container.getByText('Home')).toBeTruthy();
    expect(container.queryByText('Feed')).toBeNull();
    expect(container.getByText('Library')).toBeTruthy();
    await fireEvent.press(container.getByLabelText('Library'));
    expect(mockProps.navigation.navigate).toHaveBeenCalledWith('library');
  });

  it('retains the original navigation index when a disabled route is filtered', async () => {
    await container.rerender(<BottomTabBar {...mockProps} state={{ ...mockProps.state, index: 2 }} />);
    expect(container.getByLabelText('Library').props.accessibilityState.selected).toBe(true);
    expect(container.getByLabelText('Home').props.accessibilityState.selected).not.toBe(true);
  });

  it('can restore Feed for an explicitly enabled build', async () => {
    mockFeedEnabled = true;
    await container.rerender(<BottomTabBar {...mockProps} />);
    await fireEvent.press(container.getByLabelText('Feed'));
    expect(mockProps.navigation.navigate).toHaveBeenCalledWith('feed');
  });
});
