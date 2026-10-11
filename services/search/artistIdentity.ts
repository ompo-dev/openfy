import type { ArtistModel } from '@models';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
import { getCatalogMapping, isCurrentCatalogMapping } from '../audio/catalogMappingCache';
import { parseSpotifyLink } from '../spotify/linkParser';
import { getYouTubeMusicClient, getYouTubeMusicText, parseYouTubeMusicArtistRoute,
  toYouTubeMusicArtistRouteId, withYouTubeMusicTimeout } from '../youtubeMusicClient';

export type ArtistIdentityTrack = {
  title?: string;
  id?: string;
  spotifyId?: string;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  videoId?: string;
  artistName?: string;
  artists?: { id?: string; name: string }[];
};
export type ArtistSearchContext = {
  tracks?: ArtistIdentityTrack[];
  artists?: { id?: string; name: string; imageURL?: string }[];
};
type ArtistReference = { id: string; name: string };
const normalize = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const publicArtists = new Map<string, ArtistReference>();
export const hasArtistIdentity = (id = '') => /^[A-Za-z0-9]{22}$/.test(id) ||
  /^UC[\w-]{22}$/.test(id) || (id.startsWith('ytartist_') && Boolean(parseYouTubeMusicArtistRoute(id).browseId));
export const artistIdentityKey = (id = ''): string => {
  if (id.startsWith('ytartist_')) {
    const browseId = parseYouTubeMusicArtistRoute(id).browseId;
    return browseId.startsWith('UC') ? `youtube:${browseId}` : '';
  }
  return /^UC[\w-]{22}$/.test(id) ? `youtube:${id}` : /^[A-Za-z0-9]{22}$/.test(id) ? `spotify:${id}` : '';
};

export const rememberPublicArtistIdentity = (artist: ArtistReference) => {
  const key = artistIdentityKey(artist.id);
  if (!key.startsWith('youtube:')) return;
  publicArtists.set(key, artist);
  while (publicArtists.size > 250) publicArtists.delete(publicArtists.keys().next().value!);
};
export const canonicalArtistReference = (artist: { id?: string; name: string }) =>
  publicArtists.get(artistIdentityKey(artist.id)) || artist;

const uniqueChannels = (artists: { id?: string; name: string }[]): ArtistReference[] => {
  const channels = new Map<string, ArtistReference>();
  artists.forEach((artist) => {
    const key = artistIdentityKey(artist.id);
    if (!key.startsWith('youtube:')) return;
    const known = canonicalArtistReference(artist);
    const id = known.id!.startsWith('UC') ? toYouTubeMusicArtistRouteId(known.id, known.name) : known.id!;
    channels.set(key, { id, name: known.name });
  });
  return [...channels.values()];
};

/** Recover an already linked video; never run a title/name search to invent a channel. */
export const getArtistRecordingVideoId = async (track: ArtistIdentityTrack): Promise<string> => {
  const id = track.spotifyId || track.id || '';
  const mapping = id ? await getCatalogMapping(id).catch(() => null) : null;
  if (mapping && isCurrentCatalogMapping(mapping) && /^[\w-]{11}$/.test(mapping.videoId)) return mapping.videoId;
  const linked = parseSpotifyLink(track.youtubeUrl || '');
  const explicit = track.youtubeVideoId || track.videoId || (id.startsWith('yt_') ? id.slice(3) : '') ||
    (linked?.platform === 'youtube' && linked.type === 'track' ? linked.id : '');
  if (/^[\w-]{11}$/.test(explicit)) return explicit;
  return '';
};

const recordingArtists = createAsyncResourceCache<ArtistReference[]>({
  name: 'recording channel credits', category: 'artist', maxEntries: 200,
  ttlFor: (artists) => artists.length ? 6 * 60 * 60_000 : 10_000,
});

