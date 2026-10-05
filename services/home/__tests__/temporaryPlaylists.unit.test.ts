import { EMPTY_PERSONALIZED_HOME, type PersonalizedHomeTrack } from '../personalizedHome';
import { getHomePlaylist, homeRadioPlaylistId, publishHomePlaylists, subscribeHomePlaylists } from '../temporaryPlaylists';

const song = { id: 'one', spotifyId: 'one', title: 'Disco', artistName: 'Ebony', imageURL: 'cover' } as PersonalizedHomeTrack;
describe('temporary home playlists', () => {
  it('replaces contents when listening history changes and notifies mounted playlist pages', () => {
    const changed = jest.fn();
    const unsubscribe = subscribeHomePlaylists(changed);
    publishHomePlaylists({ ...EMPTY_PERSONALIZED_HOME, continueListening: [song] });
    const original = getHomePlaylist('home_mix_recent');
    publishHomePlaylists({ ...EMPTY_PERSONALIZED_HOME, continueListening: [{ ...song, spotifyId: 'two' }] });
    expect(getHomePlaylist('home_mix_recent')).not.toBe(original);
    expect(getHomePlaylist('home_mix_recent')?.tracks.map((track) => track.spotifyId)).toEqual(['two']);
    expect(changed).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('keeps radio covers/metadata and routing keys safe for accented and multi-word artist names', () => {
    const name = 'Baco Exu do Blues / ÉoDan';
    const id = homeRadioPlaylistId(name);
    expect(decodeURIComponent(id)).toBe(id);
    expect(id).not.toContain('/');
    publishHomePlaylists({ ...EMPTY_PERSONALIZED_HOME, seeds: [{ name, score: 1 }], similarTracks: [song] });
    expect(getHomePlaylist(id)).toMatchObject({ title: `Rádio de ${name}`, tracks: [song] });
  });

  it('bounds session radio collections while retaining the core playlists', () => {
    for (let index = 0; index < 20; index++) publishHomePlaylists({ ...EMPTY_PERSONALIZED_HOME,
      seeds: [{ name: `Artist ${index}`, score: 1 }], similarTracks: [song] });
    expect(getHomePlaylist(homeRadioPlaylistId('Artist 0'))).toBeUndefined();
    expect(getHomePlaylist('home_mix_recent')).toBeDefined();
    expect(getHomePlaylist(homeRadioPlaylistId('Artist 19'))).toBeDefined();
  });
});
