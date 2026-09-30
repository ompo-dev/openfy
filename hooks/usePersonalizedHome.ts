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

const MIN_REFRESH_INDICATOR_MS = 350;

export const usePersonalizedHome = () => {
  const { libraryRevision } = useLibrarySelectedCategory();
  const { settings } = useAppSettings();
  const [home, setHome] = React.useState<PersonalizedHomeSnapshot>(
    EMPTY_PERSONALIZED_HOME
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [refreshSequence, setRefreshSequence] = React.useState(0);
  const requestKey = `${libraryRevision}:${refreshSequence}`;
  const latestRequestKey = React.useRef(requestKey);
  latestRequestKey.current = requestKey;
  const forceRefreshRef = React.useRef(false);
  const refreshStartedAt = React.useRef(0);
  const homeRef = React.useRef(home);
  homeRef.current = home;
  const generation = React.useRef(0);
  const refresh = React.useCallback(() => {
    refreshStartedAt.current = Date.now();
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
      forceRefreshRef.current = false;

      const publish = (snapshot: PersonalizedHomeSnapshot) => {
        if (
          !active ||
          request !== generation.current ||
          requestKeyForEffect !== latestRequestKey.current
        ) return;
        setHome(snapshot);
        setIsLoading(false);
      };

      void (async () => {
        const [tracks, playlists, profile] = await Promise.all([
          getLibraryTracks(),
          getLocalPlaylists(),
          getUserProfile(),
        ]);
        const build = (discoveries: PersonalizedHomeTrack[]) =>
          buildPersonalizedHome({
            allowExplicitRecommendations: settings.allowExplicitRecommendations,
            discoveries,
            personalized: settings.personalizedHome,
            playlists,
            profile,
            tracks,
          });
        const localSnapshot = build(
          settings.personalizedHome ? homeRef.current.discoveries : []
        );
        publish(localSnapshot);
        if (forceRefresh) {
          const remaining = MIN_REFRESH_INDICATOR_MS -
            (Date.now() - refreshStartedAt.current);
          if (remaining > 0) {
            await new Promise((resolve) => setTimeout(resolve, remaining));
          }
        }
        if (active && request === generation.current) setIsRefreshing(false);

        if (!settings.personalizedHome) return;
        const seeds = localSnapshot.seeds.length
          ? localSnapshot.seeds
          : [
              { name: 'músicas populares Brasil', score: 0, matchArtist: false },
              { name: 'lançamentos música brasileira', score: 0, matchArtist: false },
            ];
        void loadHomeDiscoveries(
          seeds,
          new Set(tracks.map((track) => track.spotifyId)),
          settings.allowExplicitRecommendations,
          forceRefresh
        ).then((discoveries) => {
          if (!active || request !== generation.current) return;
          publish(build(
            discoveries.length ? discoveries : localSnapshot.discoveries
          ));
        }).catch(() => {});
      })().catch(() => {
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
      settings.allowExplicitRecommendations,
      settings.personalizedHome,
    ])
  );

  return { home, isLoading, isRefreshing, refresh };
};
