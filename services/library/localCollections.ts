import type { LibraryTrack } from './catalogLibrary';
import { artistFollowKey, type FollowedArtist } from './followedArtists';
import { albumAssociationsForTrack, type TrackAlbumRef } from '../../models/Track/TrackModel';

export type LocalAlbumCollection = {
  id: string;
  title: string;
  subtitle: string;
  imageURL: string;
  tracks: LibraryTrack[];
};

export type LocalArtistCollection = {
  id: string;
  spotifyArtistId?: string;
  routeId?: string;
  following?: boolean;
  title: string;
  subtitle: string;
  imageURL: string;
  tracks: LibraryTrack[];
};

const getLocalAlbumTitle = (track: Pick<LibraryTrack, 'albumName'>): string =>
  (track.albumName.trim().toLowerCase() === 'spotify' ? '' : track.albumName.trim()) || 'Singles';

const getTrackArtists = (track: Pick<LibraryTrack, 'artistName' | 'artists'>) =>
  track.artists?.length ? track.artists : track.artistName
    .split(/\s*(?:,|&| feat\.?)\s*/i)
    .map((name) => ({ id: '', name: name.trim() }))
    .filter((artist) => artist.name);

const normalizeArtistIdentity = (artist: { id?: string; name: string }) =>
  artist.name.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

const normalizeArtistLookup = (artistIdOrName: string) =>
  artistIdOrName.trim().toLocaleLowerCase();

export const getPrimaryTrackArtist = (
  track: Pick<LibraryTrack, 'artistName' | 'artists'>
) => getTrackArtists(track)[0] || null;

export const isTrackPrimaryArtist = (
  track: Pick<LibraryTrack, 'artistName' | 'artists'>,
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
  track: Pick<LibraryTrack, 'artistName' | 'artists'>,
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
  track: Pick<LibraryTrack, 'albumName' | 'artistName' | 'albumId' | 'albumArtists' | 'artists'>
): string =>
  track.albumId ? `spotify:${track.albumId}` :
    `${getLocalAlbumTitle(track)}\u0000${track.albumArtists?.[0]?.name || getTrackArtists(track)[0]?.name || ''}`.toLocaleLowerCase();

const getTrackAlbumAssociations = (track: LibraryTrack): TrackAlbumRef[] =>
  albumAssociationsForTrack(track) || [{
    id: '',
    name: getLocalAlbumTitle(track),
    albumArtists: track.albumArtists,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber,
  }];

const trackForAlbum = (track: LibraryTrack, album: TrackAlbumRef): LibraryTrack => {
  if (!album.id) return track;
  return {
    ...track,
    albumId: album.id,
    albumName: album.name || track.albumName,
    ...(album.imageURL ? { imageURL: album.imageURL } : {}),
    ...(album.albumArtists?.length ? { albumArtists: album.albumArtists } : {}),
    ...(album.trackNumber ? { trackNumber: album.trackNumber } : {}),
    ...(album.discNumber ? { discNumber: album.discNumber } : {}),
  };
};

export const groupLocalAlbums = (
  tracks: LibraryTrack[]
): LocalAlbumCollection[] => {
  const albums = new Map<string, LocalAlbumCollection>();

  tracks.forEach((track) => {
    getTrackAlbumAssociations(track).forEach((albumRef) => {
      const albumTrack = trackForAlbum(track, albumRef);
      const id = albumRef.id ? `spotify:${albumRef.id}` : getLocalAlbumId(albumTrack);
      const current = albums.get(id);
      albums.set(
        id,
        current
          ? { ...current, tracks: [...current.tracks, albumTrack] }
          : {
              id,
              title: albumTrack.albumName ? getLocalAlbumTitle(albumTrack) : albumRef.name,
              subtitle: albumTrack.albumArtists?.map((artist) => artist.name).join(', ') ||
                getTrackArtists(albumTrack)[0]?.name || albumTrack.artistName,
              imageURL: albumTrack.localImagePath || albumTrack.imageURL,
              tracks: [albumTrack],
            }
      );
    });
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
  tracks: LibraryTrack[]
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
            ? {
                ...current,
                spotifyArtistId: current.spotifyArtistId || artist.id || undefined,
                tracks: current.tracks.some((candidate) => candidate.spotifyId === track.spotifyId)
                  ? current.tracks
                  : [...current.tracks, track],
              }
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

/** Library membership is primary credit or an explicit follow, not a featured credit. */
export const groupLibraryArtists = (tracks: LibraryTrack[], followed: FollowedArtist[]): LocalArtistCollection[] => {
  const artists = new Map<string, LocalArtistCollection>();
  const add = (artist: { id?: string; name: string }, track: LibraryTrack) => {
    const id = artistFollowKey(artist.name);
    if (!id) return;
    const current = artists.get(id);
    if (current) {
      current.spotifyArtistId ||= artist.id || undefined;
      if (!current.tracks.some((item) => item.spotifyId === track.spotifyId)) current.tracks.push(track);
    } else {
      artists.set(id, { id, title: artist.name.trim(), spotifyArtistId: artist.id || undefined,
        subtitle: track.albumName || 'Single', imageURL: '', tracks: [track] });
    }
  };
  tracks.forEach((track) => {
    const primary = getPrimaryTrackArtist(track);
    if (primary) add(primary, track);
    const albumPrimaries = [track.albumArtists?.[0],
      ...(track.albumAssociations?.map((album) => album.albumArtists?.[0]) || [])];
    albumPrimaries.forEach((artist) => { if (artist) add(artist, track); });
  });
  followed.forEach((artist) => {
    const id = artistFollowKey(artist.name);
    const current = artists.get(id);
    artists.set(id, { ...current, id, title: artist.name, routeId: artist.id || current?.spotifyArtistId,
      spotifyArtistId: current?.spotifyArtistId || artist.id, following: true,
      subtitle: 'Seguindo', imageURL: artist.imageURL, tracks: current?.tracks || [] });
  });
  return [...artists.values()].sort((a, b) => Number(Boolean(b.following)) - Number(Boolean(a.following)));
};
