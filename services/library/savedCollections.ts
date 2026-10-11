import { getLibraryTracks, upsertCatalogTracks, type CatalogTrackInput } from './catalogLibrary';
import { getLocalPlaylists, upsertLocalPlaylist } from './localPlaylistManager';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { albumAssociationsForTrack } from '../../models/Track/TrackModel';

type CollectionInput = {
  kind: 'album' | 'playlist'; id: string; title: string; imageURL: string;
  imageURLs?: string[]; description?: string; artists?: { id: string; name: string }[];
  tracks: CatalogTrackInput[];
};
const playlistSource = (id: string) => ({
  sourcePlatform: id.startsWith('home_mix_') ? 'local' as const : 'spotify' as const,
  sourceId: id,
});
const albumCatalogId = (id: string) => {
  if (!id.startsWith('ytalbum_')) return id.replace(/^spotify:/, '');
  try { return decodeURIComponent(id.slice('ytalbum_'.length)); }
  catch { return id.slice('ytalbum_'.length); }
};
export const isCollectionSaved = async (kind: 'album' | 'playlist', id: string,
  tracks: { spotifyId: string }[], trackCount = tracks.length) => {
  if (kind === 'playlist') {
    const source = playlistSource(id);
    return (await getLocalPlaylists()).some((playlist) => playlist.id === id ||
      (playlist.sourcePlatform === source.sourcePlatform && playlist.sourceId === id));
  }
  if (!tracks.length || tracks.length < trackCount) return false;
  const saved = new Map((await getLibraryTracks()).map((track) => [track.spotifyId, track]));
  const albumId = albumCatalogId(id);
  return tracks.every((track) => {
    const item = saved.get(track.spotifyId);
    return Boolean(item && (id.startsWith('local_album_') ||
      albumAssociationsForTrack(item)?.some((album) => albumCatalogId(album.id) === albumId)));
  });
};

/** Save metadata/membership only. Audio downloads remain a separate action. */
export const saveCollection = async (input: CollectionInput) => {
  if (!input.tracks.length) throw new Error('Coleção sem músicas');
  const tracks = input.kind === 'album' && !input.id.startsWith('local_album_')
    ? input.tracks.map((track) => ({ ...track, albumAssociations: [
      ...(track.albumAssociations || []),
      { id: albumCatalogId(input.id), name: input.title, imageURL: input.imageURL, albumArtists: input.artists,
        trackNumber: track.trackNumber, discNumber: track.discNumber },
    ] })) : input.tracks;
  await upsertCatalogTracks(tracks);
  if (input.kind === 'playlist') {
    await upsertLocalPlaylist({ ...playlistSource(input.id), title: input.title,
      description: input.description, trackIds: tracks.map((track) => track.spotifyId),
      coverImageURLs: input.imageURLs?.length ? input.imageURLs : [input.imageURL, ...tracks.map((track) => track.imageURL)].filter(Boolean) });
  }
  useLibraryStore.getState().refreshLibrary();
};
