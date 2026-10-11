import { getYouTubeMusicClient, toYouTubeMusicArtistRouteId } from '../../youtubeMusicClient';
import { getCatalogMapping } from '../../audio/catalogMappingCache';
import { _clearArtistIdentitiesForTests, personalizeArtistSearch, resolveTrackArtist, resolveTrackArtists } from '../artistIdentity';
import type { ArtistModel } from '@models';

jest.mock('../../youtubeMusicClient', () => ({
  ...jest.requireActual('../../youtubeMusicClient'), getYouTubeMusicClient: jest.fn(),
}));
jest.mock('../../audio/catalogMappingCache', () => ({
  ...jest.requireActual('../../audio/catalogMappingCache'), getCatalogMapping: jest.fn(),
}));

const channel = 'UC' + 's'.repeat(22);
const other = 'UC' + 'b'.repeat(22);
const sid = toYouTubeMusicArtistRouteId(channel, 'Sid');
const band = toYouTubeMusicArtistRouteId(other, 'SID');
const videoId = 'abcdefghijk';
const search = jest.fn();
const getUpNext = jest.fn();
const getArtist = jest.fn();

describe('YouTube channel identities', () => {
  beforeEach(() => {
    jest.clearAllMocks(); _clearArtistIdentitiesForTests();
    jest.mocked(getCatalogMapping).mockResolvedValue(null);
    getUpNext.mockResolvedValue({ contents: [{ video_id: videoId, selected: true,
      artists: [{ name: 'Sid', channel_id: channel }] }] });
    getArtist.mockResolvedValue({ header: { title: 'Sid' } });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: { search, getUpNext, getArtist } } as never);
  });

  it('uses the selected video artist endpoint without searching any title or artist name', async () => {
    expect(await resolveTrackArtist({ id: '1234567890123456789012', name: 'Sid' }, {
      title: 'Untrusted title', youtubeVideoId: videoId,
    })).toEqual({ id: sid, name: 'Sid' });
    expect(getUpNext).toHaveBeenCalledWith(videoId, false);
    expect(getArtist).toHaveBeenCalledWith(channel);
    expect(search).not.toHaveBeenCalled();
  });

  it('never maps a provider-wide artist id from one recording to every other recording', async () => {
    const credit = { id: '1234567890123456789012', name: 'Sid' };
    await resolveTrackArtist(credit, { youtubeVideoId: videoId });
    expect(await resolveTrackArtist(credit)).toEqual({ id: '', name: 'Sid' });
  });

  it('preserves a linked YouTube channel without any discovery request', async () => {
    expect(await resolveTrackArtist({ id: sid, name: 'Sid' })).toEqual({ id: sid, name: 'Sid' });
    expect(getYouTubeMusicClient).not.toHaveBeenCalled();
  });

  it('never redirects an explicit channel link to a homonymous credit on another recording', async () => {
    expect(await resolveTrackArtist({ id: band, name: 'SID' }, { youtubeVideoId: videoId }))
      .toEqual({ id: band, name: 'SID' });
    expect(getUpNext).not.toHaveBeenCalled();
  });

  it('does not invent a channel when only a name and title are available', async () => {
    expect(await resolveTrackArtists({ title: 'Dueto', artistName: 'Sid, Tavin' })).toEqual([]);
    expect(await resolveTrackArtist({ name: 'Sid' }, { title: 'Dueto' })).toEqual({ id: '', name: 'Sid' });
    expect(getYouTubeMusicClient).not.toHaveBeenCalled();
  });

  it('rejects an autoplay neighbor even if it has the expected artist name', async () => {
    getUpNext.mockResolvedValue({ contents: [{ video_id: 'lmnopqrstuv', selected: true,
      artists: [{ name: 'Sid', channel_id: other }] }] });
    expect(await resolveTrackArtists({ youtubeVideoId: videoId })).toEqual([]);
    expect(getArtist).not.toHaveBeenCalled();
  });

  it('selects by exact video id even when the selected flag points at another row', async () => {
    getUpNext.mockResolvedValue({ contents: [
      { video_id: 'lmnopqrstuv', selected: true, artists: [{ name: 'SID', channel_id: other }] },
      { video_id: videoId, artists: [{ name: 'Sid', channel_id: channel }] },
    ] });
    expect(await resolveTrackArtists({ youtubeVideoId: videoId })).toEqual([{ id: sid, name: 'Sid' }]);
  });

  it('uses the real channel header for renamed credits', async () => {
    getUpNext.mockResolvedValue({ contents: [{ video_id: videoId,
      artists: [{ name: 'RND', channel_id: channel }] }] });
    getArtist.mockResolvedValue({ header: { title: 'Sotam' } });
    const artists = await resolveTrackArtists({ youtubeVideoId: videoId });
    expect(artists).toEqual([{ id: toYouTubeMusicArtistRouteId(channel, 'Sotam'), name: 'Sotam' }]);
    expect(await resolveTrackArtist({ id: toYouTubeMusicArtistRouteId(channel, 'RND'), name: 'RND' })).toEqual(artists[0]);
  });

  it('retains the linked duo channel instead of inventing individual member channels', async () => {
    getUpNext.mockResolvedValue({ contents: [{ video_id: videoId,
      artists: [{ name: 'Sid & Tavin', channel_id: channel }] }] });
    getArtist.mockResolvedValue({ header: { title: 'Sid & Tavin' } });
    expect(await resolveTrackArtists({ youtubeVideoId: videoId, artistName: 'Sid, Tavin' }))
      .toEqual([{ id: toYouTubeMusicArtistRouteId(channel, 'Sid & Tavin'), name: 'Sid & Tavin' }]);
    expect(await resolveTrackArtist({ name: 'Tavin' }, { youtubeVideoId: videoId })).toEqual({ id: '', name: 'Tavin' });
  });

  it('coalesces the exact recording request across concurrent credits', async () => {
    await Promise.all([resolveTrackArtists({ youtubeVideoId: videoId }), resolveTrackArtists({ youtubeVideoId: videoId })]);
    expect(getUpNext).toHaveBeenCalledTimes(1);
    expect(getArtist).toHaveBeenCalledTimes(1);
  });

  it('uses a previously confirmed recording mapping without a new search', async () => {
    jest.mocked(getCatalogMapping).mockResolvedValue({ videoId, source: 'ytmusic',
      policyVersion: 2, confidence: 100, confirmedAt: Date.now() });
    expect(await resolveTrackArtists({ spotifyId: 'saved-id', artistName: 'Sid' })).toEqual([{ id: sid, name: 'Sid' }]);
    expect(search).not.toHaveBeenCalled();
  });

  it('honors the manually edited audio video instead of stale embedded credits', async () => {
    jest.mocked(getCatalogMapping).mockResolvedValue({ videoId, source: 'user_direct', confidence: 100, confirmedAt: Date.now() });
    expect(await resolveTrackArtists({ spotifyId: 'saved-id', youtubeVideoId: 'lmnopqrstuv',
      artists: [{ id: band, name: 'SID' }] })).toEqual([{ id: sid, name: 'Sid' }]);
  });

  it('uses the current confirmed playback video instead of an outdated embedded link', async () => {
    jest.mocked(getCatalogMapping).mockResolvedValue({ videoId, source: 'ytmusic',
      policyVersion: 2, confidence: 100, confirmedAt: Date.now() });
    expect(await resolveTrackArtists({ spotifyId: 'corrected-recording', youtubeVideoId: 'lmnopqrstuv',
      artists: [{ id: band, name: 'SID' }] })).toEqual([{ id: sid, name: 'Sid' }]);
    expect(getUpNext).toHaveBeenCalledWith(videoId, false);
  });

  it('does not use an obsolete automatic recording mapping', async () => {
    jest.mocked(getCatalogMapping).mockResolvedValue({ videoId, source: 'ytmusic', policyVersion: 1, confidence: 100, confirmedAt: Date.now() });
    expect(await resolveTrackArtists({ spotifyId: 'saved-id' })).toEqual([]);
    expect(getUpNext).not.toHaveBeenCalled();
  });

  it('does not restore old channel credits if the edited recording cannot be loaded', async () => {
    jest.mocked(getCatalogMapping).mockResolvedValue({ videoId, source: 'user_direct', confidence: 100, confirmedAt: Date.now() });
    getUpNext.mockRejectedValue(new Error('Offline'));
    expect(await resolveTrackArtists({ spotifyId: 'edited-id', youtubeVideoId: 'lmnopqrstuv',
      artists: [{ id: band, name: 'SID' }] })).toEqual([]);
  });

  it('verifies mapped recordings when the native credit has no original video attached', async () => {
    jest.mocked(getCatalogMapping).mockResolvedValue({ videoId, source: 'user_direct', confidence: 100, confirmedAt: Date.now() });
    expect(await resolveTrackArtists({ spotifyId: 'edited-id', artists: [{ id: band, name: 'SID' }] }))
      .toEqual([{ id: sid, name: 'Sid' }]);
    expect(getUpNext).toHaveBeenCalledWith(videoId, false);
  });

  it('ranks the linked channel first while keeping a homonymous search result', async () => {
    const results: ArtistModel[] = [{ type: 'artist', id: band, name: 'SID', imageURL: 'band.jpg' }];
    expect((await personalizeArtistSearch('sid', results, { tracks: [{ youtubeVideoId: videoId, artistName: 'Sid' }] }))
      .map((artist) => artist.id)).toEqual([sid, band]);
  });

  it('does not inject an unlinked Spotify identity into YouTube search', async () => {
    const official: ArtistModel = { type: 'artist', id: sid, name: 'Sid', imageURL: 'real.jpg' };
    expect(await personalizeArtistSearch('sid', [official], {
      artists: [{ id: '1234567890123456789012', name: 'Sid' }],
    })).toEqual([official]);
  });
});
