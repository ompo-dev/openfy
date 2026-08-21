import Constants from 'expo-constants';

export const BASE_URL = 'https://api.spotify.com/v1';

export const MUSIC_SERVER_URL =
  (Constants.expoConfig?.extra?.musicServerUrl as string | undefined) ||
  'http://localhost:3001';
