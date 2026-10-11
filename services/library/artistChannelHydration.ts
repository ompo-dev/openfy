import { getDownloadedTrack } from '../download/downloadManager';
import { getArtistRecordingVideoId, artistIdentityKey, resolveTrackArtists } from '../search/artistIdentity';
import { getCatalogTracks, upsertCatalogTracks, type LibraryTrack } from './catalogLibrary';
import { useLibraryStore } from '../../stores/useLibraryStore';

const queued = new Map<string, LibraryTrack>();
const attempted = new Map<string, number>();
let running = 0;

/** Migrate saved credits from the exact linked video without holding up library rendering. */
export const hydrateLibraryArtistChannels = (tracks: LibraryTrack[]) => {
  for (const track of tracks) {
    if (track.artists?.length && track.artists.every((artist) => artistIdentityKey(artist.id).startsWith('youtube:'))) continue;
    const key = JSON.stringify([track.spotifyId, track.youtubeVideoId, track.youtubeUrl]);
    if (Date.now() - (attempted.get(key) || 0) < 60_000) continue;
    attempted.set(key, Date.now());
    queued.set(key, track);
  }
  while (attempted.size > 500) attempted.delete(attempted.keys().next().value!);
  pump();
};

const pump = () => {
  while (running < 2 && queued.size) {
    const [key, track] = queued.entries().next().value!;
    queued.delete(key);
    running += 1;
    void (async () => {
      const videoId = await getArtistRecordingVideoId(track);
      if (!videoId) return;
      const artists = await resolveTrackArtists({ ...track, youtubeVideoId: videoId });
      if (!artists.length) return;
      // Do not restore an item removed or edited while its metadata was loading.
      const current = (await getCatalogTracks()).find((item) => item.spotifyId === track.spotifyId) ||
        await getDownloadedTrack(track.spotifyId);
      if (!current || await getArtistRecordingVideoId(current) !== videoId) return;
      await upsertCatalogTracks([{ ...current, artists, youtubeVideoId: videoId,
        artistName: artists.map((artist) => artist.name).join(', ') }]);
      useLibraryStore.getState().refreshLibrary();
    })().catch(() => {}).finally(() => { running -= 1; pump(); });
  }
};
