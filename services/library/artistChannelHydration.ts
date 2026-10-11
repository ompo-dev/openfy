import { getDownloadedTrack } from '../download/downloadManager';
import { getArtistRecordingVideoId } from '../search/artistIdentity';
import { ARTIST_CREDITS_VERSION, resolveTrackCredits } from '../search/trackCredits';
import { getCatalogTracks, upsertCatalogTracks, type LibraryTrack } from './catalogLibrary';
import { useLibraryStore } from '../../stores/useLibraryStore';

const queued = new Map<string, LibraryTrack>();
const attempted = new Map<string, number>();
let running = 0;

/** Recover complete saved credits, then attach verified channels without blocking rendering. */
export const hydrateLibraryArtistChannels = (tracks: LibraryTrack[]) => {
  for (const track of tracks) {
    if (track.artistCreditsVersion === ARTIST_CREDITS_VERSION) continue;
    const key = JSON.stringify([track.spotifyId, track.youtubeVideoId, track.youtubeUrl]);
    if (Date.now() - (attempted.get(key) || 0) < 5 * 60_000) continue;
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
      const { artists, artistCreditsVersion } = await resolveTrackCredits(track);
      if (!artists.length || !artistCreditsVersion) return;
      // Do not restore an item removed or edited while its metadata was loading.
      const current = (await getCatalogTracks()).find((item) => item.spotifyId === track.spotifyId) ||
        await getDownloadedTrack(track.spotifyId);
      if (!current || await getArtistRecordingVideoId(current) !== videoId) return;
      if (JSON.stringify(current.artists) !== JSON.stringify(track.artists)) return;
      await upsertCatalogTracks([{ ...current, artists, artistCreditsVersion,
        artistName: artists.map((artist) => artist.name).join(', ') }]);
      useLibraryStore.getState().refreshLibrary();
    })().catch(() => {}).finally(() => { running -= 1; pump(); });
  }
};
