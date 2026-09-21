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
  spotifyArtistId?: string;
  title: string;
  subtitle: string;
  imageURL: string;
  tracks: DownloadedTrack[];
};

const getLocalAlbumTitle = (track: Pick<DownloadedTrack, 'albumName'>): string =>
  (track.albumName.trim().toLowerCase() === 'spotify' ? '' : track.albumName.trim()) || 'Singles';

const getTrackArtists = (track: Pick<DownloadedTrack, 'artistName' | 'artists'>) =>
  track.artists?.length ? track.artists : track.artistName
    .split(/\s*(?:,|&| feat\.?)\s*/i)
    .map((name) => ({ id: '', name: name.trim() }))
    .filter((artist) => artist.name);

const normalizeArtistIdentity = (artist: { id?: string; name: string }) =>
  artist.id ? `spotify:${artist.id}` : artist.name.trim().toLocaleLowerCase();

const normalizeArtistLookup = (artistIdOrName: string) =>
  artistIdOrName.trim().toLocaleLowerCase();

export const getPrimaryTrackArtist = (
  track: Pick<DownloadedTrack, 'artistName' | 'artists'>
) => getTrackArtists(track)[0] || null;

export const isTrackPrimaryArtist = (
  track: Pick<DownloadedTrack, 'artistName' | 'artists'>,
  artistIdOrName: string
): boolean => {
  const primary = getPrimaryTrackArtist(track);
  if (!primary) return false;
  const target = normalizeArtistLookup(artistIdOrName);
  return (
    normalizeArtistIdentity(primary).toLocaleLowerCase() === target ||
    primary.name.trim().toLocaleLowerCase() === target
  );
};

export const isTrackParticipantArtist = (
  track: Pick<DownloadedTrack, 'artistName' | 'artists'>,
  artistIdOrName: string
): boolean => {
  const target = normalizeArtistLookup(artistIdOrName);
  return getTrackArtists(track)
    .slice(1)
    .some(
      (artist) =>
        normalizeArtistIdentity(artist).toLocaleLowerCase() === target ||
        artist.name.trim().toLocaleLowerCase() === target
    );
};

export const getLocalAlbumId = (
  track: Pick<DownloadedTrack, 'albumName' | 'artistName' | 'albumId' | 'albumArtists' | 'artists'>
): string =>
  track.albumId ? `spotify:${track.albumId}` :
    `${getLocalAlbumTitle(track)}\u0000${track.albumArtists?.[0]?.name || getTrackArtists(track)[0]?.name || ''}`.toLocaleLowerCase();

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
            subtitle: track.albumArtists?.map((artist) => artist.name).join(', ') ||
              getTrackArtists(track)[0]?.name || track.artistName,
            imageURL: track.localImagePath || track.imageURL,
            tracks: [track],
          }
    );
  });

  return [...albums.values()].map((album) => ({
    ...album,
    tracks: [...album.tracks].sort((first, second) =>
      (first.discNumber || 1) - (second.discNumber || 1) ||
      (first.trackNumber || 0) - (second.trackNumber || 0)
    ),
  }));
};

export const groupLocalArtists = (
  tracks: DownloadedTrack[]
): LocalArtistCollection[] => {
  const artists = new Map<string, LocalArtistCollection>();

  tracks.forEach((track) => {
    const seen = new Set<string>();
    getTrackArtists(track).forEach((artist) => {
        const title = artist.name.trim();
        const id = normalizeArtistIdentity(artist);
        if (seen.has(id)) return;
        seen.add(id);
        const current = artists.get(id);
        artists.set(
          id,
          current
            ? { ...current, tracks: [...current.tracks, track] }
            : {
                id,
                spotifyArtistId: artist.id || undefined,
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
