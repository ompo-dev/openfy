const validDuration = (value?: number): number =>
  Number.isFinite(value) && (value || 0) > 0 ? Math.round(value!) : 0;

/**
 * Media containers occasionally expose a duplicated timeline, commonly at
 * exactly twice the catalog duration. Do not replace valid stream durations
 * merely because a YouTube match differs from the catalog recording.
 */
export const reconcilePlaybackDurationMs = (
  reportedDurationMs?: number,
  canonicalDurationMs?: number
): number => {
  const reported = validDuration(reportedDurationMs);
  const canonical = validDuration(canonicalDurationMs);
  if (!canonical) return reported;
  if (!reported) return canonical;

  const ratio = reported / canonical;
  return ratio >= 1.8 && ratio <= 2.2 ? canonical : reported;
};

export const clampPlaybackPositionMs = (
  positionMs: number,
  durationMs: number
): number => {
  const position = Number.isFinite(positionMs) ? Math.max(0, positionMs) : 0;
  return durationMs > 0 ? Math.min(position, durationMs) : position;
};
