import * as React from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import {
  getDownloadedTracks,
  getLocalPlaylist,
  type DownloadedTrack,
  type LocalPlaylist as LocalPlaylistModel,
} from '@services';
import { CollectionDetail } from '../CollectionDetail';

export const LocalPlaylist = ({ playlistId }: { playlistId: string }) => {
  const [playlist, setPlaylist] = React.useState<LocalPlaylistModel | null>(null);
  const [tracks, setTracks] = React.useState<DownloadedTrack[]>([]);

  const loadPlaylist = React.useCallback(async () => {
    const [localPlaylist, downloaded] = await Promise.all([
      getLocalPlaylist(playlistId),
      getDownloadedTracks(),
    ]);
    setPlaylist(localPlaylist);
    const downloadedById = new Map(
      downloaded.map((track) => [track.spotifyId, track])
    );
    setTracks(
      localPlaylist
        ? localPlaylist.trackIds
            .map((trackId) => downloadedById.get(trackId))
            .filter((track): track is DownloadedTrack => Boolean(track))
        : []
    );
  }, [playlistId]);

  useFocusEffect(
    React.useCallback(() => {
      void loadPlaylist();
    }, [loadPlaylist])
  );

  if (!playlist) return <View style={{ flex: 1, backgroundColor: '#101010' }} />;

  const collectionTracks = tracks.map((track) => ({
    id: track.spotifyId,
    title: track.title,
    subtitle: track.artistName,
    albumName: track.albumName,
    imageURL: track.localImagePath || track.imageURL,
    durationMs: track.duration_ms,
    isDownloaded: true,
    localAudioPath: track.localAudioPath,
  }));
  const imageURL =
    collectionTracks[0]?.imageURL || playlist.coverImageURLs?.[0] || '';

  return (
    <CollectionDetail
      kind="playlist"
      collectionId={playlist.id}
      title={playlist.title}
      imageURL={imageURL}
      description={`Playlist importada do ${
        playlist.sourcePlatform === 'spotify' ? 'Spotify' : 'YouTube'
      }.`}
      createdAt={playlist.createdAt}
      trackCount={playlist.trackIds.length}
      tracks={collectionTracks}
    />
  );
};
