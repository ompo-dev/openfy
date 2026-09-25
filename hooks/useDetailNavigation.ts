import * as React from 'react';
import { Href, useRouter, useSegments } from 'expo-router';

export type DetailRouteType =
  | 'album'
  | 'artist'
  | 'episode'
  | 'playlist'
  | 'show';

export type AppSection = 'home' | 'library';

const DETAIL_ROUTE_TYPES = new Set<DetailRouteType>([
  'album',
  'artist',
  'episode',
  'playlist',
  'show',
]);

export const getSectionFromSegments = (
  segments: readonly string[]
): AppSection => (segments.includes('library') ? 'library' : 'home');

export const isDetailRoute = (segments: readonly string[]): boolean =>
  segments.some((segment) => DETAIL_ROUTE_TYPES.has(segment as DetailRouteType));

export const getDetailHref = (
  section: AppSection,
  type: DetailRouteType,
  id: string
): Href => `/(tabs)/${section}/${type}/${id}` as Href;

/** Keeps at most one content detail mounted inside each tab stack. */
export const useDetailNavigation = () => {
  const router = useRouter();
  const segments = useSegments();
  const section = getSectionFromSegments(segments);
  const detailIsOpen = isDetailRoute(segments);

  const openDetail = React.useCallback(
    (type: DetailRouteType, id: string, targetSection: AppSection = section) => {
      const href = getDetailHref(targetSection, type, id);
      if (detailIsOpen) {
        router.replace(href);
        return;
      }

      router.navigate(href, { dangerouslySingular: true });
    },
    [detailIsOpen, router, section]
  );

  return { openDetail, section };
};
