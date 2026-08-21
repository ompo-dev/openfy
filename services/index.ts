export { parseSpotifyLink, isValidSpotifyLink } from './spotify/linkParser';
export type { ParsedSpotifyLink, SpotifyResourceType } from './spotify/linkParser';

export {
  resolveAudioUrl,
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
  getPendingDownloads,
  processPendingDownloads,
} from './download/downloadManager';
export type {
  DownloadedTrack,
  DownloadStatus,
  DownloadProgress,
  DownloadTrackInput,
  PendingDownload,
} from './download/downloadManager';

export {
  getLocalPlaylist,
  getLocalPlaylists,
  removeTrackFromLocalPlaylists,
  upsertLocalPlaylist,
} from './library/localPlaylistManager';
export type {
  LocalPlaylist,
  LocalPlaylistInput,
} from './library/localPlaylistManager';

export {
  BACKGROUND_DOWNLOAD_TASK,
  registerBackgroundDownloadTask,
} from './background/backgroundDownloads';

export {
  loadAndPlay,
  play,
  pause,
  seekTo,
  unload,
  getStatus,
  configureAudioSession,
  DEFAULT_STATE,
} from './audio/playerService';
export type { PlayerState } from './audio/playerService';

export {
  fetchLyrics,
  parseLrcToSegments,
  saveLyricsOffline,
  getOfflineLyrics,
} from './lyrics/lyricsService';
export type { LyricSegment, LyricsData } from './lyrics/lyricsService';

export {
  evaluateCandidateMatch,
  evaluateDurationMatch,
  alignLyricsWithAudio,
} from './canonical/canonicalMatcher';

export {
  recordInteraction,
  getUserProfile,
  getTopAffinityArtist,
  getContinueListening,
  getExplainableRecommendations,
  preWarmStream,
} from './recommendation/recommendationEngine';
export type { UserProfile, InteractionType } from './recommendation/recommendationEngine';
