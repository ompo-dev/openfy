import * as React from 'react';
import { Href, usePathname, useRouter, useSegments } from 'expo-router';

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
  const pathname = usePathname();
  const section = getSectionFromSegments(segments);
  const detailIsOpen = isDetailRoute(segments);

  const openDetail = React.useCallback(
    (type: DetailRouteType, id: string, targetSection: AppSection = section) => {
      const href = getDetailHref(targetSection, type, id);
      if (pathname === href) {
        return;
      }

      // Keep the current detail in the tab stack so the native back gesture
      // returns to the artist/playlist that opened the next detail.
      if (detailIsOpen && targetSection === section) {
        router.push(href);
        return;
      }

      router.navigate(href, { dangerouslySingular: true });
    },
    [detailIsOpen, pathname, router, section]
  );

  return { openDetail, section };
};
