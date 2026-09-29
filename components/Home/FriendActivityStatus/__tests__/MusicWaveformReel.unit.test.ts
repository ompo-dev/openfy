import { resolveWaveformGestureAction } from '../MusicWaveformReel';

describe('MusicWaveformReel gesture targeting', () => {
  it('targets both resize handles from the selector coordinate space', () => {
    expect(resolveWaveformGestureAction(101, 100, 120, true)).toBe(
      'resize-start'
    );
    expect(resolveWaveformGestureAction(219, 100, 120, true)).toBe(
      'resize-end'
    );
  });

  it('chooses the closest handle when hit areas overlap', () => {
    expect(resolveWaveformGestureAction(108, 100, 24, true)).toBe(
      'resize-start'
    );
    expect(resolveWaveformGestureAction(121, 100, 24, true)).toBe('resize-end');
  });

  it('keeps the center drag assigned to moving the selection', () => {
    expect(resolveWaveformGestureAction(160, 100, 120, true)).toBe('move');
    expect(resolveWaveformGestureAction(100, 100, 120, false)).toBe('move');
  });
});
