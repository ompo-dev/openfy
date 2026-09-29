const validDuration = (value?: number): number =>
  Number.isFinite(value) && (value || 0) > 0 ? Math.round(value!) : 0;

/**
 * Media containers occasionally expose a broken timeline (commonly exactly
 * twice the catalog duration). Prefer the canonical duration only when the
 * drift is too large to be ordinary encoder padding.
 */
export const reconcilePlaybackDurationMs = (
  reportedDurationMs?: number,
  canonicalDurationMs?: number
): number => {
  const reported = validDuration(reportedDurationMs);
  const canonical = validDuration(canonicalDurationMs);
  if (!canonical) return reported;
  if (!reported) return canonical;

  const toleranceMs = Math.max(3_000, canonical * 0.08);
  return Math.abs(reported - canonical) > toleranceMs ? canonical : reported;
};

export const clampPlaybackPositionMs = (
  positionMs: number,
  durationMs: number
): number => {
  const position = Number.isFinite(positionMs) ? Math.max(0, positionMs) : 0;
  return durationMs > 0 ? Math.min(position, durationMs) : position;
};
