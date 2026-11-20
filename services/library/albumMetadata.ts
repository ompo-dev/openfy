import AsyncStorage from '@react-native-async-storage/async-storage';
import { albumAssociationsForTrack, mergeAlbumAssociations, type TrackModel } from '@models';
import type { YouTubeMusicAlbum } from '../../api/albums/youtubeMusicAlbum';
import { getLibraryTracks, upsertCatalogTracks, type LibraryTrack } from './catalogLibrary';
import { getLocalAlbumId } from './localCollections';
import { normalizeReleaseTitle } from './artistReleases';

type SavedAlbum = { album: YouTubeMusicAlbum; aliases: string[] };
const STORAGE_KEY = 'openfy_album_metadata_v1';
let mutation = Promise.resolve();

const trackTitle = (title: string) => normalizeReleaseTitle(title.replace(/\s*\((?:feat\.?|ft\.?)\s+[^)]*\)/gi, ''));
const matchesTrack = (track: TrackModel, saved: LibraryTrack) =>
  track.id === saved.spotifyId || Boolean(track.youtubeVideoId && track.youtubeVideoId === saved.youtubeVideoId) || (
    trackTitle(track.title) === trackTitle(saved.title) &&
    normalizeReleaseTitle(track.artists?.[0]?.name || track.subtitle.split(',')[0]) ===
      normalizeReleaseTitle(saved.artists?.[0]?.name || saved.artistName.split(',')[0])
  );

const trackIdentity = (title: string, artist: string) =>
  `${trackTitle(title)}:${normalizeReleaseTitle(artist)}`;

/** One pass of a large library, rather than one scan per album member. */
const savedTrackLookup = (library: LibraryTrack[]) => {
  const byId = new Map<string, LibraryTrack>();
  const byVideo = new Map<string, LibraryTrack>();
  const byIdentity = new Map<string, LibraryTrack>();
  library.forEach((saved) => {
    if (!byId.has(saved.spotifyId)) byId.set(saved.spotifyId, saved);
    if (saved.youtubeVideoId && !byVideo.has(saved.youtubeVideoId)) byVideo.set(saved.youtubeVideoId, saved);
    const key = trackIdentity(saved.title, saved.artists?.[0]?.name || saved.artistName.split(',')[0]);
    if (!byIdentity.has(key)) byIdentity.set(key, saved);
  });
  return (track: TrackModel) => {
    const candidates = [byId.get(track.id),
      track.youtubeVideoId ? byVideo.get(track.youtubeVideoId) : undefined,
      byIdentity.get(trackIdentity(track.title, track.artists?.[0]?.name || track.subtitle.split(',')[0]))];
    return candidates.find((candidate) => candidate && matchesTrack(track, candidate));
  };
};

const readAlbums = async (): Promise<SavedAlbum[]> => {
  try {
    const data = JSON.parse(await AsyncStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(data) ? data.filter((entry) =>
      entry?.album?.id && Array.isArray(entry.album.tracks) && entry.album.tracks.length && Array.isArray(entry.aliases)
    ) : [];
  } catch { return []; }
};

/** Store the complete member list once; tracks reference its album id and shared artwork. */
export const rememberAlbumMetadata = async (album: YouTubeMusicAlbum) => {
  if (!album.tracks.length) return;
  const operation = mutation.then(async () => {
    const library = await getLibraryTracks();
    const albumById = new Map(album.tracks.map((track) => [track.id, track]));
    const albumByVideo = new Map(album.tracks.filter((track) => track.youtubeVideoId)
      .map((track) => [track.youtubeVideoId!, track]));
    const albumByIdentity = new Map(album.tracks.map((track) => [
      trackIdentity(track.title, track.artists?.[0]?.name || track.subtitle.split(',')[0]), track,
    ]));
    const aliases = new Set([album.id, `spotify:${album.id.replace(/^ytalbum_/, '')}`]);
    const updates = library.flatMap((saved) => {
      const track = [albumById.get(saved.spotifyId),
        saved.youtubeVideoId ? albumByVideo.get(saved.youtubeVideoId) : undefined,
        albumByIdentity.get(trackIdentity(saved.title, saved.artists?.[0]?.name || saved.artistName.split(',')[0]))]
        .find((candidate) => candidate && matchesTrack(candidate, saved));
      if (!track) return [];
      const albumId = track.albumId || album.id.replace(/^ytalbum_/, '');
      const albumArtists = track.albumArtists?.length
        ? track.albumArtists
        : album.artists.map(({ id, name }) => ({ id, name }));
      const association = {
        id: albumId,
        name: album.name,
        imageURL: album.imageURL || track.imageURL,
        albumArtists,
        trackNumber: track.trackNumber,
        discNumber: track.discNumber,
        releaseType: album.releaseType,
        releaseDate: album.releaseDate,
      } as const;
      const albumAssociations = mergeAlbumAssociations(
        albumAssociationsForTrack(saved),
        track.albumAssociations,
        [association],
      );
      const samePrimaryRelease =
        normalizeReleaseTitle(saved.albumName) === normalizeReleaseTitle(album.name) ||
        saved.albumId === albumId;
      if (samePrimaryRelease) aliases.add(getLocalAlbumId(saved));
      const next = {
        ...saved,
        ...(samePrimaryRelease ? {
          albumId,
          albumName: album.name,
          albumArtists,
          trackNumber: track.trackNumber,
          discNumber: track.discNumber,
          imageURL: album.imageURL || saved.imageURL,
        } : {}),
        albumAssociations,
      };
      if (JSON.stringify(next) === JSON.stringify(saved)) return [];
      return [{
        ...next,
      }];
    });
    const entries = await readAlbums();
    entries.find((entry) => entry.album.id === album.id)?.aliases.forEach((alias) => aliases.add(alias));
    const next = [{ album, aliases: [...aliases] }, ...entries.filter((entry) => entry.album.id !== album.id)].slice(0, 40);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Enrich existing library entries only. Browsing an album must not save every song.
    if (updates.length) await upsertCatalogTracks(updates);
  });
  mutation = operation.catch(() => {});
  return operation;
};

export const getRememberedAlbum = async (id: string, title?: string, artist?: string) => {
  const entries = await readAlbums();
  return entries.find((entry) => entry.aliases.includes(id) || (
    title && artist && normalizeReleaseTitle(entry.album.name) === normalizeReleaseTitle(title) &&
    entry.album.artists.some((ref) => normalizeReleaseTitle(ref.name) === normalizeReleaseTitle(artist))
  ))?.album || null;
};

export const withLibraryAlbumTracks = async (album: YouTubeMusicAlbum): Promise<YouTubeMusicAlbum> => {
  const library = await getLibraryTracks();
  const lookup = savedTrackLookup(library);
  return {
    ...album,
    tracks: album.tracks.map((track) => {
      const saved = lookup(track);
      return saved ? {
        ...track,
        id: saved.spotifyId,
        isDownloaded: saved.isDownloaded,
        localAudioPath: saved.localAudioPath,
        localImagePath: saved.localImagePath,
        imageURL: saved.localImagePath || track.imageURL,
      } : track;
    }),
  };
};
