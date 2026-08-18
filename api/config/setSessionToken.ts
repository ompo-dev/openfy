import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const setSessionToken = async (
  token: string,
  refreshToken: string,
  expiresIn: string
) => {
  if (!Constants.expoConfig || !Constants.expoConfig.extra) {
    return null;
  }
  const tokenKey = Constants.expoConfig?.extra?.tokenKey || 'spotify_token';
  const refreshTokenKey =
    Constants.expoConfig?.extra?.refreshTokenKey || 'spotify_refresh_token';
  const expirationKey =
    Constants.expoConfig?.extra?.expirationKey || 'spotify_expiration_key';

  const expirationTime = new Date().getTime() + +expiresIn * 1000;
  await AsyncStorage.setItem(tokenKey, token);
  await AsyncStorage.setItem(expirationKey, expirationTime.toString());
  await AsyncStorage.setItem(refreshTokenKey, refreshToken);
};
