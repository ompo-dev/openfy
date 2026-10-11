import type { ArtistModel } from '@models';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
import { hasCanonicalTitleMatch, splitCanonicalArtists } from '../canonical/canonicalMatcher';
import { getYouTubeMusicClient, getYouTubeMusicText, parseYouTubeMusicArtistRoute,
  toYouTubeMusicArtistRouteId, withYouTubeMusicTimeout } from '../youtubeMusicClient';

export type ArtistIdentityTrack = {
  title: string;
  artistName?: string;
  artists?: { id?: string; name: string }[];
};
export type ArtistSearchContext = {
  tracks?: ArtistIdentityTrack[];
  artists?: { id?: string; name: string; imageURL?: string }[];
};
const normalize = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const hasArtistIdentity = (id = '') => /^[A-Za-z0-9]{22}$/.test(id) ||
  /^UC[\w-]{22}$/.test(id) || (id.startsWith('ytartist_') && Boolean(parseYouTubeMusicArtistRoute(id).browseId));
export const artistIdentityKey = (id = '') => {
  if (id.startsWith('ytartist_')) {
    const browseId = parseYouTubeMusicArtistRoute(id).browseId;
    return browseId ? `youtube:${browseId}` : '';
  }
  return /^UC[\w-]{22}$/.test(id) ? `youtube:${id}` : /^[A-Za-z0-9]{22}$/.test(id) ? `spotify:${id}` : '';
};

const identities = createAsyncResourceCache<{ id: string; name: string }>({
  name: 'track artist identity', category: 'artist', maxEntries: 200,
  ttlFor: (artist) => hasArtistIdentity(artist.id) ? 6 * 60 * 60_000 : 10_000,
});

/** A real credit ID is authoritative; a name alone needs the recording's context. */
export const resolveTrackArtist = async (
  artist: { id?: string; name: string }, track?: ArtistIdentityTrack,
): Promise<{ id: string; name: string }> => {
  const id = artist.id || '';
  if (hasArtistIdentity(id)) return { id: id.startsWith('UC') ? toYouTubeMusicArtistRouteId(id, artist.name) : id, name: artist.name };
  const fallback = { id: id || toYouTubeMusicArtistRouteId(undefined, artist.name), name: artist.name };
  if (!track?.title) return fallback;
  const credits = track.artists?.length ? track.artists.map((credit) => credit.name)
    : splitCanonicalArtists(track.artistName || artist.name);
  const key = JSON.stringify([normalize(artist.name), normalize(track.title), credits.map(normalize)]);
  return identities.getOrLoad(key, async () => {
    const client = await withYouTubeMusicTimeout(getYouTubeMusicClient(), 3_000);
    if (!client) return fallback;
    const result = await withYouTubeMusicTimeout(client.music.search(
      `${track.title} ${credits.join(' ')}`, { type: 'song' }), 4_000);
    for (const item of array(record(result?.songs).contents)) {
      const song = record(item);
      if (!hasCanonicalTitleMatch(getYouTubeMusicText(song.title), track.title)) continue;
      const references = array(song.artists).length ? array(song.artists) : array(song.authors);
      const otherCredits = credits.map(normalize).filter((name) => name !== normalize(artist.name));
      if (otherCredits.length && !references.some((reference) =>
        otherCredits.includes(normalize(getYouTubeMusicText(record(reference).name))))) continue;
      for (const reference of references) {
        const credit = record(reference);
        const name = getYouTubeMusicText(credit.name);
        const channel = getYouTubeMusicText(credit.channel_id) || getYouTubeMusicText(credit.id);
        if (normalize(name) === normalize(artist.name) && /^UC[\w-]{22}$/.test(channel)) {
          return { id: toYouTubeMusicArtistRouteId(channel, name), name };
        }
      }
    }
    return fallback;
  }, 6 * 60 * 60_000).catch(() => fallback);
};

/** Rank known identities first, without merging or hiding homonymous artists. */
export const personalizeArtistSearch = async (
  query: string, results: ArtistModel[], context: ArtistSearchContext = {},
): Promise<ArtistModel[]> => {
  const term = normalize(query);
  const known = [...(context.artists || [])];
  const trackCandidates = (context.tracks || []).flatMap((track) =>
    (track.artists?.length ? track.artists : (track.artistName || '').split(/[,·]/)
      .map((name) => ({ id: undefined, name: name.trim() })).filter((artist) => artist.name))
      .filter((artist) => normalize(artist.name).includes(term))
      .map((artist) => ({ artist, track })));
  const seen = new Set<string>();
  for (const { artist, track } of trackCandidates) {
    const key = `${artist.id || ''}:${normalize(artist.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    known.push(await resolveTrackArtist(artist, track));
    if (seen.size >= 3) break;
  }
  const relevant = known.filter((artist) => hasArtistIdentity(artist.id) && normalize(artist.name).includes(term));
  const candidates = new Map<string, ArtistModel>(results.map((artist) => [artistIdentityKey(artist.id) || artist.id, artist]));
  relevant.forEach((artist) => {
    const id = artist.id!;
    const key = artistIdentityKey(id);
    if (!candidates.has(key)) candidates.set(key, { type: 'artist', id, name: artist.name, imageURL: artist.imageURL || '' });
  });
  const score = (artist: ArtistModel) => (relevant.some((knownArtist) => artistIdentityKey(knownArtist.id) === artistIdentityKey(artist.id)) ? 100 : 0) +
    (normalize(artist.name) === term ? 20 : normalize(artist.name).startsWith(term) ? 10 : 0);
  return [...candidates.values()].sort((a, b) => score(b) - score(a));
};
