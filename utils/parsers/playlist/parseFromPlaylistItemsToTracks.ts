import { PlaylistItemResponseType } from '@config';
import { TrackModel } from '@models';

export const parseFromPlaylistItemsToTracks = (
  items: PlaylistItemResponseType[]
): TrackModel[] =>
  items.flatMap(({ track }) => {
    if (!track?.id || !track.album) return [];

    return [{
      id: track.id,
      title: track.name,
      subtitle: track.artists.map((artist) => artist.name).join(', '),
      imageURL: track.album.images[0]?.url || '',
      albumName: track.album.name,
      durationMs: track.duration_ms,
      artists: track.artists
        .filter((artist) => artist.id)
        .map((artist) => ({ id: artist.id!, name: artist.name })),
      explicit: track.explicit,
    }];
  });
