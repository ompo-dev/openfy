import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
import { fetchSpotifyTrackCredits } from '../metadata/spotifyMetadata';
import { resolveTrackArtists, type ArtistIdentityTrack } from './artistIdentity';

export type TrackCredit = { id: string; name: string; spotifyId?: string };
export type TrackCredits = { artists: TrackCredit[]; artistCreditsVersion?: number };
export const ARTIST_CREDITS_VERSION = 2;
const normalize = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const spotifyCredits = createAsyncResourceCache<TrackCredit[]>({
  name: 'complete recording credits', category: 'artist', maxEntries: 200,
  ttlFor: (credits) => credits.length ? 6 * 60 * 60_000 : 60_000,
});

/** Channel ownership identifies navigation, not the complete personnel or primary artist. */
export const resolveTrackCredits = async (
  track: ArtistIdentityTrack & { artistCreditsVersion?: number },
): Promise<TrackCredits> => {
  const id = track.spotifyId || track.id || '';
  const isSpotify = /^[A-Za-z0-9]{22}$/.test(id);
  let credits: TrackCredit[] = (track.artists || []).map((artist) => ({ ...artist, id: artist.id || '' }));
  let verified = track.artistCreditsVersion === ARTIST_CREDITS_VERSION;
  if (isSpotify && !verified) {
    const restored = await spotifyCredits.getOrLoad(id, () => fetchSpotifyTrackCredits(id), 6 * 60 * 60_000).catch(() => []);
    if (restored.length) {
      // An authenticated import can include more participants than the public page.
      const imported = credits.filter((credit) => /^[A-Za-z0-9]{22}$/.test(credit.spotifyId || credit.id));
      const known = new Set(restored.map((credit) => normalize(credit.name)));
      credits = [...restored, ...imported.filter((credit) => !known.has(normalize(credit.name)))];
      verified = true;
    }
  }
  const channels = await resolveTrackArtists(track).catch(() => []);
  if (!credits.length) {
    credits = (track.artistName || '').split(/\s*(?:,| feat\.?)\s*/i).filter(Boolean)
      .map((name) => ({ id: '', name: name.trim() }));
  }
  if (!credits.length) credits = channels;
  const artists = credits.map((credit) => {
    const matches = channels.filter((channel) => normalize(channel.name) === normalize(credit.name));
    if (matches.length !== 1) return credit;
    return { ...credit, id: matches[0].id,
      ...(/^[A-Za-z0-9]{22}$/.test(credit.id) ? { spotifyId: credit.id } : {}) };
  });
  const known = new Set(artists.map((credit) => normalize(credit.name)));
  channels.forEach((channel) => {
    if (!known.has(normalize(channel.name))) { artists.push(channel); known.add(normalize(channel.name)); }
  });
  return { artists, ...(verified || !isSpotify ? { artistCreditsVersion: ARTIST_CREDITS_VERSION } : {}) };
};

export const _clearTrackCreditsForTests = () => spotifyCredits.clear();
