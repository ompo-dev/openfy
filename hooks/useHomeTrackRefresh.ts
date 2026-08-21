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
    refreshHomeTracks(tracksRef.current).then((nextTracks) => {
      if (active) setRefreshedTracks(nextTracks);
    });
    return () => {
      active = false;
    };
  }, [signature]);

  return refreshedTracks;
};
