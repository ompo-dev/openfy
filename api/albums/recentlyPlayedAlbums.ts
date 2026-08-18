import axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy';

import { RecentlyPlayedModel } from '@models';
import { RecentlyPlayedResponseType } from '@config';
import { parseToRecentlyPlayed } from '@utils';

import { BASE_URL, getSessionToken } from '../config';

const fetchRecentlyPlayed = async (): Promise<RecentlyPlayedModel[]> => {
  try {
    const token = await getSessionToken();
    if (!token) return [];
    const response = (await axios.get(`${BASE_URL}/me/player/recently-played`, {
      params: {
        limit: 8,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })) as { data: RecentlyPlayedResponseType };

    return parseToRecentlyPlayed(response.data);
  } catch (error) {
    return [];
  }
};

export const getRecentlyPlayed = async (): Promise<RecentlyPlayedModel[]> => {
  const filename = 'recently_played';
  const fileUri = `${FileSystem.documentDirectory}${filename}.json`;

  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      return [];
    }

    const fileContent = (await FileSystem.readAsStringAsync(fileUri)) || '';
    if (!fileContent) {
      return [];
    }

    return JSON.parse(fileContent);
  } catch (error) {
    return [];
  }
};

export const updateRecentlyPlayed = async (): Promise<void> => {
  try {
    const token = await getSessionToken();
    if (!token) return;

    const currentRecentlyPlayed = await getRecentlyPlayed();
    const newRecentlyPlayed = await fetchRecentlyPlayed();

    if (
      newRecentlyPlayed.length === 0 ||
      JSON.stringify(currentRecentlyPlayed) === JSON.stringify(newRecentlyPlayed)
    ) {
      return;
    }

    const result = currentRecentlyPlayed.slice();

    newRecentlyPlayed.reverse().forEach((item) => {
      if (currentRecentlyPlayed.some((cItem) => cItem.id === item.id)) {
        result.splice(
          result.findIndex((rItem) => rItem.id === item.id),
          1
        );
      } else if (result.length > 0) {
        result.splice(result.length - 1, 1);
      }
      result.unshift(item);
    });

    const filename = 'recently_played';
    const fileUri = `${FileSystem.documentDirectory}${filename}.json`;

    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(result), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (error) {
    // ignore
  }
};
