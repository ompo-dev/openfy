import { albumAssociationsForTrack, mergeAlbumAssociations, type TrackModel } from '@models';
import { artistIdentityKey } from '../search/artistIdentity';

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase();

const trackArtists = (track: TrackModel) =>
  track.artists?.length
    ? track.artists
    : track.subtitle
        .split(/\s*(?:,|&| feat\.?)\s*/i)
        .map((name) => ({ id: '', name: name.trim() }))
        .filter((artist) => artist.name);

const artistMatches = (
  artist: { id?: string; name: string },
  artistId: string,
  artistName: string
) => {
  const creditIdentity = artistIdentityKey(artist.id);
  const profileIdentity = artistIdentityKey(artistId);
  if (creditIdentity && profileIdentity) return creditIdentity === profileIdentity;
  return Boolean(artist.id && artist.id === artistId) || normalize(artist.name) === normalize(artistName);
};

const uniqueTracks = (tracks: TrackModel[], artistId: string, artistName: string): TrackModel[] => {
  const providerIds = new Map<string, number>();
  const canonicalNames = new Map<string, number>();
  const unique: TrackModel[] = [];
  tracks.forEach((track) => {
    const firstArtist = trackArtists(track)[0];
    const profileIdentity = artistIdentityKey(artistId);
    const primaryName = profileIdentity && artistIdentityKey(firstArtist?.id) === profileIdentity
      ? artistName : firstArtist?.name || track.subtitle;
    const canonicalName = `${normalize(primaryName)}:${normalize(track.title)}`;
    const existingIndex = providerIds.get(track.id) ?? canonicalNames.get(canonicalName);
    if (existingIndex !== undefined) {
      const existing = unique[existingIndex];
      unique[existingIndex] = {
        ...existing,
        albumAssociations: mergeAlbumAssociations(
          albumAssociationsForTrack(existing),
          albumAssociationsForTrack(track),
        ),
        imageURL: existing.imageURL || track.imageURL,
        albumArtists: existing.albumArtists?.length ? existing.albumArtists : track.albumArtists,
        viewCount: existing.viewCount ?? track.viewCount,
        popularity: existing.popularity ?? track.popularity,
      };
      return;
    }
    const index = unique.push({
      ...track,
      albumAssociations: albumAssociationsForTrack(track),
    }) - 1;
    providerIds.set(track.id, index);
    canonicalNames.set(canonicalName, index);
  });
  return unique;
};

export const mergeArtistProfileTracks = ({
  artistId,
  artistName,
  contextualTracks,
  participationTracks,
  primaryTracks,
}: {
  artistId: string;
  artistName: string;
  contextualTracks: TrackModel[];
  participationTracks: TrackModel[];
  primaryTracks: TrackModel[];
}) => {
  const contextualPrimary = contextualTracks.filter((track) => {
    const primary = trackArtists(track)[0];
    return Boolean(primary && artistMatches(primary, artistId, artistName));
  });
  const contextualParticipations = contextualTracks.filter((track) =>
    trackArtists(track)
      .slice(1)
      .some((artist) => artistMatches(artist, artistId, artistName))
  );

  return {
    primaryTracks: uniqueTracks([...primaryTracks, ...contextualPrimary], artistId, artistName).sort((first, second) =>
      (second.viewCount ?? 0) - (first.viewCount ?? 0) ||
      (second.popularity ?? 0) - (first.popularity ?? 0)
    ),
    participationTracks: uniqueTracks([
      ...participationTracks,
      ...contextualParticipations,
    ], artistId, artistName),
  };
};
