import * as React from 'react';
import { useFocusEffect } from 'expo-router';

import { useAppSettings, useLibrarySelectedCategory } from '@context';
import {
  buildPersonalizedHome,
  EMPTY_PERSONALIZED_HOME,
  getLibraryTracks,
  getLocalPlaylists,
  getUserProfile,
  loadHomeDiscoveries,
  type PersonalizedHomeSnapshot,
  type PersonalizedHomeTrack,
} from '@services';
import type { LibraryTrack } from '../services/library/catalogLibrary';
import type { LocalPlaylist } from '../services/library/localPlaylistManager';
import type { UserProfile } from '../services/recommendation/recommendationEngine';
import { log } from '../utils/appLogger';

const MIN_REFRESH_INDICATOR_MS = 350;
const HOME_DATA_TTL_MS = 60_000;

type HomeSourceData = {
  tracks: LibraryTrack[];
  playlists: LocalPlaylist[];
  profile: UserProfile;
};

const sourceDataCache = new Map<number, {
  expiresAt: number;
  data?: HomeSourceData;
  promise?: Promise<HomeSourceData>;
}>();
const snapshotCache = new Map<string, {
  expiresAt: number;
  snapshot: PersonalizedHomeSnapshot;
}>();

const loadHomeSourceData = (revision: number, force: boolean) => {
  const cached = sourceDataCache.get(revision);
  if (cached?.promise) return cached.promise;
  if (!force && cached?.data && cached.expiresAt > Date.now()) {
    log.home('local home sources cache hit', { revision });
    return Promise.resolve(cached.data);
  }

  const finishLoad = log.time('home', 'local home sources load', { revision, force });
  const promise = Promise.all([
    getLibraryTracks(),
    getLocalPlaylists(),
    getUserProfile(),
  ]).then(([tracks, playlists, profile]) => {
    finishLoad({
      ok: true,
      tracks: tracks.length,
      playlists: playlists.length,
      recent: profile.recentlyPlayedTracks.length,
    });
    return { tracks, playlists, profile };
  }).catch((error) => {
    finishLoad({ ok: false, error: String(error) });
    throw error;
  });
  const entry = { expiresAt: Date.now() + HOME_DATA_TTL_MS, promise };
  sourceDataCache.set(revision, entry);
  while (sourceDataCache.size > 4) {
    const oldest = sourceDataCache.keys().next().value;
    if (oldest === undefined || oldest === revision) break;
    sourceDataCache.delete(oldest);
  }
  void promise.then(
    (data) => {
      if (sourceDataCache.get(revision) === entry) {
        sourceDataCache.set(revision, {
          expiresAt: Date.now() + HOME_DATA_TTL_MS,
          data,
        });
      }
    },
    () => {
      if (sourceDataCache.get(revision) === entry) sourceDataCache.delete(revision);
    }
  );
  return promise;
};

const cacheHomeSnapshot = (key: string, snapshot: PersonalizedHomeSnapshot) => {
  snapshotCache.set(key, {
    expiresAt: Date.now() + HOME_DATA_TTL_MS,
    snapshot,
  });
  while (snapshotCache.size > 8) {
    const oldest = snapshotCache.keys().next().value;
    if (!oldest || oldest === key) break;
    snapshotCache.delete(oldest);
  }
};

