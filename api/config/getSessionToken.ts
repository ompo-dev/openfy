import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

export const getSessionToken = async (): Promise<string | null> => {
  if (!Constants.expoConfig || !Constants.expoConfig.extra) {
    return null;
  }
  const tokenKey = Constants.expoConfig?.extra?.tokenKey || 'spotify_token';
  const refreshTokenKey =
    Constants.expoConfig?.extra?.refreshTokenKey || 'spotify_refresh_token';
  const expirationKey =
    Constants.expoConfig?.extra?.expirationKey || 'spotify_expiration_key';

  const storedToken = await AsyncStorage.getItem(tokenKey);
  const expirationTime = await AsyncStorage.getItem(expirationKey);
  const currentTime = new Date().getTime();

  if (storedToken && expirationTime && currentTime < Number(expirationTime)) {
    return storedToken;
  }

  if (tokenKey) await AsyncStorage.removeItem(tokenKey);
  if (expirationKey) await AsyncStorage.removeItem(expirationKey);
  if (refreshTokenKey) await AsyncStorage.removeItem(refreshTokenKey);
  return null;
};
