export type HomeCardSize = 'large' | 'compact';

const COMPACT_CARD_SCALE = 0.7;

/** Keeps Home rails on two deliberate artwork scales instead of ad-hoc widths. */
export const getHomeRailCardSize = (width: number, size: HomeCardSize = 'large') => {
  const largeSize = Math.min(136, Math.max(108, (width - 52) / 2.75));
  return Math.round(size === 'compact' ? largeSize * COMPACT_CARD_SCALE : largeSize);
};

export const getHomeCardScale = (size: HomeCardSize = 'large') =>
  size === 'compact' ? COMPACT_CARD_SCALE : 1;
