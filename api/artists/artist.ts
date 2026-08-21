import { ArtistModel } from '@models';
import { ArtistResponseType } from '@config';
import { parseToArtist } from '@utils';

import { BASE_URL, spotifyGet } from '../config';

const MUSIC_SERVER_URL = 'http://localhost:3001';

const getYouTubeArtistImage = async (artistName: string) => {
  try {
    const response = await fetch(
      `${MUSIC_SERVER_URL}/api/youtube/artist-image?artist=${encodeURIComponent(artistName)}`
    );
    if (!response.ok) return '';

    const data = (await response.json()) as { imageURL?: unknown };
    return typeof data.imageURL === 'string' ? data.imageURL : '';
  } catch {
    return '';
  }
};

export const getArtist = async (artistId: string): Promise<ArtistModel> => {
  try {
    const response = await spotifyGet<ArtistResponseType>(
      `${BASE_URL}/artists/${artistId}`
    );

    const artist = parseToArtist(response.data);
    if (artist.imageURL) return artist;

    const imageURL = await getYouTubeArtistImage(artist.name);
    return imageURL ? { ...artist, imageURL } : artist;
  } catch (error) {
    console.error(`Error fetching artist with an ID: ${artistId}`, error);
    throw error;
  }
};
