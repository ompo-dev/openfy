import { ArtistModel, TrackModel } from '@models';
import { BASE_URL, spotifyGet } from '../config';

type SpotifyImage = { url?: string; width?: number };
type SpotifyArtist = { id?: string; name?: string };
type SpotifyTrack = {
  id?: string;
  name?: string;
  duration_ms?: number;
  explicit?: boolean;
  artists?: SpotifyArtist[];
  album?: {
    id?: string;
    name?: string;
    images?: SpotifyImage[];
    artists?: SpotifyArtist[];
  };
};
type SpotifyArtistResult = {
  id?: string;
  name?: string;
  genres?: string[];
  followers?: { total?: number };
  images?: SpotifyImage[];
};

export type CatalogSearchResults = {
  artists: ArtistModel[];
  tracks: TrackModel[];
};

const largestImage = (images: SpotifyImage[] = []) =>
  [...images]
    .sort((first, second) => (second.width || 0) - (first.width || 0))
    .find((image) => image.url)?.url || '';

/** Searches the public Spotify catalog directly from the device. */
export const searchCatalog = async (
  query: string,
  limit = 12
): Promise<CatalogSearchResults> => {
  const cleanQuery = query.trim();
  if (!cleanQuery) return { artists: [], tracks: [] };

  const [tracksResponse, artistsResponse] = await Promise.all([
    spotifyGet<{ tracks?: { items?: SpotifyTrack[] } }>(`${BASE_URL}/search`, {
      params: { q: cleanQuery, type: 'track', limit, market: 'BR' },
    }),
    spotifyGet<{ artists?: { items?: SpotifyArtistResult[] } }>(
      `${BASE_URL}/search`,
      { params: { q: cleanQuery, type: 'artist', limit, market: 'BR' } }
    ),
  ]);

  const tracks = (tracksResponse.data.tracks?.items || []).flatMap(
    (track): TrackModel[] => {
      if (!track.id || !track.name) return [];
      const artists = (track.artists || [])
        .filter((artist): artist is SpotifyArtist & { id: string; name: string } =>
          Boolean(artist.id && artist.name)
        )
        .map((artist) => ({ id: artist.id, name: artist.name }));
      const albumArtists = (track.album?.artists || [])
        .filter((artist): artist is SpotifyArtist & { id: string; name: string } =>
          Boolean(artist.id && artist.name)
        )
        .map((artist) => ({ id: artist.id, name: artist.name }));

      return [{
        id: track.id,
        title: track.name,
        subtitle: artists.map((artist) => artist.name).join(', '),
        imageURL: largestImage(track.album?.images),
        albumName: track.album?.name || '',
        albumId: track.album?.id,
        albumArtists,
        durationMs: track.duration_ms || 0,
        artists,
        explicit: Boolean(track.explicit),
      }];
    }
  );
  const artists = (artistsResponse.data.artists?.items || []).flatMap(
    (artist): ArtistModel[] =>
      artist.id && artist.name
        ? [{
            type: 'artist',
            id: artist.id,
            name: artist.name,
            imageURL: largestImage(artist.images),
            genres: artist.genres || [],
            followers: artist.followers?.total || 0,
          }]
        : []
  );

  return { artists, tracks };
};
