jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    isAxiosError: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        tokenKey: 'spotify_token',
        refreshTokenKey: 'spotify_refresh_token',
        expirationKey: 'spotify_expiration_key',
      },
    },
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { spotifyGet } from '../spotifyGet';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('spotifyGet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('usa somente o token Spotify salvo no aparelho', async () => {
    await AsyncStorage.setItem('spotify_token', 'local-user-token');
    await AsyncStorage.setItem(
      'spotify_expiration_key',
      String(Date.now() + 10 * 60_000)
    );
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 'playlist' } } as any);

    await expect(
      spotifyGet<{ id: string }>('https://spotify.test/playlist')
    ).resolves.toEqual(expect.objectContaining({ data: { id: 'playlist' } }));

    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      1,
      'https://spotify.test/playlist',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer local-user-token',
        }),
      })
    );
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });
});
