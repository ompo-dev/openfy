import { AlbumModel } from '@models';
import { AlbumResponseType } from '@config';
import { parseToAlbum } from '@utils';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';

import { BASE_URL, spotifyGet } from '../config';

const albumCache = createAsyncResourceCache<AlbumModel>({
  name: 'spotify album',
  category: 'network',
  maxEntries: 40,
});

const loadAlbum = async (albumId: string): Promise<AlbumModel> => {
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

export const getAlbum = (albumId: string): Promise<AlbumModel> =>
  albumCache.getOrLoad(albumId, () => loadAlbum(albumId), 30 * 60_000);

export const getCachedAlbum = (albumId: string) => albumCache.peek(albumId);

export const _clearAlbumCacheForTests = () => albumCache.clear();
