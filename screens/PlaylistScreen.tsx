import * as React from 'react';
import { View } from 'react-native';

import { CollectionDetail, LocalPlaylist } from '@components';
import { PlaylistModel, TrackModel } from '@models';
import {
  checkSavedTracks,
  getPlaylist,
  getPlaylistItems,
} from '@api';
import { formatCollectionMeta } from '@utils';

export type PlaylistScreenPropsType = {
  playlistId: string;
};

export const PlaylistScreen = ({ playlistId }: PlaylistScreenPropsType) =>
  playlistId.startsWith('local_') ? (
    <LocalPlaylist playlistId={playlistId} />
  ) : (
    <RemotePlaylistScreen playlistId={playlistId} />
  );

const RemotePlaylistScreen = ({ playlistId }: PlaylistScreenPropsType) => {
  const [playlist, setPlaylist] = React.useState<PlaylistModel | null>(null);
  const [tracks, setTracks] = React.useState<TrackModel[]>([]);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [refreshSequence, setRefreshSequence] = React.useState(0);
  const offsetRef = React.useRef(0);
  const tracksRef = React.useRef<TrackModel[]>([]);
  const loadingPromiseRef = React.useRef<Promise<void> | null>(null);
  const pageGenerationRef = React.useRef(0);
  const activePlaylistId = React.useRef(playlistId);
  const refresh = React.useCallback(() => {
    setIsRefreshing(true);
    setRefreshSequence((sequence) => sequence + 1);
  }, []);

  const loadTrackPage = React.useCallback(async (
    targetPlaylist: PlaylistModel,
    generation = pageGenerationRef.current
  ) => {
    if (offsetRef.current >= targetPlaylist.tracks.total) return;
    if (loadingPromiseRef.current) {
      await loadingPromiseRef.current;
      return;
    }

    const request = (async () => {
      try {
        const page = await getPlaylistItems({
          playlistId: targetPlaylist.id,
          limit: 50,
          offset: offsetRef.current,
        });
        const saved = await checkSavedTracks(page.map((track) => track.id)).catch(
          () => []
        );
        if (generation !== pageGenerationRef.current) return;
        offsetRef.current += 50;
        tracksRef.current = [
          ...tracksRef.current,
          ...page.map((track, index) => ({
            ...track,
            isSaved: saved[index] ?? false,
          })),
        ];
        setTracks(tracksRef.current);
      } catch (error) {
        if (generation === pageGenerationRef.current) {
          offsetRef.current = targetPlaylist.tracks.total;
          console.error('Failed to get playlist tracks:', error);
        }
      }
    })();

    loadingPromiseRef.current = request;
    try {
      await request;
    } finally {
      if (loadingPromiseRef.current === request) {
        loadingPromiseRef.current = null;
      }
    }
  }, []);

  const loadAllTrackPages = React.useCallback(
    async (targetPlaylist: PlaylistModel) => {
      while (offsetRef.current < targetPlaylist.tracks.total) {
        await loadTrackPage(targetPlaylist);
      }
      return tracksRef.current;
    },
    [loadTrackPage]
  );

  React.useEffect(() => {
    let active = true;
    const generation = ++pageGenerationRef.current;
    loadingPromiseRef.current = null;
    const playlistChanged = activePlaylistId.current !== playlistId;
    const refreshingExistingPlaylist = !playlistChanged && refreshSequence > 0;
    activePlaylistId.current = playlistId;
    if (!refreshingExistingPlaylist) {
      offsetRef.current = 0;
      tracksRef.current = [];
      setPlaylist(null);
      setTracks([]);
    }

    void getPlaylist(playlistId)
      .then(async (data) => {
        if (!active) return;
        if (refreshingExistingPlaylist) {
          offsetRef.current = 0;
          tracksRef.current = [];
        }
        setPlaylist(data);
        await loadTrackPage(data, generation);
      })
      .catch((error) => {
        if (active && !refreshingExistingPlaylist) setPlaylist(null);
        console.error('Failed to get playlist data:', error);
      })
      .finally(() => {
        if (active) setIsRefreshing(false);
      });

    return () => {
      active = false;
    };
  }, [loadTrackPage, playlistId, refreshSequence]);

  if (!playlist) return <View style={{ flex: 1, backgroundColor: '#101010' }} />;

  return (
    <CollectionDetail
      kind="playlist"
      collectionId={playlist.id}
      title={playlist.title}
      imageURL={playlist.imageURL}
      description={playlist.description}
      metadata={`${playlist.subtitle} • ${formatCollectionMeta({
        trackCount: playlist.tracks.total,
        totalDurationMs:
          offsetRef.current >= playlist.tracks.total
            ? tracks.reduce((total, track) => total + (track.durationMs || 0), 0)
            : 0,
      })}`}
      trackCount={playlist.tracks.total}
      totalDurationMs={
        offsetRef.current >= playlist.tracks.total
          ? tracks.reduce((total, track) => total + (track.durationMs || 0), 0)
          : 0
      }
      tracks={tracks}
      disableTrackArtistLinks
      onRefresh={refresh}
      refreshing={isRefreshing}
      onEndReached={() => void loadTrackPage(playlist)}
      resolveTracksForPlayback={() => loadAllTrackPages(playlist)}
    />
  );
};
