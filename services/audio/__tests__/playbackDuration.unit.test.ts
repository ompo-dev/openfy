import {
  clampPlaybackPositionMs,
  reconcilePlaybackDurationMs,
} from '../playbackDuration';

describe('playback duration reconciliation', () => {
  it('uses canonical metadata when the media timeline is doubled', () => {
    expect(reconcilePlaybackDurationMs(539_570, 269_785)).toBe(269_785);
  });

  it('keeps small encoder differences from the real media timeline', () => {
    expect(reconcilePlaybackDurationMs(181_200, 180_000)).toBe(181_200);
  });

  it('falls back to whichever valid duration exists and clamps position', () => {
    expect(reconcilePlaybackDurationMs(0, 180_000)).toBe(180_000);
    expect(reconcilePlaybackDurationMs(182_000, 0)).toBe(182_000);
    expect(clampPlaybackPositionMs(360_000, 180_000)).toBe(180_000);
  });
});
