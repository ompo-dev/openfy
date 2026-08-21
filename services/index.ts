export { parseSpotifyLink, isValidSpotifyLink } from './spotify/linkParser';
export type {
  ParsedSpotifyLink,
  SpotifyResourceType,
} from './spotify/linkParser';

export {
  resolveAudioUrl,
  getPlayableAudioUrl,
  resolveViaSoundCloud,
  resolveViaYouTubeTopic,
} from './audio/audioResolver';
export type { ResolvedAudio } from './audio/audioResolver';

export { refreshHomeTracks } from './home/homeTrackRefresh';
export type { HomeTrackSeed, RefreshedHomeTrack } from './home/homeTrackRefresh';

export {
  downloadTrack,
  downloadAudio,
  downloadCover,
  getDownloadedTracks,
  getDownloadedTrack,
  isTrackDownloaded,
  deleteDownloadedTrack,
  cancelDownload,
  ensureDirectories,
  getPendingDownloads,
  processPendingDownloads,
  queueDownloads,
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
  notifyDownloadResult,
  requestDownloadNotificationPermission,
} from './background/downloadNotifications';

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
  getLyricTimelineBlocks,
  getLyricGapRange,
  moveLyricGap,
  moveLyricSegment,
  normalizeLyricSegments,
  resizeLyricGapEnd,
  resizeLyricGapStart,
  resizeLyricSegmentEnd,
  resizeLyricSegmentStart,
} from './lyrics/lyricTimeline';
export type {
  LyricGapTarget,
  LyricTimelineBlock,
} from './lyrics/lyricTimeline';

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
export type {
  UserProfile,
  InteractionType,
} from './recommendation/recommendationEngine';
