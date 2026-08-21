import { TrackModel } from '@models';
import { BASE_URL, spotifyGet } from '../config';

type ArtistTopTracksResponse = {
  tracks: {
    id: string;
    name: string;
    duration_ms: number;
    explicit: boolean;
    artists: { id: string; name: string }[];
    album: { name: string; images: { url: string }[] };
  }[];
};

export const getArtistTopTracks = async (
  artistId: string,
  market = 'BR'
): Promise<TrackModel[]> => {
  const response = await spotifyGet<ArtistTopTracksResponse>(`${BASE_URL}/artists/${artistId}/top-tracks`, {
    params: { market },
  });

  return response.data.tracks.map((track) => ({
    id: track.id,
    title: track.name,
    subtitle: track.artists.map((artist) => artist.name).join(', '),
    imageURL: track.album.images[0]?.url || '',
    albumName: track.album.name,
    durationMs: track.duration_ms,
    artists: track.artists,
    explicit: track.explicit,
  }));
};
