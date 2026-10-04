import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TrackModel } from '@models';
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
    normalizeReleaseTitle(track.albumName || '') === normalizeReleaseTitle(saved.albumName) &&
    normalizeReleaseTitle(track.artists?.[0]?.name || track.subtitle.split(',')[0]) ===
      normalizeReleaseTitle(saved.artists?.[0]?.name || saved.artistName.split(',')[0])
  );

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
    const aliases = new Set([album.id, `spotify:${album.id.replace(/^ytalbum_/, '')}`]);
    const updates = library.flatMap((saved) => {
      const track = album.tracks.find((candidate) => matchesTrack(candidate, saved));
      if (!track) return [];
      // The same recording can also have a separate single/deluxe release.
      // Share its downloaded audio, but never redirect that release's album id.
      if (normalizeReleaseTitle(saved.albumName) !== normalizeReleaseTitle(album.name) && saved.albumId !== track.albumId) return [];
      aliases.add(getLocalAlbumId(saved));
      if (saved.albumId === track.albumId && saved.imageURL === album.imageURL &&
        saved.trackNumber === track.trackNumber && JSON.stringify(saved.albumArtists) === JSON.stringify(track.albumArtists)) return [];
      return [{
        ...saved,
        albumId: track.albumId,
        albumName: album.name,
        albumArtists: track.albumArtists,
        trackNumber: track.trackNumber,
        imageURL: album.imageURL || saved.imageURL,
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
  return {
    ...album,
    tracks: album.tracks.map((track) => {
      const saved = library.find((candidate) => matchesTrack(track, candidate));
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
