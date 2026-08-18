/**
 * PlayerContext
 * Global state for audio player: current track, queue, playback state
 */

import * as React from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import {
  loadAndPlay,
  play,
  pause,
  seekTo,
  unload,
  PlayerState,
  resolveAudioUrl,
  downloadTrack,
} from '@services';
import { DownloadedTrack } from '@services';

export type PlayerTrack = {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  imageURL: string;
  localAudioPath?: string;
  streamUrl?: string;
  duration_ms: number;
};

type PlayerContextType = {
  currentTrack: PlayerTrack | null;
  queue: PlayerTrack[];
  playerState: PlayerState;
  isPlayerVisible: boolean;
  playTrack: (track: PlayerTrack) => Promise<void>;
  playDownloadedTrack: (track: DownloadedTrack) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekToPosition: (ms: number) => Promise<void>;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  addToQueue: (tracks: PlayerTrack[]) => void;
  clearQueue: () => void;
  closePlayer: () => Promise<void>;
};

const defaultPlayerState: PlayerState = {
  isLoaded: false,
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  isBuffering: false,
};

const PlayerContext = React.createContext<PlayerContextType>({
  currentTrack: null,
  queue: [],
  playerState: defaultPlayerState,
  isPlayerVisible: false,
  playTrack: async () => {},
  playDownloadedTrack: async () => {},
  togglePlayPause: async () => {},
  seekToPosition: async () => {},
  playNext: async () => {},
  playPrevious: async () => {},
  addToQueue: () => {},
  clearQueue: () => {},
  closePlayer: async () => {},
});

export const usePlayer = () => React.useContext(PlayerContext);

export const PlayerProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [currentTrack, setCurrentTrack] = React.useState<PlayerTrack | null>(null);
  const [queue, setQueue] = React.useState<PlayerTrack[]>([]);
  const [queueIndex, setQueueIndex] = React.useState(0);
  const [playerState, setPlayerState] = React.useState<PlayerState>(defaultPlayerState);
  const [isPlayerVisible, setIsPlayerVisible] = React.useState(false);

  const handleStatusUpdate = React.useCallback((state: PlayerState) => {
    setPlayerState(state);
  }, []);

  const playTrack = React.useCallback(
    async (track: PlayerTrack) => {
      let uri = track.localAudioPath || track.streamUrl;

      // 1. If local path is an m3u8 playlist file, local playback won't work: use live stream
      if (track.localAudioPath && track.localAudioPath.endsWith('.m3u8')) {
        uri = track.streamUrl || undefined;
      } else if (track.localAudioPath) {
        try {
          const info = await FileSystem.getInfoAsync(track.localAudioPath);
          if (!info.exists || (info.size && info.size < 5000)) {
            console.log('[PlayerContext] Local file empty or missing, will resolve stream');
            uri = track.streamUrl || undefined;
          }
        } catch {
          uri = track.streamUrl || undefined;
        }
      }

      // 2. If no valid URI, resolve on the fly
      if (!uri) {
        console.log('[PlayerContext] Resolving audio stream for:', track.title);
        const resolved = await resolveAudioUrl(
          track.title,
          track.artistName,
          track.spotifyId
        );
        if (resolved?.url) {
          uri = resolved.url;
          track.streamUrl = resolved.url;
        }
      }

      if (!uri) {
        console.warn('[PlayerContext] Could not obtain audio source for:', track.title);
        return;
      }

      setCurrentTrack(track);
      setIsPlayerVisible(true);

      console.log('[PlayerContext] Playing URI:', uri);
      const success = await loadAndPlay(uri, handleStatusUpdate);

      // Auto-cache: In background, download using the EXACT same resolved URI so streamed and downloaded audio are 100% identical
      if (track.spotifyId && !track.localAudioPath && uri) {
        const isMp3 = uri.includes('.mp3') || !uri.includes('.m4a');
        downloadTrack(
          {
            spotifyId: track.spotifyId,
            title: track.title,
            artistName: track.artistName,
            albumName: track.albumName,
            imageURL: track.imageURL,
            duration_ms: track.duration_ms,
          },
          uri,
          isMp3 ? 'mp3' : 'm4a'
        ).catch(() => {});
      }

      // If playing local path failed, retry with live stream resolution
      if (!success) {
        console.log('[PlayerContext] Retrying with stream fallback...');
        const resolved = await resolveAudioUrl(
          track.title,
          track.artistName,
          track.spotifyId
        );
        if (resolved?.url) {
          track.streamUrl = resolved.url;
          await loadAndPlay(resolved.url, handleStatusUpdate);
        }
      }
    },
    [handleStatusUpdate]
  );

  const playDownloadedTrack = React.useCallback(
    async (track: DownloadedTrack) => {
      console.log('[PlayerContext] Playing downloaded track:', track.title);
      const playerTrack: PlayerTrack = {
        spotifyId: track.spotifyId,
        title: track.title,
        artistName: track.artistName,
        albumName: track.albumName,
        imageURL: track.localImagePath || track.imageURL,
        localAudioPath: track.localAudioPath,
        streamUrl: track.audioUrl,
        duration_ms: track.duration_ms,
      };
      await playTrack(playerTrack);
    },
    [playTrack]
  );

  const togglePlayPause = React.useCallback(async () => {
    if (!playerState.isLoaded && currentTrack) {
      console.log('[PlayerContext] Sound not loaded, starting playback for:', currentTrack.title);
      await playTrack(currentTrack);
      return;
    }
    if (playerState.isPlaying) {
      await pause();
    } else {
      await play();
    }
  }, [playerState.isLoaded, playerState.isPlaying, currentTrack, playTrack]);

  const seekToPosition = React.useCallback(async (ms: number) => {
    await seekTo(ms);
  }, []);

  const playNext = React.useCallback(async () => {
    if (queue.length === 0) return;
    const nextIndex = (queueIndex + 1) % queue.length;
    setQueueIndex(nextIndex);
    await playTrack(queue[nextIndex]);
  }, [queue, queueIndex, playTrack]);

  const playPrevious = React.useCallback(async () => {
    if (queue.length === 0) return;
    const prevIndex = queueIndex > 0 ? queueIndex - 1 : queue.length - 1;
    setQueueIndex(prevIndex);
    await playTrack(queue[prevIndex]);
  }, [queue, queueIndex, playTrack]);

  const addToQueue = React.useCallback((tracks: PlayerTrack[]) => {
    setQueue((prev) => [...prev, ...tracks]);
  }, []);

  const clearQueue = React.useCallback(() => {
    setQueue([]);
    setQueueIndex(0);
  }, []);

  const closePlayer = React.useCallback(async () => {
    await unload();
    setCurrentTrack(null);
    setIsPlayerVisible(false);
    setPlayerState(defaultPlayerState);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        queue,
        playerState,
        isPlayerVisible,
        playTrack,
        playDownloadedTrack,
        togglePlayPause,
        seekToPosition,
        playNext,
        playPrevious,
        addToQueue,
        clearQueue,
        closePlayer,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};
