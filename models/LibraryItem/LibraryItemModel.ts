export type LibraryItemModel = {
  id: string;
  type: 'artist' | 'album' | 'show' | 'playlist';
  title: string;
  imageURL: string;
  subtitle: string;
  /** Provider classification. Keep this separate from the display subtitle. */
  releaseType?: 'album' | 'single' | 'ep' | 'compilation' | 'release';
  releaseDate?: string;
  ownerId?: string;
};
