import { AlbumModel } from '@models';
import { AlbumResponseType } from '@config';
import { parseToAlbum } from '@utils';

import { BASE_URL, spotifyGet } from '../config';

export const getAlbum = async (albumId: string): Promise<AlbumModel> => {
  try {
    const response = await spotifyGet<AlbumResponseType>(
      `${BASE_URL}/albums/${albumId}`
    );

    return parseToAlbum(response.data);
  } catch (error) {
    console.error(`Error fetching album with an ID: ${albumId}`, error);
    throw error;
  }
};
