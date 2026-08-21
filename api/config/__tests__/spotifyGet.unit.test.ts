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
    expoConfig: { extra: { clientID: 'client-id', clientSecret: 'client-secret' } },
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

  it('renova token uma vez ao receber 401 e repete mesma chamada', async () => {
    await AsyncStorage.setItem('sessionless_token', 'expired-by-spotify');
    await AsyncStorage.setItem(
      'sessionless_token_expiration',
      new Date(Date.now() + 10 * 60_000).toISOString()
    );
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.get
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({ data: { id: 'playlist' } } as any);
    mockedAxios.post.mockResolvedValue({
      data: { access_token: 'fresh-token', expires_in: 3600 },
    } as any);

    await expect(spotifyGet<{ id: string }>('https://spotify.test/playlist')).resolves.toEqual(
      expect.objectContaining({ data: { id: 'playlist' } })
    );

    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      1,
      'https://spotify.test/playlist',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer expired-by-spotify' }),
      })
    );
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      2,
      'https://spotify.test/playlist',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
      })
    );
  });
});
