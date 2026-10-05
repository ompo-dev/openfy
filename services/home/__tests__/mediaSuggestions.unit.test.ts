import { buildMediaSuggestions, parseSuggestedMediaTrack, toSuggestedMediaEntry } from '../mediaSuggestions';
import type { PlayerTrack } from '../../../stores/usePlayerStore';

const track = (id: string, title = id, overrides: Partial<PlayerTrack> = {}): PlayerTrack => ({
  spotifyId: id, title, artistName: 'Ebony', albumName: 'KM2', imageURL: 'https://images.example/album.jpg',
  duration_ms: 150_000, artists: [{ id: 'artist', name: 'Ebony' }], ...overrides,
});

describe('lock-screen media suggestions', () => {
  it('excludes the paused track and duplicates across providers, and bounds the list', () => {
    const current = track('playing', 'Disco', { youtubeVideoId: 'abcdefghijk' });
    const suggestions = buildMediaSuggestions(current, [current, track('same-title', 'DISCO'),
      track('same-video', 'Disco', { youtubeVideoId: 'abcdefghijk' }), track('one'), track('one'),
      track('two'), track('three'), track('four'), track('five')]);
    expect(suggestions.map((item) => item.spotifyId)).toEqual(['one', 'two', 'three', 'four']);
  });

  it('keeps different songs that share a two-song video', () => {
    const current = track('one', 'Três da Madruga', { youtubeVideoId: '9jqQYznGl-w' });
    const other = track('two', 'Vagabundo Nato', { youtubeVideoId: '9jqQYznGl-w' });
    expect(buildMediaSuggestions(current, [other])).toEqual([other]);
  });

  it('round trips playback metadata, including verified sources and offline artwork', () => {
    const source = track('segment', 'Três da Madruga', { localImagePath: 'file:///cover.jpg',
      localAudioPath: 'file:///track.m4a', streamUrl: 'https://audio.example/track.m4a',
      albumId: 'album', youtubeVideoId: 'abcdefghijk' });
    const entry = toSuggestedMediaEntry(source);
    expect(entry.artworkURL).toBe('file:///cover.jpg');
    expect(parseSuggestedMediaTrack(entry.trackJSON)).toEqual(source);
  });

  it('rejects invalid payloads instead of requesting broken playback', () => {
    for (const value of ['invalid', '{}', 'null', JSON.stringify(track('', 'Title')), JSON.stringify(track('id', 'Title', { duration_ms: -1 }))]) {
      expect(parseSuggestedMediaTrack(value)).toBeNull();
    }
  });
});
