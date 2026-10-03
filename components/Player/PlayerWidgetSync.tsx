import * as React from 'react';
import { Platform } from 'react-native';

import { usePlayer } from '@context';
import { log } from '@utils';

type LyricLine = { text: string; startTimeMs: number; endTimeMs: number };

export const buildPlayerWidgetSnapshot = (input: {
  title: string;
  artists: string;
  artworkURL: string;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  lyricLines: string[];
  lyricTimeline: string;
  updatedAt?: number;
}) => ({
  title: input.title,
  artists: input.artists,
  artworkURL: input.artworkURL,
  isPlaying: input.isPlaying ? 1 : 0,
  positionMs: Math.max(0, input.positionMs),
  durationMs: Math.max(1, input.durationMs),
  updatedAt: input.updatedAt ?? Date.now() / 1000,
  lyricLine1: input.lyricLines[0] || '',
  lyricLine2: input.lyricLines[1] || '',
  lyricLine3: input.lyricLines[2] || '',
  lyricLine4: input.lyricLines[3] || '',
  lyricTimeline: input.lyricTimeline,
});

const getCurrentLyricLines = (
  segments: LyricLine[],
  plainLyrics: string | undefined,
  positionMs: number
) => {
  if (!segments.length) {
    return (plainLyrics || '').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 4);
  }
  const activeIndex = segments.findIndex(
    (line) => positionMs >= line.startTimeMs && positionMs < line.endTimeMs
  );
  const start = Math.max(0, (activeIndex < 0 ? 0 : activeIndex) - 1);
  return segments.slice(start, start + 4).map((line) => line.text).filter(Boolean);
};

export const PlayerWidgetSync = () => {
  const { currentTrack, playerState, lyricsData } = usePlayer();
  const positionRef = React.useRef(playerState.positionMs);
  positionRef.current = playerState.positionMs;

  const lyricTimeline = React.useMemo(() => JSON.stringify(
    (lyricsData?.segments || []).map((line) => ({
      text: line.text,
      startTimeMs: line.startTimeMs,
      endTimeMs: line.endTimeMs,
    }))
  ), [lyricsData?.segments]);
  const lyricLines = React.useMemo(
    () => getCurrentLyricLines([], lyricsData?.plainLyrics, 0),
    [lyricsData?.plainLyrics]
  );
  const durationMs = playerState.durationMs || currentTrack?.duration_ms || 1;
  const snapshot = currentTrack
    ? buildPlayerWidgetSnapshot({
        title: currentTrack.title,
        artists: currentTrack.artistName,
        artworkURL: currentTrack.imageURL || '',
        isPlaying: playerState.isPlaying,
        positionMs: positionRef.current,
        durationMs,
        lyricLines,
        lyricTimeline,
      })
    : null;
  const snapshotRef = React.useRef(snapshot);
  snapshotRef.current = snapshot;
  const signature = React.useMemo(() => JSON.stringify({
    id: currentTrack?.spotifyId,
    title: currentTrack?.title,
    artists: currentTrack?.artistName,
    artworkURL: currentTrack?.imageURL,
    durationMs,
    isPlaying: playerState.isPlaying,
    lyricTimeline,
    lyricLines,
  }), [currentTrack, durationMs, playerState.isPlaying, lyricTimeline, lyricLines]);

  React.useEffect(() => {
    if (Platform.OS !== 'ios') return;
    try {
      // Load lazily so Android and Expo Go do not require the iOS native module.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ExtensionStorage } = require('@bacons/apple-targets') as typeof import('@bacons/apple-targets');
      const storage = new ExtensionStorage('group.com.openfy.app');
      const activeSnapshot = snapshotRef.current;
      if (!activeSnapshot) {
        storage.set('openfyPlayerSnapshot', undefined);
        ExtensionStorage.reloadWidget('com.openfy.app.player-widget');
        return;
      }
      storage.set('openfyPlayerSnapshot', activeSnapshot);
      ExtensionStorage.reloadWidget('com.openfy.app.player-widget');
      log.player('widget snapshot updated', {
        trackId: currentTrack?.spotifyId,
        playing: activeSnapshot.isPlaying === 1,
        lyricLineCount: [
          activeSnapshot.lyricLine1,
          activeSnapshot.lyricLine2,
          activeSnapshot.lyricLine3,
          activeSnapshot.lyricLine4,
        ].filter(Boolean).length,
      });
    } catch (error) {
      log.error('widget snapshot failed', { error });
    }
  }, [currentTrack, lyricLines, playerState.durationMs, playerState.isPlaying, signature]);

  return null;
};
