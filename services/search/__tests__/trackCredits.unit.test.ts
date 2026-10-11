import { resolveTrackCredits, _clearTrackCreditsForTests } from '../trackCredits';
import { resolveTrackArtists } from '../artistIdentity';
import { fetchSpotifyTrackCredits } from '../../metadata/spotifyMetadata';

jest.mock('../artistIdentity', () => ({ resolveTrackArtists: jest.fn() }));
jest.mock('../../metadata/spotifyMetadata', () => ({ fetchSpotifyTrackCredits: jest.fn() }));
const id = 'a'.repeat(22);
const primary = { id: 'b'.repeat(22), name: 'Primary' };
const guest = { id: 'c'.repeat(22), name: 'Guest' };
const channel = { id: 'ytartist_UCchannel~Guest', name: 'Guest' };

describe('complete credits and channel links', () => {
  beforeEach(() => {
    jest.clearAllMocks(); _clearTrackCreditsForTests();
    jest.mocked(fetchSpotifyTrackCredits).mockResolvedValue([primary, guest]);
    jest.mocked(resolveTrackArtists).mockResolvedValue([channel]);
  });
  it('preserves primary order and participants missing from the audio channel credits', async () => {
    expect(await resolveTrackCredits({ spotifyId: id, artists: [primary, guest] })).toEqual({
      artists: [primary, { ...channel, spotifyId: guest.id }], artistCreditsVersion: 2,
    });
  });
  it('recovers complete Spotify credits from already overwritten native-only metadata', async () => {
    expect((await resolveTrackCredits({ spotifyId: id, artists: [channel] })).artists.map((artist) => artist.name))
      .toEqual(['Primary', 'Guest']);
  });
  it('appends additional verified recording participants without replacing the primary credit', async () => {
    const additional = { id: 'ytartist_UCProducer~Producer', name: 'Producer' };
    jest.mocked(resolveTrackArtists).mockResolvedValue([additional]);
    expect((await resolveTrackCredits({ spotifyId: id })).artists).toEqual([primary, guest, additional]);
  });
  it('retains existing complete credits if Spotify or YouTube is unavailable', async () => {
    jest.mocked(fetchSpotifyTrackCredits).mockRejectedValue(new Error('Offline'));
    jest.mocked(resolveTrackArtists).mockRejectedValue(new Error('Offline'));
    expect(await resolveTrackCredits({ spotifyId: id, artists: [primary, guest] })).toEqual({ artists: [primary, guest] });
  });
  it('does not require a Spotify request for verified credits or native recordings', async () => {
    await resolveTrackCredits({ spotifyId: id, artistCreditsVersion: 2, artists: [primary, guest] });
    expect(fetchSpotifyTrackCredits).not.toHaveBeenCalled();
    expect((await resolveTrackCredits({ id: 'yt_abcdefghijk', artists: [primary, guest] })).artists)
      .toEqual([primary, { ...channel, spotifyId: guest.id }]);
    expect(fetchSpotifyTrackCredits).not.toHaveBeenCalled();
  });
  it('coalesces recovery for the same Spotify recording', async () => {
    await Promise.all([resolveTrackCredits({ spotifyId: id }), resolveTrackCredits({ spotifyId: id })]);
    expect(fetchSpotifyTrackCredits).toHaveBeenCalledTimes(1);
  });
  it('retains all participants in a long collaborative recording in source order', async () => {
    const credits = Array.from({ length: 14 }, (_, index) => ({ id: String(index).padStart(22, '0'), name: `Participant ${index}` }));
    jest.mocked(fetchSpotifyTrackCredits).mockResolvedValue(credits);
    expect((await resolveTrackCredits({ spotifyId: id })).artists.slice(0, credits.length)).toEqual(credits);
  });
  it('does not discard extra authenticated/imported Spotify credits absent on the public page', async () => {
    const extra = { id: 'd'.repeat(22), name: 'Extra participant' };
    expect((await resolveTrackCredits({ spotifyId: id, artists: [primary, guest, extra] })).artists)
      .toEqual([primary, { ...channel, spotifyId: guest.id }, extra]);
  });
});
