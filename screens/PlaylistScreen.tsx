import * as React from 'react';
import { View } from 'react-native';
import { Href, useRouter, useSegments } from 'expo-router';

import { CollectionDetail, LocalPlaylist } from '@components';
import { PlaylistModel, TrackModel } from '@models';
import { checkSavedTracks, getPlaylist, getPlaylistItems } from '@api';
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
  const router = useRouter();
  const segments = useSegments();
  const [playlist, setPlaylist] = React.useState<PlaylistModel | null>(null);
  const [tracks, setTracks] = React.useState<TrackModel[]>([]);
  const offsetRef = React.useRef(0);
  const tracksRef = React.useRef<TrackModel[]>([]);
  const loadingPromiseRef = React.useRef<Promise<void> | null>(null);

  const loadTrackPage = React.useCallback(async (targetPlaylist: PlaylistModel) => {
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
      offsetRef.current = targetPlaylist.tracks.total;
      console.error('Failed to get playlist tracks:', error);
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
    offsetRef.current = 0;
    tracksRef.current = [];
    setPlaylist(null);
    setTracks([]);

    void getPlaylist(playlistId)
      .then((data) => {
        if (!active) return;
        setPlaylist(data);
        void loadTrackPage(data);
      })
      .catch((error) => {
        if (active) setPlaylist(null);
        console.error('Failed to get playlist data:', error);
      });

    return () => {
      active = false;
    };
  }, [loadTrackPage, playlistId]);

  const handleArtistPress = React.useCallback(
    (artistId: string) => {
      const section = segments.join('/').includes('library') ? 'library' : 'home';
      router.push(`/(tabs)/${section}/artist/${artistId}` as Href);
    },
    [router, segments]
  );

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
      onArtistPress={handleArtistPress}
      onEndReached={() => void loadTrackPage(playlist)}
      resolveTracksForPlayback={() => loadAllTrackPages(playlist)}
    />
  );
};