/** Read the selected video's own artist links, not autoplay neighbors or a similar recording. */
export const resolveTrackArtists = async (track: ArtistIdentityTrack): Promise<ArtistReference[]> => {
  const native = uniqueChannels(track.artists || []);
  const videoId = await getArtistRecordingVideoId(track);
  const linked = track.youtubeVideoId || track.videoId || ((track.spotifyId || track.id || '').startsWith('yt_')
    ? (track.spotifyId || track.id || '').slice(3) : '');
  const linkedUrl = parseSpotifyLink(track.youtubeUrl || '');
  const originalVideoId = linked || (linkedUrl?.platform === 'youtube' && linkedUrl.type === 'track' ? linkedUrl.id : '');
  const sameRecording = !videoId || originalVideoId === videoId;
  if (native.length && sameRecording &&
    (track.artists || []).every((artist) => artistIdentityKey(artist.id).startsWith('youtube:'))) return native;
  if (!videoId) return native;
  return recordingArtists.getOrLoad(videoId, async () => {
    const client = await withYouTubeMusicTimeout(getYouTubeMusicClient(), 3_000);
    if (!client) return [];
    const queue = await withYouTubeMusicTimeout(client.music.getUpNext(videoId, false), 4_000);
    const recording = queue?.contents?.find((item) => (item.video_id || item.id) === videoId);
    if (!recording) return [];
    const references = recording.artists?.length ? recording.artists : recording.authors || [];
    const artists = uniqueChannels(references.flatMap((credit) => {
      const channel = credit.channel_id || credit.id || '';
      const name = getYouTubeMusicText(credit.name);
      return /^UC[\w-]{22}$/.test(channel) && name
        ? [{ id: toYouTubeMusicArtistRouteId(channel, name), name }] : [];
    }));
    return Promise.all(artists.map(async (artist) => {
      const known = canonicalArtistReference(artist);
      if (known !== artist) return { id: known.id!, name: known.name };
      const channel = parseYouTubeMusicArtistRoute(artist.id).browseId;
      const page = client.music.getArtist
        ? await withYouTubeMusicTimeout(client.music.getArtist(channel), 3_000).catch(() => null) : null;
      const name = getYouTubeMusicText(page?.header?.title) || artist.name;
      const resolved = { id: toYouTubeMusicArtistRouteId(channel, name), name };
      rememberPublicArtistIdentity(resolved);
      return resolved;
    }));
  }, 6 * 60 * 60_000).catch(() => sameRecording ? native : []);
};

/** Legacy credits navigate only when the actual recording links that artist's channel. */
export const resolveTrackArtist = async (
  artist: { id?: string; name: string }, track?: ArtistIdentityTrack,
): Promise<ArtistReference> => {
  const native = uniqueChannels([artist]);
  if (native.length) return native[0];
  const artists = track ? await resolveTrackArtists(track) : [];
  const linked = artists.find((credit) => artistIdentityKey(credit.id) === artistIdentityKey(artist.id));
  if (linked) return linked;
  const matches = artists.filter((credit) => normalize(credit.name) === normalize(artist.name));
  return matches.length === 1 ? matches[0] : { id: '', name: artist.name };
};

/** Rank linked channels first while preserving other same-name YouTube profiles. */
export const personalizeArtistSearch = async (
  query: string, results: ArtistModel[], context: ArtistSearchContext = {},
): Promise<ArtistModel[]> => {
  const term = normalize(query);
  const known = (context.artists || []).map(canonicalArtistReference);
  const candidates = (context.tracks || []).filter((track) =>
    (track.artists || []).some((artist) => normalize(artist.name).includes(term)) ||
    normalize(track.artistName || '').includes(term)).slice(0, 3);
  for (const track of candidates) known.push(...await resolveTrackArtists(track));
  const relevant = known.filter((artist) => artistIdentityKey(artist.id).startsWith('youtube:') && normalize(artist.name).includes(term));
  const merged = new Map<string, ArtistModel>(results.map((artist) => [artistIdentityKey(artist.id) || artist.id, artist]));
  relevant.forEach((artist) => {
    const key = artistIdentityKey(artist.id);
    if (!merged.has(key)) merged.set(key, { type: 'artist', id: artist.id!, name: artist.name, imageURL: '' });
  });
  const score = (artist: ArtistModel) => (relevant.some((knownArtist) => artistIdentityKey(knownArtist.id) === artistIdentityKey(artist.id)) ? 100 : 0) +
    (normalize(artist.name) === term ? 20 : normalize(artist.name).startsWith(term) ? 10 : 0);
  return [...merged.values()].sort((a, b) => score(b) - score(a));
};

export const _clearArtistIdentitiesForTests = () => {
  recordingArtists.clear(); publicArtists.clear();
};
