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
  // Some containers expose a duplicated timeline, while repaired/downloaded
  // files can carry catalog metadata that is the duplicated value. In both
  // directions, the shorter trustworthy timeline prevents silent tails.
  if (ratio >= 1.8 && ratio <= 2.2) return canonical;
  if (ratio >= 0.45 && ratio <= 0.56) return reported;
  return reported;
};

export const clampPlaybackPositionMs = (
  positionMs: number,
  durationMs: number
): number => {
  const position = Number.isFinite(positionMs) ? Math.max(0, positionMs) : 0;
  return durationMs > 0 ? Math.min(position, durationMs) : position;
};
