import { parseYouTubeMusicArtistRoute, toYouTubeMusicArtistRouteId } from '../youtubeMusicClient';

describe('YouTube artist routes', () => {
  it.each([
    'UCebony',
    'ytartist_UCebony~Ebony',
    'ytartist_ytartist_UCebony~Ebony~Ebony',
    'ytartist_ytartist_UCebony%7EEbony~Ebony',
  ])('is idempotent and repairs persisted nested routes: %s', (id) => {
    expect(toYouTubeMusicArtistRouteId(id, 'Ebony')).toBe('ytartist_UCebony~Ebony');
    expect(parseYouTubeMusicArtistRoute(id).browseId).toBe('UCebony');
  });

  it.each(['ytartist_name_Black%20Alien', 'ytartist_name%5FBlack%20Alien', 'ytartist_~Black%20Alien'])('preserves name-only lookup: %s', (id) => {
    expect(parseYouTubeMusicArtistRoute(id)).toEqual({ browseId: '', routeName: 'Black Alien' });
  });
});
