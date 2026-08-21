import { ArtistResponseType } from '@config';
import { ArtistModel } from '@models';

export const parseToArtist = ({
  type,
  id,
  images,
  name,
  genres,
  followers,
}: ArtistResponseType): ArtistModel => ({
  type: type,
  id: id,
  imageURL: images && images[0] && images[0].url ? images[0].url : '',
  name: name,
  genres: genres || [],
  followers: followers?.total || 0,
});
