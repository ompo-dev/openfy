import * as React from 'react';

import {
  refreshHomeTracks,
  type HomeTrackSeed,
  type RefreshedHomeTrack,
} from '@services';

export const useHomeTrackRefresh = (tracks: HomeTrackSeed[]) => {
  const [refreshedTracks, setRefreshedTracks] = React.useState<
    Record<string, RefreshedHomeTrack>
  >({});
  const signature = tracks
    .map((track) => `${track.key}:${track.title}:${track.artistName}:${track.duration_ms}`)
    .join('|');
  const tracksRef = React.useRef(tracks);
  tracksRef.current = tracks;

  React.useEffect(() => {
    let active = true;
    const updateTrack = (track: HomeTrackSeed, refreshed: RefreshedHomeTrack) => {
      if (!active) return;
      setRefreshedTracks((current) =>
        tracksRef.current.reduce<Record<string, RefreshedHomeTrack>>(
          (next, candidate) =>
            candidate.title === track.title &&
            candidate.artistName === track.artistName &&
            candidate.duration_ms === track.duration_ms
              ? { ...next, [candidate.key]: refreshed }
              : next,
          current
        )
      );
    };
    refreshHomeTracks(tracksRef.current, updateTrack).then((nextTracks) => {
      if (active) setRefreshedTracks(nextTracks);
    });
    return () => {
      active = false;
    };
  }, [signature]);

  return refreshedTracks;
};
