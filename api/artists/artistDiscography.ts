import type { LibraryItemModel, TrackModel } from '@models';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
import { log } from '../../utils/appLogger';
import { BASE_URL, spotifyGet } from '../config';

type ArtistAlbum = {
  id: string;
  name: string;
  album_type: string;
  release_date: string;
  images: { url: string }[];
  artists: { id: string; name: string }[];
};

type ArtistAlbumPage = { items: ArtistAlbum[]; total: number };
type AlbumTrack = {
  id: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  artists: { id?: string; name: string }[];
};
type AlbumTrackPage = { items: AlbumTrack[]; total: number };

export type ArtistDiscography = {
  albums: LibraryItemModel[];
  tracks: TrackModel[];
};

const ALBUM_PAGE_SIZE = 50;
const MAX_ALBUMS = 100;
const ALBUM_TRACK_CONCURRENCY = 5;
const discographyCache = createAsyncResourceCache<ArtistDiscography>({
  name: 'spotify artist discography',
  category: 'artist',
  maxEntries: 100,
});

const loadAlbumTracks = async (album: ArtistAlbum): Promise<TrackModel[]> => {
  try {
    const albumTracks: AlbumTrack[] = [];
    let offset = 0;
    let total = 0;
    do {
      const { data } = await spotifyGet<AlbumTrackPage>(
        `${BASE_URL}/albums/${album.id}/tracks`,
        { params: { limit: ALBUM_PAGE_SIZE, offset, market: 'BR' } }
      );
      const page = data.items || [];
      albumTracks.push(...page);
      total = data.total || 0;
      offset += page.length;
      if (page.length === 0) break;
    } while (offset < total);

    return albumTracks.map((track) => {
      const artists = (track.artists || []).map((artist) => ({
        id: artist.id || '',
        name: artist.name,
      }));
      return {
        id: track.id,
        title: track.name,
        subtitle: artists.map((artist) => artist.name).join(', '),
        imageURL: album.images?.[0]?.url || '',
        albumName: album.name,
        albumId: album.id,
        albumArtists: album.artists,
        durationMs: track.duration_ms,
        artists,
        explicit: track.explicit,
      };
    });
  } catch (error) {
    log.artist('Spotify album tracks unavailable', {
      albumId: album.id,
      error: String(error),
    });
    return [];
  }
};

const loadDiscography = async (artistId: string): Promise<ArtistDiscography> => {
  const albums: ArtistAlbum[] = [];
  const seenAlbumIds = new Set<string>();

  for (let offset = 0; offset < MAX_ALBUMS; offset += ALBUM_PAGE_SIZE) {
    const { data } = await spotifyGet<ArtistAlbumPage>(
      `${BASE_URL}/artists/${artistId}/albums`,
      {
        params: {
          include_groups: 'album,single,compilation,appears_on',
          limit: ALBUM_PAGE_SIZE,
          offset,
          market: 'BR',
        },
      }
    );
    for (const album of data.items) {
      if (album.id && !seenAlbumIds.has(album.id)) {
        seenAlbumIds.add(album.id);
        albums.push(album);
      }
    }
    if (data.items.length < ALBUM_PAGE_SIZE || albums.length >= MAX_ALBUMS) break;
  }

  const uniqueAlbums = albums.slice(0, MAX_ALBUMS);
  const albumTracks: TrackModel[][] = Array.from({ length: uniqueAlbums.length });
  let cursor = 0;
  await Promise.all(Array.from(
    { length: Math.min(ALBUM_TRACK_CONCURRENCY, uniqueAlbums.length) },
    async () => {
      while (cursor < uniqueAlbums.length) {
        const index = cursor++;
        albumTracks[index] = await loadAlbumTracks(uniqueAlbums[index]);
      }
    }
  ));

  const tracks = new Map<string, TrackModel>();
  albumTracks.flat().forEach((track) => {
    if (track.id && !tracks.has(track.id)) tracks.set(track.id, track);
  });

  return {
    albums: uniqueAlbums.map((album) => ({
      id: album.id,
      type: 'album',
      title: album.name,
      subtitle: [album.release_date?.slice(0, 4), album.album_type]
        .filter(Boolean)
        .join(' · '),
      imageURL: album.images?.[0]?.url || '',
    })),
    tracks: [...tracks.values()],
  };
};

export const getArtistDiscography = (artistId: string) =>
  discographyCache.getOrLoad(
    artistId,
    () => {
      const finish = log.time('artist', 'Spotify artist discography load', { artistId });
      return loadDiscography(artistId).then((result) => {
        finish({ ok: true, albums: result.albums.length, tracks: result.tracks.length });
        return result;
      }).catch((error) => {
        finish({ ok: false, error: String(error) });
        throw error;
      });
    },
    15 * 60_000
  );
