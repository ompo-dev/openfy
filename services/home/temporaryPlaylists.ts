import type { PersonalizedHomeSnapshot, PersonalizedHomeTrack } from './personalizedHome';

export type TemporaryPlaylist = { id: string; title: string; tracks: PersonalizedHomeTrack[] };
const playlists = new Map<string, TemporaryPlaylist>();
const listeners = new Set<() => void>();
export const HOME_PLAYLIST_PREFIX = 'home_mix_';

export const subscribeHomePlaylists = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getHomePlaylist = (id: string) => playlists.get(id);

/** Session-only collections follow listening history; they never pollute the saved library. */
export const publishHomePlaylists = (home: PersonalizedHomeSnapshot) => {
  const collections: TemporaryPlaylist[] = [
    { id: 'home_mix_recent', title: 'Tocados recentemente', tracks: home.continueListening },
    { id: 'home_mix_most_played', title: 'Não sai do seu fone', tracks: home.mostPlayed || [] },
    { id: 'home_mix_discover', title: home.discoveryTitle, tracks: home.discoveries },
  ];
  const seed = home.seeds?.[0];
  if (seed) collections.push({ id: homeRadioPlaylistId(seed.name), title: `Rádio de ${seed.name}`,
    tracks: home.similarTracks?.length ? home.similarTracks : home.discoveries });
  for (const collection of collections) {
    playlists.delete(collection.id);
    playlists.set(collection.id, { ...collection, tracks: collection.tracks.slice(0, 100) });
  }
  while (playlists.size > 12) playlists.delete(playlists.keys().next().value!);
  listeners.forEach((listener) => listener());
};

export const homeRadioPlaylistId = (artistName: string) =>
  `${HOME_PLAYLIST_PREFIX}radio_${encodeURIComponent(artistName.toLocaleLowerCase()).replace(/%/g, '_')}`;
