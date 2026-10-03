import type { TrackModel } from '@models';

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
) =>
  Boolean(artist.id && artist.id === artistId) ||
  normalize(artist.name) === normalize(artistName);

const uniqueTracks = (tracks: TrackModel[]): TrackModel[] => {
  const providerIds = new Set<string>();
  const canonicalNames = new Set<string>();
  return tracks.filter((track) => {
    const firstArtist = trackArtists(track)[0]?.name || track.subtitle;
    const canonicalName = `${normalize(firstArtist)}:${normalize(track.title)}`;
    if (providerIds.has(track.id) || canonicalNames.has(canonicalName)) {
      return false;
    }
    providerIds.add(track.id);
    canonicalNames.add(canonicalName);
    return true;
  });
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
    primaryTracks: uniqueTracks([...primaryTracks, ...contextualPrimary]),
    participationTracks: uniqueTracks([
      ...participationTracks,
      ...contextualParticipations,
    ]),
  };
};
