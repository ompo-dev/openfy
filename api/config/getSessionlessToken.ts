import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const getSessionTokenFromAsynceStorage = async (): Promise<{
  token: string | null;
  tokenExpiration: string | null;
}> => {
  try {
    const token = await AsyncStorage.getItem('sessionless_token');
    const tokenExpiration = await AsyncStorage.getItem(
      'sessionless_token_expiration'
    );

    return { token, tokenExpiration };
  } catch (error) {
    console.error(error);
    return { token: null, tokenExpiration: null };
  }
};

const TOKEN_REFRESH_BUFFER_MS = 60_000;

export const clearSessionlessToken = async () => {
  await AsyncStorage.multiRemove([
    'sessionless_token',
    'sessionless_token_expiration',
  ]);
};

export const getSessionlessToken = async (
  forceRefresh = false
): Promise<{
  token: string | null;
  tokenExpiration: string | null;
}> => {
  try {
    const { token, tokenExpiration } = await getSessionTokenFromAsynceStorage();

    if (
      !forceRefresh &&
      token &&
      tokenExpiration &&
      new Date(tokenExpiration).getTime() > Date.now() + TOKEN_REFRESH_BUFFER_MS
    ) {
      return { token, tokenExpiration };
    }

    if (forceRefresh) await clearSessionlessToken();

    if (!Constants.expoConfig || !Constants.expoConfig.extra) {
      throw Error("Failed to read 'Constants.expoConfig.extra' variable");
    }

    const clientID = Constants.expoConfig.extra.clientID;
    const clientSecret = Constants.expoConfig.extra.clientSecret;

    if (!clientID || !clientSecret) {
      return { token: null, tokenExpiration: null };
    }

    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientID,
        client_secret: clientSecret,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const newToken = response.data.access_token;

    if (!newToken) {
      throw new Error('Failed to authenticate with Spotify.');
    }

    const expiresInSeconds = Number(response.data.expires_in) || 3600;
    const date = new Date(
      Date.now() + Math.max(0, expiresInSeconds * 1000 - TOKEN_REFRESH_BUFFER_MS)
    );

    await AsyncStorage.setItem('sessionless_token', newToken);
    await AsyncStorage.setItem('sessionless_token_expiration', date.toString());

    return { token: newToken, tokenExpiration: date.toString() };
  } catch (error) {
    console.error('Error authenticating with Spotify:', error);
    return { token: null, tokenExpiration: null };
  }
};
