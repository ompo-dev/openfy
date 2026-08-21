import * as React from 'react';
import { useRouter, useSegments } from 'expo-router';
import {
  render,
  fireEvent,
  RenderResult,
} from '@testing-library/react-native';
import { Artists, ArtistsPropsType } from '../Artists';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useSegments: jest.fn(),
}));

jest.mock('expo-image', () => ({ Image: 'Image' }));

enum TEST_IDS {
  ARTIST_IMAGE = 'artist-image',
  ARTIST_NAME = 'artist-name',
  ARTIST_LINK_ID_1 = 'artist-link-id_1',
  ARTIST_LINK_ID_2 = 'artist-link-id_2',
}

describe('AlbumArtists', () => {
  let container: RenderResult;
  const mockRouter = jest.fn();
  const defaultProps: ArtistsPropsType = {
    artists: [
      {
        type: 'artist',
        id: 'id_1',
        name: 'Artist Name 2 mock',
        imageURL: 'url 1',
      },
      {
        type: 'artist',
        id: 'id_2',
        name: 'Artist Name 2 mock',
        imageURL: 'url 1',
      },
    ],
  };

  beforeEach(async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: mockRouter });
    (useSegments as jest.Mock).mockReturnValue(['(tabs)', 'home']);
    container = await render(<Artists {...defaultProps} />);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    expect(container.getByTestId(TEST_IDS.ARTIST_LINK_ID_1)).toBeTruthy();
    expect(container.getByTestId(TEST_IDS.ARTIST_LINK_ID_2)).toBeTruthy();
  });

  describe('Navigation - Press logic', () => {
    it('navigates to the first artist page with given ID', () => {
      const artist1 = container.getByTestId(TEST_IDS.ARTIST_LINK_ID_1);

      fireEvent.press(artist1);
      expect(mockRouter).toHaveBeenCalledWith('/(tabs)/home/artist/id_1');
    });

    it('navigates to the first artist page with given ID', () => {
      const artist2 = container.getByTestId(TEST_IDS.ARTIST_LINK_ID_2);

      fireEvent.press(artist2);
      expect(mockRouter).toHaveBeenCalledWith('/(tabs)/home/artist/id_2');
    });
  });

  describe('UI', () => {
    it('passes properly props to Image component for first artist', () => {
      const Images = container.getAllByTestId(TEST_IDS.ARTIST_IMAGE);

      Images.forEach((image, i) => {
        expect(image.props.source.uri).toEqual(
          defaultProps.artists![i].imageURL
        );
      });
    });

    it('displays artist name(s) inside Text components', () => {
      const Texts = container.getAllByTestId(TEST_IDS.ARTIST_NAME);

      Texts.forEach((text, i) => {
        expect(text.props.children).toEqual(defaultProps.artists![i].name);
      });
    });
  });
});
