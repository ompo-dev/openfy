import { BrowseCategoryModel } from '@models';
import { BrowseCategoriesResponseType } from '@config';
import { parseToBrowseCategories } from '@utils';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';

import { BASE_URL, spotifyGet } from '../config';

const browseCategoriesCache = createAsyncResourceCache<BrowseCategoryModel[]>({
  name: 'browse categories',
  category: 'search',
  maxEntries: 4,
});

const loadBrowseCategories = async (
  limit: number = 50,
  offset: number = 0
): Promise<BrowseCategoryModel[]> => {
  try {
    const response = await spotifyGet<{ categories: BrowseCategoriesResponseType }>(`${BASE_URL}/browse/categories`, {
      params: { limit, offset },
    });

    return parseToBrowseCategories(response.data.categories.items);
  } catch (error) {
    return [];
  }
};

export const getBrowseCategories = (
  limit: number = 50,
  offset: number = 0
): Promise<BrowseCategoryModel[]> =>
  browseCategoriesCache.getOrLoad(
    `${limit}:${offset}`,
    () => loadBrowseCategories(limit, offset),
    6 * 60 * 60_000
  );
