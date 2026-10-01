import { ArtistModel } from '@models';
import { ArtistResponseType } from '@config';
import { parseToArtist } from '@utils';
import { getSpotifyArtistImage } from '../../services/metadata/spotifyMetadata';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';

import { BASE_URL, spotifyGet } from '../config';

export const getArtist = async (artistId: string): Promise<ArtistModel> => {
  try {
    const response = await spotifyGet<ArtistResponseType>(
      `${BASE_URL}/artists/${artistId}`
    );

    const artist = parseToArtist(response.data);
    if (artist.imageURL) return artist;

    const imageURL = await getSpotifyArtistImage(artistId);
    return imageURL ? { ...artist, imageURL } : artist;
  } catch (error) {
    console.error(`Error fetching artist with an ID: ${artistId}`, error);
    throw error;
  }
};

type ArtistSearchResponse = {
  artists?: {
    items?: { id?: string; name?: string }[];
  };
};

const normalizeArtistName = (value: string) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase();

const artistIdByNameCache = createAsyncResourceCache<string>({
  name: 'Spotify artist id by name',
  category: 'artist',
  maxEntries: 250,
  ttlFor: (artistId) => artistId ? 24 * 60 * 60_000 : 5 * 60_000,
});

/** Resolve imported/local artist names only when their Spotify id was not retained. */
export const findArtistIdByName = async (
  artistName: string
): Promise<string> => {
  const query = artistName.trim();
  if (!query) return '';

  const normalized = normalizeArtistName(query);
  return artistIdByNameCache.getOrLoad(normalized, async () => {
    try {
      const response = await spotifyGet<ArtistSearchResponse>(
        `${BASE_URL}/search`,
        {
          params: { q: query, type: 'artist', limit: 5 },
        }
      );
      const artists = response.data.artists?.items ?? [];
      return artists.find((artist) => artist.name && normalizeArtistName(artist.name) === normalized)
        ?.id || '';
    } catch {
      return '';
    }
  }, 24 * 60 * 60_000);
};
