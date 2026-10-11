import { getPlaybackOrigin } from '../playbackOrigin';

it.each([
  ['album:album123:shuffle', { kind: 'album', id: 'album123' }],
  ['album:spotify:album123', { kind: 'album', id: 'local_album_spotify%3Aalbum123' }],
  ['album:MPREtest', { kind: 'album', id: 'ytalbum_MPREtest' }],
  ['playlist:home_mix_radio_sotam', { kind: 'playlist', id: 'home_mix_radio_sotam' }],
  ['playlist:local_spotify_test', { kind: 'playlist', id: 'local_spotify_test' }],
  ['artist:local_artist_sotam:featured', { kind: 'artist', id: 'local_artist_sotam' }],
  ['import:spotify:album:album123', { kind: 'album', id: 'local_album_spotify%3Aalbum123' }],
  ['import:youtube:playlist:PL123', { kind: 'playlist', id: 'local_youtube_PL123' }],
  ['home:recent', { kind: 'playlist', id: 'home_mix_recent' }],
  ['home:most-played', { kind: 'playlist', id: 'home_mix_most_played' }],
  ['library:songs', null], ['search:term', null], [null, null],
])('opens the source of %s or falls back to the queue', (source, expected) => {
  expect(getPlaybackOrigin(source)).toEqual(expected);
});
