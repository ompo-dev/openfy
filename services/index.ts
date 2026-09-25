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

export { refreshHomeTracks } from './home/homeTrackRefresh';
export type { HomeTrackSeed, RefreshedHomeTrack } from './home/homeTrackRefresh';
export {
  buildPersonalizedHome,
  buildRecommendationSeeds,
  clearHomeDiscoveryCache,
  EMPTY_PERSONALIZED_HOME,
  libraryTrackToHomeTrack,
  loadHomeDiscoveries,
} from './home/personalizedHome';
export type {
  PersonalizedHomeSnapshot,
  PersonalizedHomeArtist,
  PersonalizedHomeTrack,
  RecommendationSeed,
} from './home/personalizedHome';

export {
  downloadTrack,
  downloadAudio,
  downloadCover,
  getDownloadedTracks,
  repairDownloadedTrackMetadata,
  getDownloadedTrack,
  isTrackDownloaded,
  deleteDownloadedTrack,
  deleteAllDownloadedTracks,
  cancelDownload,
  ensureDirectories,
  getDownloadStorageInfo,
  getPendingDownloads,
  processPendingDownloads,
  queueDownloads,
} from './download/downloadManager';
export {
  ensurePlaybackDiagnostics,
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
  DownloadStorageInfo,
  DownloadStorageTrack,
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

export {
  getCatalogTracks,
  getLibraryTracks,
  removeCatalogTrack,
  removeCatalogTracks,
  toDownloadTrackInput,
  upsertCatalogTracks,
} from './library/catalogLibrary';
export type {
  CatalogSourcePlatform,
  CatalogTrack,
  CatalogTrackInput,
  LibraryTrack,
} from './library/catalogLibrary';

export { getCachedArtistImage } from './library/artistImageCache';

export {
  getLocalAlbumId,
  getPrimaryTrackArtist,
  groupLocalAlbums,
  groupLocalArtists,
  isTrackParticipantArtist,
  isTrackPrimaryArtist,
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
  beginTrackChange,
  play,
  pause,
  seekTo,
  unload,
  getStatus,
  fadeOutCurrent,
  restoreCurrentVolume,
  preloadAudio,
  releasePreloadedAudio,
  releaseAllPreloadedAudio,
  configureAudioSession,
  setRemotePlaybackHandlers,
  getAudioDiagnosticsSnapshot,
  recordAudioDiagnostic,
  DEFAULT_STATE,
} from './audio/playerService';
export type {
  AudioDiagnosticEvent,
  PlayerState,
  AudioSourceInput,
  RemotePlaybackHandlers,
} from './audio/playerService';

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
  clearUserProfile,
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

export {
  DEFAULT_APP_SETTINGS,
  getAppSettings,
  getCachedAppSettings,
  resetAppSettings,
  subscribeAppSettings,
  updateAppSettings,
} from './settings/appSettings';
export type { AppSettings } from './settings/appSettings';
