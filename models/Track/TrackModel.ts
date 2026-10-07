export type TrackAlbumRef = {
  id: string;
  name: string;
  imageURL?: string;
  albumArtists?: { id: string; name: string }[];
  releaseDate?: string;
  trackNumber?: number;
  discNumber?: number;
  releaseType?: 'album' | 'single' | 'ep' | 'compilation' | 'release';
};

export type TrackModel = {
  id: string;
  title: string;
  subtitle: string;
  imageURL?: string;
  albumName?: string;
  albumId?: string;
  albumAssociations?: TrackAlbumRef[];
  albumArtists?: { id: string; name: string }[];
  releaseDate?: string;
  trackNumber?: number;
  discNumber?: number;
  releaseType?: 'album' | 'single' | 'ep' | 'compilation' | 'release';
  youtubeVideoId?: string;
  youtubeUrl?: string;
  durationMs?: number;
  artists?: { id: string; name: string }[];
  isSaved?: boolean;
  isDownloaded?: boolean;
  isPlaying?: boolean;
  explicit?: boolean;
};

const albumKey = (album: TrackAlbumRef) =>
  `${album.id.trim().toLocaleLowerCase()}\u0000${album.name.trim().toLocaleLowerCase()}`;

export const mergeAlbumAssociations = (
  ...sources: Array<TrackAlbumRef[] | undefined>
): TrackAlbumRef[] | undefined => {
  const albums = new Map<string, TrackAlbumRef>();
  sources.flatMap((source) => source || []).forEach((album) => {
    const id = album.id?.trim();
    const name = album.name?.trim();
    if (!id && !name) return;
    const normalized = { ...album, id: id || name, name: name || id };
    const key = albumKey(normalized);
    const previous = albums.get(key);
    albums.set(key, {
      ...previous,
      ...normalized,
      imageURL: normalized.imageURL || previous?.imageURL,
      albumArtists: normalized.albumArtists?.length
        ? normalized.albumArtists
        : previous?.albumArtists,
      trackNumber: normalized.trackNumber || previous?.trackNumber,
      discNumber: normalized.discNumber || previous?.discNumber,
      releaseType: normalized.releaseType || previous?.releaseType,
      releaseDate: normalized.releaseDate || previous?.releaseDate,
    });
  });
  return albums.size ? [...albums.values()] : undefined;
};

export const albumAssociationsForTrack = (
  track: Pick<TrackModel, 'albumId' | 'albumName' | 'imageURL' | 'albumArtists' | 'trackNumber' | 'discNumber' | 'releaseType' | 'releaseDate' | 'albumAssociations'>
): TrackAlbumRef[] | undefined => mergeAlbumAssociations(
  track.albumId
    ? [{
        id: track.albumId,
        name: track.albumName || track.albumId,
        imageURL: track.imageURL,
        albumArtists: track.albumArtists,
        trackNumber: track.trackNumber,
        discNumber: track.discNumber,
        releaseType: track.releaseType,
        releaseDate: track.releaseDate,
      }]
    : undefined,
  track.albumAssociations,
);
