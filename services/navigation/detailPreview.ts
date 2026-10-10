import type { TrackModel } from '@models';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';

export type DetailPreview = {
  title: string;
  imageURL?: string;
  imageURLs?: string[];
  subtitle?: string;
  artists?: { id: string; name: string; imageURL?: string }[];
  tracks?: TrackModel[];
  trackCount?: number;
};
type PreviewType = 'album' | 'artist' | 'playlist';
const previews = createAsyncResourceCache<DetailPreview>({ name: 'detail preview', maxEntries: 100 });

/** Reuse the visible card's real metadata while the rest of its page is loading. */
export function rememberDetailPreview(type: PreviewType, id: string, preview: DetailPreview) {
  if (!id || !preview.title) return;
  const key = `${type}:${id}`;
  const current = previews.peek(key);
  previews.set(key, { ...current, ...preview, imageURL: preview.imageURL || current?.imageURL }, 30 * 60_000);
}

export const getDetailPreview = (type: PreviewType, id: string) => previews.peek(`${type}:${id}`);
