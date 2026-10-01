import { buildPlayerWidgetSnapshot } from '../PlayerWidgetSync';

describe('buildPlayerWidgetSnapshot', () => {
  it('serializes safe display data and four lyric lines for the iOS widget', () => {
    expect(buildPlayerWidgetSnapshot({
      title: 'Tarôs',
      artists: 'Pedro Qualy · Sotam',
      artworkURL: 'https://images.example/cover.jpg',
      isPlaying: true,
      positionMs: 1200,
      durationMs: 180000,
      lyricLines: ['linha 1', 'linha 2'],
      lyricTimeline: '[{"text":"linha 1","startTimeMs":0,"endTimeMs":1000}]',
      updatedAt: 42,
    })).toEqual({
      title: 'Tarôs',
      artists: 'Pedro Qualy · Sotam',
      artworkURL: 'https://images.example/cover.jpg',
      isPlaying: 1,
      positionMs: 1200,
      durationMs: 180000,
      updatedAt: 42,
      lyricLine1: 'linha 1',
      lyricLine2: 'linha 2',
      lyricLine3: '',
      lyricLine4: '',
      lyricTimeline: '[{"text":"linha 1","startTimeMs":0,"endTimeMs":1000}]',
    });
  });

  it('normalizes invalid time values before they reach WidgetKit', () => {
    const snapshot = buildPlayerWidgetSnapshot({
      title: 'No title', artists: '', artworkURL: '', isPlaying: false,
      positionMs: -5, durationMs: 0, lyricLines: [], lyricTimeline: '[]', updatedAt: 1,
    });
    expect(snapshot.positionMs).toBe(0);
    expect(snapshot.durationMs).toBe(1);
    expect(snapshot.isPlaying).toBe(0);
  });
});
