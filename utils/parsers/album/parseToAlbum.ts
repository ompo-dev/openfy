import { AlbumResponseType } from '@config';
import { AlbumModel } from '@models';

export const parseToAlbum = ({
  id,
  type,
  album_type,
  name,
  images,
  release_date,
  artists,
  tracks: { total, items },
  copyrights,
  genres,
  label,
}: AlbumResponseType): AlbumModel => ({
  id: id,
  type: type,
  albumType: album_type,
  name: name,
  imageURL: images && images[0] && images[0].url ? images[0].url : '',
  releaseDate: release_date,
  artists: artists.map(({ id: artistId, type: artistType }) => ({
    id: artistId,
    type: artistType,
  })),
  tracks: {
    total: total,
    items: items.map(
      ({
        id: trackId,
        name: trackName,
        artists: trackArtists,
        duration_ms,
        explicit,
      }) => ({
        id: trackId,
        title: trackName,
        subtitle: trackArtists
          .map(({ name: artistName }) => artistName)
          .join(', '),
        albumName: name,
        imageURL: images?.[0]?.url || '',
        durationMs: duration_ms,
        artists: trackArtists
          .filter((artist) => artist.id)
          .map((artist) => ({ id: artist.id!, name: artist.name })),
        explicit: explicit,
      })
    ),
  },
  duration: items.reduce((a, b) => a + b.duration_ms, 0),
  copyrights: copyrights,
  genres: genres,
  label: label,
});
