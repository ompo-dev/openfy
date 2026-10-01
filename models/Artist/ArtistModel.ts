export type ArtistModel = {
  type: 'artist';
  id: string;
  name: string;
  imageURL: string;
  description?: string;
  genres?: string[];
  followers?: number;
};
