import { AlbumModel, ArtistModel, LibraryItemModel } from '@models';
import {
  AlbumResponseType,
  ArtistResponseType,
  SearchPlaylistResponseType,
} from '@config';
import {
  parseFromSearchPlaylistToCard,
  parseToAlbum,
  parseToArtist,
} from '@utils';

import { BASE_URL, spotifyGet } from '../config';

export const search = async ({
  type,
  q,
  limit = 50,
  offset = 0,
  playlistOwnerURI = '',
  nameIncludes = '',
}: {
  type: 'album' | 'playlist' | 'artist';
  // | 'track'
  // | 'show'
  // | 'episode'
  // | 'audiobook'
  q: string;
  limit: number;
  offset: number;
  playlistOwnerURI: string;
  nameIncludes: string;
}): Promise<LibraryItemModel[] | AlbumModel | ArtistModel | null> => {
  try {
    const response = await spotifyGet<unknown>(`${BASE_URL}/search`, {
      params: { q, type, limit, offset },
    });

    if (type === 'playlist') {
      return parseFromSearchPlaylistToCard(
        response.data as SearchPlaylistResponseType,
        playlistOwnerURI,
        nameIncludes
      );
    }

    if (type === 'artist') {
      return parseToArtist(response.data as ArtistResponseType);
    }

    if (type === 'album') {
      return parseToAlbum(response.data as AlbumResponseType);
    }

    return null;
  } catch (error) {
    console.error(`Error while searching with a query: ${q}`, error);
    throw error;
  }
};
