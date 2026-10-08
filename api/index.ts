export {
  getAlbum,
  getArtistAlbums,
  getRecentlyPlayed,
  updateRecentlyPlayed,
  getSavedAlbums,
  checkSavedAlbums,
  getUserTopAlbums,
  getYouTubeMusicAlbum,
  isYouTubeMusicAlbumId,
} from './albums';
export type { YouTubeMusicAlbum } from './albums';

export {
  findArtistIdByName,
  getArtist,
  getArtistDiscography,
  getArtistTopTracks,
  getUserTopArtists,
  getUserFollowedArtists,
} from './artists';

export {
  getPlaylist,
  getPlaylistItems,
  getSavedPlaylists,
  checkSavedPlaylists,
  getFeaturedPlaylists,
} from './playlists';

export {
  getRecommendationsFromArtistSeeds,
  getRecommendationsFromTopArtistSeed,
  getRecommendations,
} from './recommendations';

export {
  getBrowseCategories,
  getArtistCatalogImage,
  getYouTubeMusicArtistImage,
  getYouTubeMusicArtistBiography,
  getYouTubeMusicArtistProfile,
  getCachedArtistSearchSeed,
  searchCatalog,
  getCatalogSearchSuggestions,
} from './search';
export type { CatalogSearchResults, YouTubeMusicArtistProfile } from './search';

export { getSavedShows } from './shows';

export { checkSavedTracks } from './tracks';

export { getUser } from './user';

export { getSessionToken, setSessionToken, getSessionlessToken } from './config';

export { getLibrary } from './getLibrary';
export type { LibraryType } from './getLibrary';
