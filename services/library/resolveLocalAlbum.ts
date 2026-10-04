import { getYouTubeMusicAlbum, type YouTubeMusicAlbum } from '../../api/albums/youtubeMusicAlbum';
import { getYouTubeMusicArtistProfile } from '../../api/search/catalog';
import { toYouTubeMusicArtistRouteId } from '../youtubeMusicClient';
import { getLibraryTracks } from './catalogLibrary';
import { groupLocalAlbums } from './localCollections';
import { normalizeReleaseTitle } from './artistReleases';
import { getRememberedAlbum, withLibraryAlbumTracks } from './albumMetadata';

export const resolveLocalAlbum = async (id: string): Promise<YouTubeMusicAlbum & { partial?: boolean }> => {
  const library = await getLibraryTracks();
  const local = groupLocalAlbums(library).find((album) => album.id === id);
  const artist = local?.tracks[0]?.albumArtists?.[0] || local?.tracks[0]?.artists?.[0];
  const artistName = artist?.name || local?.subtitle.split(',')[0] || '';
  const remembered = await getRememberedAlbum(id, local?.title, artistName);
  if (remembered) return withLibraryAlbumTracks(remembered);
  if (!local) throw new Error('Álbum não encontrado.');

  try {
    const nativeId = id.replace(/^spotify:/, '');
    if (nativeId.startsWith('MPRE')) return withLibraryAlbumTracks(await getYouTubeMusicAlbum(`ytalbum_${nativeId}`));
    const profile = await getYouTubeMusicArtistProfile(toYouTubeMusicArtistRouteId(
      artist?.id.startsWith('UC') || artist?.id.startsWith('ytartist_') ? artist.id : undefined,
      artistName
    ));
    const release = [...profile.albums, ...profile.singlesAndEps].find((candidate) =>
      normalizeReleaseTitle(candidate.title) === normalizeReleaseTitle(local.title)
    );
    if (release) return withLibraryAlbumTracks(await getYouTubeMusicAlbum(release.id));
  } catch {
    // Offline listeners can still open and play the library's saved subset.
  }
  const localArtists = new Map<string, { id: string; name: string }>();
  local.tracks.forEach((track) => (track.artists?.length ? track.artists :
    track.artistName.split(',').map((name) => ({ id: '', name: name.trim() }))
  ).forEach((ref) => {
    if (ref.name) localArtists.set(ref.name.toLocaleLowerCase(), ref);
  }));
  return {
    id, name: local.title, imageURL: local.imageURL, releaseDate: '', releaseType: 'album', partial: true,
    artists: [...localArtists.values()],
    tracks: local.tracks.map((track) => ({
      ...track, id: track.spotifyId, subtitle: track.artistName, durationMs: track.duration_ms,
      imageURL: track.localImagePath || track.imageURL,
    })),
  };
};
