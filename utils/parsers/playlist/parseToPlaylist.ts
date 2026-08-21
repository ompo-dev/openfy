import { PlaylistResponseType } from '@config';
import { translations } from '@data';
import { PlaylistModel } from '@models';

export const parseToPlaylist = ({
  type,
  id,
  name,
  description,
  owner,
  followers,
  tracks,
  images,
}: PlaylistResponseType): PlaylistModel => ({
  type: type,
  id: id,
  title: name,
  description: description,
  subtitle: owner.display_name,
  ownerId: owner.id,
  info: `${followers.total.toLocaleString()} ${translations.saves}`,
  imageURL: images?.[0]?.url || '',
  tracks: { total: tracks.total },
});
