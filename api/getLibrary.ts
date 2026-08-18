import { getUserFollowedArtists } from './artists';
import { getSavedAlbums } from './albums';
import { getSavedShows } from './shows';
import { getSavedPlaylists } from './playlists';

import { fileSystemMiddleware } from './config';
import { LibraryItemModel } from '@models';
import { Categories } from '@config';
import { getDownloadedTracks } from '@services';

export type LibraryType = {
  [Categories.FOLLOWED_ARTISTS]: LibraryItemModel[];
  [Categories.SAVED_ALBUMS]: LibraryItemModel[];
  [Categories.SAVED_PODCASTS]: LibraryItemModel[];
  [Categories.SAVED_PLAYLISTS]: LibraryItemModel[];
  [Categories.DOWNLOADED]: LibraryItemModel[];
  [Categories.ALL]: LibraryItemModel[];
};

const getDownloadedAsLibraryItems = async (): Promise<LibraryItemModel[]> => {
  try {
    const downloaded = await getDownloadedTracks();
    return downloaded.map((track) => ({
      id: track.spotifyId,
      type: 'album' as const, // use 'album' type so it renders square card
      title: track.title,
      imageURL: track.imageURL || '',
      subtitle: track.artistName,
    }));
  } catch {
    return [];
  }
};

export const getLibrary = async (): Promise<LibraryType> => {
  try {
    const [followedArtists, savedAlbums, savedShows, savedPlaylists, downloadedItems] =
      await Promise.all([
        getUserFollowedArtists(),
        getSavedAlbums(),
        getSavedShows(),
        getSavedPlaylists(),
        getDownloadedAsLibraryItems(),
      ]);

    return {
      [Categories.FOLLOWED_ARTISTS]: followedArtists,
      [Categories.SAVED_ALBUMS]: savedAlbums,
      [Categories.SAVED_PODCASTS]: savedShows,
      [Categories.SAVED_PLAYLISTS]: savedPlaylists,
      [Categories.DOWNLOADED]: downloadedItems,
      [Categories.ALL]: [
        ...savedPlaylists,
        ...followedArtists,
        ...savedAlbums,
        ...savedShows,
      ],
    };
  } catch (error) {
    const downloadedItems = await getDownloadedAsLibraryItems();
    return {
      [Categories.FOLLOWED_ARTISTS]: [],
      [Categories.SAVED_ALBUMS]: [],
      [Categories.SAVED_PODCASTS]: [],
      [Categories.SAVED_PLAYLISTS]: [],
      [Categories.DOWNLOADED]: downloadedItems,
      [Categories.ALL]: [],
    };
  }
};

// eslint-disable-next-line
const getLibraryFromFileSystem = async () =>
  await fileSystemMiddleware<LibraryType>('user_library', getLibrary);
