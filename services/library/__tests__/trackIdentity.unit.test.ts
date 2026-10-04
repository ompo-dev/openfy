import { isSameRecording } from '../trackIdentity';

const playing = { spotifyId: 'spotify-track', title: 'Tr\u00eas da Madruga',
  artistName: 'Yago Oproprio, Ro Rosa', duration_ms: 150000, youtubeVideoId: 'shared-video' };

describe('recording identity across catalogs', () => {
  it('recognizes an album row without changing the playing track identity', () => {
    expect(isSameRecording(playing, { id: 'youtube-track', title: 'Tres da Madruga',
      subtitle: 'Yago Oproprio', durationMs: 150010 })).toBe(true);
    expect(playing.spotifyId).toBe('spotify-track');
  });

  it('does not match another song in the same video', () => {
    expect(isSameRecording(playing, { ...playing, spotifyId: 'other-track', title: 'Vagabundo Nato' })).toBe(false);
  });

  it('does not match a different recording or artist', () => {
    expect(isSameRecording(playing, { ...playing, spotifyId: 'live', youtubeVideoId: 'live-video', duration_ms: 200000 })).toBe(false);
    expect(isSameRecording(playing, { title: playing.title, artistName: 'Outro artista' })).toBe(false);
  });

  it('requires an actual identity and accepts the exact playing ID', () => {
    expect(isSameRecording(null, playing)).toBe(false);
    expect(isSameRecording({ title: 'Song' }, { title: 'Song' })).toBe(false);
    expect(isSameRecording(playing, { id: playing.spotifyId, title: playing.title })).toBe(true);
  });
});
