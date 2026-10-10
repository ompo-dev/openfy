import * as React from 'react';

import { CollectionDetail, LocalPlaylist } from '@components';
import { PlaylistModel, TrackModel } from '@models';
import {
  checkSavedTracks,
  getPlaylist,
  getCachedPlaylist,
  getPlaylistItems,
} from '@api';
import { formatCollectionMeta } from '@utils';
import { TemporaryPlaylistScreen } from './TemporaryPlaylistScreen';
import { HOME_PLAYLIST_PREFIX } from '../services/home/temporaryPlaylists';
import { PendingCollectionDetail } from '../components/CollectionDetail/PendingCollectionDetail';

export type PlaylistScreenPropsType = {
  playlistId: string;
};

export const PlaylistScreen = ({ playlistId }: PlaylistScreenPropsType) =>
  playlistId.startsWith(HOME_PLAYLIST_PREFIX) ? (
    <TemporaryPlaylistScreen playlistId={playlistId} />
  ) : playlistId.startsWith('local_') ? (
    <LocalPlaylist key={playlistId} playlistId={playlistId} />
  ) : (
    <RemotePlaylistScreen key={playlistId} playlistId={playlistId} />
  );

const RemotePlaylistScreen = ({ playlistId }: PlaylistScreenPropsType) => {
  const [playlist, setPlaylist] = React.useState<PlaylistModel | null>(() => getCachedPlaylist(playlistId) || null);
  const [tracks, setTracks] = React.useState<TrackModel[]>([]);
  const [loadingTracks, setLoadingTracks] = React.useState(true);
  const [error, setError] = React.useState('');
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
      const limit = offsetRef.current === 0 ? 12 : 50;
      if (generation === pageGenerationRef.current) { setLoadingTracks(true); setError(''); }
      try {
        const page = await getPlaylistItems({
          playlistId: targetPlaylist.id,
          limit,
          offset: offsetRef.current,
        });
        if (generation !== pageGenerationRef.current) return;
        offsetRef.current = page.length ? offsetRef.current + limit : targetPlaylist.tracks.total;
        tracksRef.current = [
          ...tracksRef.current,
          ...page,
        ];
        setTracks(tracksRef.current);
        if (page.length) void checkSavedTracks(page.map((track) => track.id)).then((saved) => {
          if (generation !== pageGenerationRef.current) return;
          const savedById = new Map(page.map((track, index) => [track.id, saved[index]] as const));
          tracksRef.current = tracksRef.current.map((track) => savedById.has(track.id)
            ? { ...track, isSaved: savedById.get(track.id) ?? track.isSaved } : track);
          setTracks(tracksRef.current);
        }).catch(() => {});
      } catch (error) {
        if (generation === pageGenerationRef.current) {
          setError('Não foi possível carregar as músicas. Tente novamente.');
          console.error('Failed to get playlist tracks:', error);
        }
        throw error;
      } finally {
        if (generation === pageGenerationRef.current) setLoadingTracks(false);
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
      const generation = pageGenerationRef.current;
      while (offsetRef.current < targetPlaylist.tracks.total) {
        if (generation !== pageGenerationRef.current) throw new Error('Playlist changed');
        await loadTrackPage(targetPlaylist, generation);
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
      setPlaylist(getCachedPlaylist(playlistId) || null);
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
        if (active) { setError('Não foi possível carregar esta playlist.'); setLoadingTracks(false); }
        console.error('Failed to get playlist data:', error);
      })
      .finally(() => {
        if (active) setIsRefreshing(false);
      });

    return () => {
      active = false;
      if (pageGenerationRef.current === generation) pageGenerationRef.current++;
    };
  }, [loadTrackPage, playlistId, refreshSequence]);

  if (!playlist) return <PendingCollectionDetail kind="playlist" collectionId={playlistId} error={error} onRetry={refresh}
    resolveTracksForPlayback={() => getPlaylist(playlistId).then(loadAllTrackPages)} />;

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
      loadingTracks={loadingTracks}
      loadingError={error}
      disableTrackArtistLinks
      onRefresh={refresh}
      refreshing={isRefreshing}
      onEndReached={() => void loadTrackPage(playlist).catch(() => {})}
      resolveTracksForPlayback={() => loadAllTrackPages(playlist)}
    />
  );
};
