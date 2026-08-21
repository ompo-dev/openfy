import { ArtistModel } from '@models';
import { ArtistResponseType } from '@config';
import { fetchWithTimeout, parseToArtist } from '@utils';
import { Platform } from 'react-native';

import { BASE_URL, MUSIC_SERVER_URL, spotifyGet } from '../config';

export const getYouTubeArtistImage = async (artistName: string) => {
  const handle = artistName.trim().replace(/\s+/g, '');
  if (Platform.OS !== 'web' && handle) {
    try {
      const response = await fetchWithTimeout(
        `https://www.youtube.com/@${encodeURIComponent(handle)}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } },
        8000
      );
      const html = response.ok ? await response.text() : '';
      const imageURL = html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1];
      if (imageURL) return imageURL.replace(/\\u0026/g, '&');
    } catch {}

    try {
      const response = await fetchWithTimeout(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artistName} official`)}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } },
        8000
      );
      const html = response.ok ? await response.text() : '';
      const channelPath = html.match(/"channelRenderer":\{[\s\S]{0,4000}?"canonicalBaseUrl":"([^"]+)"/)?.[1];
      if (!channelPath) return '';
      const channel = await fetchWithTimeout(
        `https://www.youtube.com${channelPath}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } },
        8000
      );
      const channelHtml = channel.ok ? await channel.text() : '';
      return (
        channelHtml.match(/<meta property="og:image" content="([^"]+)"/i)?.[1]?.replace(/\\u0026/g, '&') ||
        ''
      );
    } catch {}
  }

  if (!MUSIC_SERVER_URL) return '';

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

type ArtistSearchResponse = {
  artists?: {
    items?: { id?: string; name?: string }[];
  };
};

/** Resolve imported/local artist names only when their Spotify id was not retained. */
export const findArtistIdByName = async (artistName: string): Promise<string> => {
  const query = artistName.trim();
  if (!query) return '';

  try {
    const response = await spotifyGet<ArtistSearchResponse>(`${BASE_URL}/search`, {
      params: { q: query, type: 'artist', limit: 5 },
    });
    const artists = response.data.artists?.items ?? [];
    const normalized = query.toLocaleLowerCase();
    return (
      artists.find((artist) => artist.name?.toLocaleLowerCase() === normalized)
        ?.id || artists.find((artist) => artist.id)?.id || ''
    );
  } catch {
    return '';
  }
};
