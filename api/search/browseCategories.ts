import { BrowseCategoryModel } from '@models';
import { BrowseCategoriesResponseType } from '@config';
import { parseToBrowseCategories } from '@utils';

import { BASE_URL, spotifyGet } from '../config';

export const getBrowseCategories = async (
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
