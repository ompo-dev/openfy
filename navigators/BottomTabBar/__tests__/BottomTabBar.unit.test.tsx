import * as React from 'react';
import { render, RenderResult } from '@testing-library/react-native';
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
        { key: 'search', name: 'search' },
        { key: 'library', name: 'library' },
      ],
    },
    descriptors: {
      home: { options: {} },
      search: { options: {} },
      library: { options: {} },
    },
    navigation: {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    },
  };

  beforeEach(() => {
    container = render(<BottomTabBar {...mockProps} />);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with import button', () => {
    expect(container.getByLabelText('Importar do Spotify')).toBeTruthy();
  });
});
