import type { DownloadedTrack } from '../download/downloadManager';

export type LocalAlbumCollection = {
  id: string;
  title: string;
  subtitle: string;
  imageURL: string;
  tracks: DownloadedTrack[];
};

export type LocalArtistCollection = {
  id: string;
  title: string;
  subtitle: string;
  imageURL: string;
  tracks: DownloadedTrack[];
};

const getLocalAlbumTitle = (track: Pick<DownloadedTrack, 'albumName'>): string =>
  track.albumName.trim() || 'Singles';

export const getLocalAlbumId = (
  track: Pick<DownloadedTrack, 'albumName' | 'artistName'>
): string =>
  `${getLocalAlbumTitle(track)}\u0000${track.artistName}`.toLocaleLowerCase();

export const groupLocalAlbums = (
  tracks: DownloadedTrack[]
): LocalAlbumCollection[] => {
  const albums = new Map<string, LocalAlbumCollection>();

  tracks.forEach((track) => {
    const id = getLocalAlbumId(track);
    const current = albums.get(id);
    albums.set(
      id,
      current
        ? { ...current, tracks: [...current.tracks, track] }
        : {
            id,
            title: getLocalAlbumTitle(track),
            subtitle: track.artistName,
            imageURL: track.localImagePath || track.imageURL,
            tracks: [track],
          }
    );
  });

  return [...albums.values()];
};

export const groupLocalArtists = (
  tracks: DownloadedTrack[]
): LocalArtistCollection[] => {
  const artists = new Map<string, LocalArtistCollection>();

  tracks.forEach((track) => {
    track.artistName
      .split(/\s*(?:,|&| feat\.?)\s*/i)
      .filter(Boolean)
      .forEach((artistName) => {
        const title = artistName.trim();
        const id = title.toLocaleLowerCase();
        const current = artists.get(id);
        artists.set(
          id,
          current
            ? { ...current, tracks: [...current.tracks, track] }
            : {
                id,
                title,
                subtitle: `${track.albumName || 'Single'}`,
                imageURL: '',
                tracks: [track],
              }
        );
      });
  });

  return [...artists.values()];
};
