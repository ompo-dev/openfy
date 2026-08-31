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
export {
  resolveDirectYouTubeAudio,
  resolveDirectYouTubeTrack,
  reportDirectYouTubeStreamRefusal,
  getDirectYouTubeMediaHeaders,
  getAudioSourceWithHeaders,
} from './audio/directYouTubeResolver';
export type {
  DirectYouTubeAudio,
  DirectYouTubeTrack,
} from './audio/directYouTubeResolver';

export type {
  MediaReference,
  YouTubeStreamDescriptor,
  StreamResolveResult,
} from './audio/mediaReference';
export {
  resolveYouTubeStream,
  reportStreamRefusal,
  getMediaHeaders,
} from './audio/youtubeStreamResolver';
export {
  parseYouTubeVideoId,
  resolveSpotifyTrackVideoId,
} from './audio/catalogResolver';
export type { CatalogResolveResult } from './audio/catalogResolver';
export {
  getCatalogMapping,
  setCatalogMapping,
  invalidateCatalogMapping,
} from './audio/catalogMappingCache';
export type { CatalogMapping } from './audio/catalogMappingCache';
export { getPOToken, invalidatePOToken } from './audio/poTokenProvider';
export type { POTokenContext } from './audio/poTokenProvider';

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
export {
  formatDownloadDiagnostics,
  getDownloadDiagnostics,
} from './download/downloadDiagnostics';
export type {
  DownloadDiagnostic,
  DownloadDiagnosticEvent,
} from './download/downloadDiagnostics';
export type {
  DownloadedTrack,
  DownloadStatus,
  DownloadProgress,
  DownloadTrackInput,
  PendingDownload,
} from './download/downloadManager';

export {
  deleteLocalPlaylist,
  getLocalPlaylist,
  getLocalPlaylists,
  removeTrackFromLocalPlaylists,
  upsertLocalPlaylist,
} from './library/localPlaylistManager';
export type {
  LocalPlaylist,
  LocalPlaylistInput,
} from './library/localPlaylistManager';

export { getCachedArtistImage } from './library/artistImageCache';

export {
  getLocalAlbumId,
  groupLocalAlbums,
  groupLocalArtists,
} from './library/localCollections';
export type {
  LocalAlbumCollection,
  LocalArtistCollection,
} from './library/localCollections';

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
  fadeOutCurrent,
  restoreCurrentVolume,
  preloadAudio,
  releasePreloadedAudio,
  configureAudioSession,
  DEFAULT_STATE,
} from './audio/playerService';
export type { PlayerState, AudioSourceInput } from './audio/playerService';

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
