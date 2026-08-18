export { parseSpotifyLink, isValidSpotifyLink } from './spotify/linkParser';
export type { ParsedSpotifyLink, SpotifyResourceType } from './spotify/linkParser';

export {
  resolveAudioUrl,
  resolveViaSpotyloader,
  resolveViaSoundCloud,
  resolveViaYouTubeTopic,
} from './audio/audioResolver';
export type { ResolvedAudio } from './audio/audioResolver';

export {
  downloadTrack,
  downloadAudio,
  downloadCover,
  getDownloadedTracks,
  getDownloadedTrack,
  isTrackDownloaded,
  deleteDownloadedTrack,
  ensureDirectories,
} from './download/downloadManager';
export type {
  DownloadedTrack,
  DownloadStatus,
  DownloadProgress,
} from './download/downloadManager';

export {
  loadAndPlay,
  play,
  pause,
  seekTo,
  unload,
  getStatus,
  configureAudioSession,
} from './audio/playerService';
export type { PlayerState } from './audio/playerService';

export {
  fetchLyrics,
  parseLrcToSegments,
  saveLyricsOffline,
  getOfflineLyrics,
} from './lyrics/lyricsService';
export type { LyricSegment, LyricsData } from './lyrics/lyricsService';
