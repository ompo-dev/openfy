import { TrackModel } from '@models';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
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

const artistTopTracksCache = createAsyncResourceCache<TrackModel[]>({
  name: 'spotify artist top tracks',
  category: 'artist',
  maxEntries: 24,
});

const loadArtistTopTracks = async (
  artistId: string,
  market: string
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

export const getArtistTopTracks = (
  artistId: string,
  market = 'BR'
): Promise<TrackModel[]> => artistTopTracksCache.getOrLoad(
  `${market}:${artistId}`,
  () => loadArtistTopTracks(artistId, market),
  15 * 60_000
);

export const discardPrefetchedArtistTopTracks = (artistId: string, market = 'BR') =>
  artistTopTracksCache.delete(`${market}:${artistId}`);

export const _clearArtistTopTracksCacheForTests = () => artistTopTracksCache.clear();
