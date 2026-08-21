export type TrackModel = {
  id: string;
  title: string;
  subtitle: string;
  imageURL?: string;
  albumName?: string;
  durationMs?: number;
  isSaved?: boolean;
  isDownloaded?: boolean;
  isPlaying?: boolean;
  explicit?: boolean;
};
