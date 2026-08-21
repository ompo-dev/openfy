export type TrackModel = {
  id: string;
  title: string;
  subtitle: string;
  imageURL?: string;
  albumName?: string;
  durationMs?: number;
  artists?: { id: string; name: string }[];
  isSaved?: boolean;
  isDownloaded?: boolean;
  isPlaying?: boolean;
  explicit?: boolean;
};
