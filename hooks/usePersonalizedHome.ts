import * as React from 'react';
import { useFocusEffect } from 'expo-router';

import { useAppSettings, useLibrarySelectedCategory } from '@context';
import {
  buildPersonalizedHome,
  EMPTY_PERSONALIZED_HOME,
  getCachedArtistImage,
  getLibraryTracks,
  getLocalPlaylists,
  getUserProfile,
  loadHomeDiscoveries,
  type PersonalizedHomeSnapshot,
  type PersonalizedHomeTrack,
} from '@services';
import { getSpotifyArtistImage } from '../services/metadata/spotifyMetadata';

export const usePersonalizedHome = () => {
  const { libraryRevision } = useLibrarySelectedCategory();
  const { settings } = useAppSettings();
  const [home, setHome] = React.useState<PersonalizedHomeSnapshot>(
    EMPTY_PERSONALIZED_HOME
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const generation = React.useRef(0);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      const request = ++generation.current;

      const publish = (snapshot: PersonalizedHomeSnapshot) => {
        if (!active || request !== generation.current) return;
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
        const localSnapshot = build([]);
        publish(localSnapshot);

        const artistImages = Promise.all(
          localSnapshot.artists.map(async (artist) => {
            if (!artist.spotifyArtistId) return artist;
            const imageURL = await getCachedArtistImage(artist.id, () =>
              getSpotifyArtistImage(artist.spotifyArtistId!)
            );
            return imageURL ? { ...artist, imageURL } : artist;
          })
        );
        const discoveries = settings.personalizedHome
          ? loadHomeDiscoveries(
              localSnapshot.seeds,
              new Set(tracks.map((track) => track.spotifyId)),
              settings.allowExplicitRecommendations
            )
          : Promise.resolve([]);
        const [resolvedArtists, resolvedDiscoveries] = await Promise.all([
          artistImages,
          discoveries,
        ]);
        const enriched = build(resolvedDiscoveries);
        publish({ ...enriched, artists: resolvedArtists });
      })().catch(() => {
        if (active && request === generation.current) setIsLoading(false);
      });

      return () => {
        active = false;
      };
    }, [
      libraryRevision,
      settings.allowExplicitRecommendations,
      settings.personalizedHome,
    ])
  );

  return { home, isLoading };
};
