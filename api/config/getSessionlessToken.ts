import AsyncStorage from '@react-native-async-storage/async-storage';

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

    return { token: null, tokenExpiration: null };
  } catch (error) {
    console.error('Error authenticating with Spotify:', error);
    return { token: null, tokenExpiration: null };
  }
};