export const usePersonalizedHome = () => {
  const { libraryRevision } = useLibrarySelectedCategory();
  const { settings } = useAppSettings();
  const [home, setHome] = React.useState<PersonalizedHomeSnapshot>(
    EMPTY_PERSONALIZED_HOME
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [refreshSequence, setRefreshSequence] = React.useState(0);
  const snapshotKey = [
    libraryRevision,
    settings.personalizedHome ? 'personalized' : 'general',
    settings.allowExplicitRecommendations ? 'explicit' : 'clean',
  ].join(':');
  const requestKey = `${snapshotKey}:${refreshSequence}`;
  const latestRequestKey = React.useRef(requestKey);
  latestRequestKey.current = requestKey;
  const forceRefreshRef = React.useRef(false);
  const refreshStartedAt = React.useRef(0);
  const finishManualRefresh = React.useRef<((result?: unknown) => void) | null>(null);
  const homeRef = React.useRef(home);
  homeRef.current = home;
  const generation = React.useRef(0);
  const refresh = React.useCallback(() => {
    refreshStartedAt.current = Date.now();
    finishManualRefresh.current = log.time('home', 'pull to refresh');
    setIsRefreshing(true);
    forceRefreshRef.current = true;
    setRefreshSequence((sequence) => sequence + 1);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      const request = ++generation.current;
      const requestKeyForEffect = requestKey;
      const forceRefresh = forceRefreshRef.current;
      const refreshStartForEffect = forceRefresh ? refreshStartedAt.current : 0;
      const finishRefreshMetric = forceRefresh ? finishManualRefresh.current : null;
      forceRefreshRef.current = false;
      if (forceRefresh) finishManualRefresh.current = null;
      const cachedSnapshot = snapshotCache.get(snapshotKey);

      if (cachedSnapshot) {
        setHome(cachedSnapshot.snapshot);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }

      if (
        !forceRefresh &&
        cachedSnapshot &&
        cachedSnapshot.expiresAt > Date.now()
      ) {
        setIsRefreshing(false);
        return () => {
          active = false;
        };
      }

      const publish = (snapshot: PersonalizedHomeSnapshot) => {
        if (
          !active ||
          request !== generation.current ||
          requestKeyForEffect !== latestRequestKey.current
        ) return;
        cacheHomeSnapshot(snapshotKey, snapshot);
        setHome(snapshot);
        setIsLoading(false);
      };

      void (async () => {
        const { tracks, playlists, profile } = await loadHomeSourceData(
          libraryRevision,
          forceRefresh
        );
        const build = (discoveries: PersonalizedHomeTrack[]) =>
          buildPersonalizedHome({
            allowExplicitRecommendations: settings.allowExplicitRecommendations,
            discoveries,
            personalized: settings.personalizedHome,
            playlists,
            profile,
            tracks,
          });
        const finishLocalBuild = log.time('home', 'local recommendation snapshot build', {
          tracks: tracks.length,
          playlists: playlists.length,
        });
        const localSnapshot = build(
          settings.personalizedHome
            ? cachedSnapshot?.snapshot.discoveries || homeRef.current.discoveries
            : []
        );
        finishLocalBuild({
          ok: true,
          discoveries: localSnapshot.discoveries.length,
          artists: localSnapshot.artists.length,
        });
        publish(localSnapshot);
        if (!settings.personalizedHome) {
          if (forceRefresh) {
            const remaining = MIN_REFRESH_INDICATOR_MS -
              (Date.now() - refreshStartForEffect);
            if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
            finishRefreshMetric?.({ ok: true, tracks: tracks.length, recommendations: 0 });
          }
          if (active && request === generation.current) setIsRefreshing(false);
          return;
        }
        const seeds = localSnapshot.seeds.length
          ? localSnapshot.seeds
          : [
              { name: 'músicas populares Brasil', score: 0, matchArtist: false },
              { name: 'lançamentos música brasileira', score: 0, matchArtist: false },
            ];
        const finishDiscoveries = log.time('home', 'youtube recommendations load', {
          seedCount: seeds.length,
          savedTrackCount: tracks.length,
          forceRefresh,
        });
        let discoveries: PersonalizedHomeTrack[] = [];
        try {
          discoveries = await loadHomeDiscoveries(
            seeds,
            new Set(tracks.map((track) => track.spotifyId)),
            settings.allowExplicitRecommendations,
            forceRefresh
          );
          finishDiscoveries({ ok: true, tracks: discoveries.length });
          if (active && request === generation.current) {
            publish(build(
              discoveries.length ? discoveries : localSnapshot.discoveries
            ));
          }
        } catch (error) {
          finishDiscoveries({ ok: false, error: String(error) });
        }
        if (forceRefresh) {
          const remaining = MIN_REFRESH_INDICATOR_MS -
            (Date.now() - refreshStartForEffect);
          if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
          finishRefreshMetric?.({
            ok: true,
            tracks: tracks.length,
            recommendations: discoveries.length,
          });
        }
        if (active && request === generation.current) setIsRefreshing(false);
      })().catch((error) => {
        if (forceRefresh) finishRefreshMetric?.({ ok: false, error: String(error) });
        if (active && request === generation.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      });

      return () => {
        active = false;
      };
    }, [
      requestKey,
      snapshotKey,
      libraryRevision,
      settings.allowExplicitRecommendations,
      settings.personalizedHome,
    ])
  );

  return { home, isLoading, isRefreshing, refresh };
};
