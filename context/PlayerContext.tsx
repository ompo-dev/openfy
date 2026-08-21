/**
 * PlayerContext
 * Forwarding layer providing backward compatibility for components using `usePlayer()`,
 * backed by the high-performance Zustand `usePlayerStore`.
 */

import * as React from 'react';
import { usePlayerStore, PlayerTrack } from '../stores/usePlayerStore';
import { PlayerState } from '@services';

export { PlayerTrack } from '../stores/usePlayerStore';

export const usePlayer = () => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const queueSourceId = usePlayerStore((s) => s.queueSourceId);
  const playerState = usePlayerStore((s) => s.playerState);
  const isPlayerVisible = usePlayerStore((s) => s.isPlayerVisible);
  const lyricsData = usePlayerStore((s) => s.lyricsData);
  const isLoadingLyrics = usePlayerStore((s) => s.isLoadingLyrics);
  const isLoadingAudio = usePlayerStore((s) => s.isLoadingAudio);
  const isShuffle = usePlayerStore((s) => s.isShuffle);
  const repeatMode = usePlayerStore((s) => s.repeatMode);

  const playTrack = usePlayerStore((s) => s.playTrack);
  const playWithQueue = usePlayerStore((s) => s.playWithQueue);
  const playDownloadedTrack = usePlayerStore((s) => s.playDownloadedTrack);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const seekToPosition = usePlayerStore((s) => s.seekToPosition);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrevious = usePlayerStore((s) => s.playPrevious);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const clearQueue = usePlayerStore((s) => s.clearQueue);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const setRepeatMode = usePlayerStore((s) => s.setRepeatMode);
  const closePlayer = usePlayerStore((s) => s.closePlayer);
  const refreshLyrics = usePlayerStore((s) => s.refreshLyrics);

  return {
    currentTrack,
    queue,
    queueIndex,
    queueSourceId,
    playerState,
    isPlayerVisible,
    lyricsData,
    isLoadingLyrics,
    isLoadingAudio,
    isShuffle,
    repeatMode,
    playTrack,
    playWithQueue,
    playDownloadedTrack,
    togglePlayPause,
    seekToPosition,
    playNext,
    playPrevious,
    addToQueue,
    clearQueue,
    toggleShuffle,
    setRepeatMode,
    closePlayer,
    refreshLyrics,
  };
};

export const PlayerProvider = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};
