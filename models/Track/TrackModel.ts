export type TrackModel = {
  id: string;
  title: string;
  subtitle: string;
  imageURL?: string;
  albumName?: string;
  albumId?: string;
  albumArtists?: { id: string; name: string }[];
  trackNumber?: number;
  releaseType?: 'album' | 'single' | 'ep' | 'compilation' | 'release';
  youtubeVideoId?: string;
  youtubeUrl?: string;
  durationMs?: number;
  artists?: { id: string; name: string }[];
  isSaved?: boolean;
  isDownloaded?: boolean;
  isPlaying?: boolean;
  explicit?: boolean;
};
