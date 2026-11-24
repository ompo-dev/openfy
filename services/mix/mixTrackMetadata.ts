import type { CatalogTrackInput, LibraryTrack } from '../library/catalogLibrary';
import { getTrackYouTubeVideoId } from '../spotify/linkParser';

/** Keep source length stable for saved cuts, but use current library artwork and links. */
export const mergeMixTrack = (source: CatalogTrackInput, current?: LibraryTrack) => {
  const videoId = (current && getTrackYouTubeVideoId(current)) || getTrackYouTubeVideoId(source);
  return {
    ...source,
    ...current,
    duration_ms: source.duration_ms,
    imageURL: current?.imageURL || source.imageURL,
    explicit: current?.explicit ?? source.explicit,
    youtubeVideoId: videoId,
    youtubeUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : current?.youtubeUrl || source.youtubeUrl,
    audioUrl: current?.audioUrl || source.audioUrl,
    streamUrl: current?.streamUrl || source.streamUrl,
    localImagePath: current?.localImagePath,
    localAudioPath: current?.localAudioPath,
    isDownloaded: Boolean(current?.isDownloaded),
  };
};
