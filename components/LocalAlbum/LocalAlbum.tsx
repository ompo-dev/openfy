import * as React from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import {
  getDownloadedTracks,
  groupLocalAlbums,
  type LocalAlbumCollection,
} from '@services';
import { CollectionDetail } from '../CollectionDetail';

export const LocalAlbum = ({ albumId }: { albumId: string }) => {
  const [album, setAlbum] = React.useState<LocalAlbumCollection | null>(null);

  const loadAlbum = React.useCallback(async () => {
    const tracks = await getDownloadedTracks();
    setAlbum(groupLocalAlbums(tracks).find((candidate) => candidate.id === albumId) || null);
  }, [albumId]);

  useFocusEffect(
    React.useCallback(() => {
      void loadAlbum();
    }, [loadAlbum])
  );

  if (!album) return <View style={{ flex: 1, backgroundColor: '#101010' }} />;

  return (
    <CollectionDetail
      kind="album"
      collectionId={album.id}
      title={album.title}
      imageURL={album.imageURL}
      metadata={`${album.subtitle} • ${album.tracks.length} ${
        album.tracks.length === 1 ? 'música' : 'músicas'
      }`}
      trackCount={album.tracks.length}
      tracks={album.tracks.map((track) => ({
        id: track.spotifyId,
        title: track.title,
        subtitle: track.artistName,
        albumName: track.albumName,
        imageURL: track.localImagePath || track.imageURL,
        durationMs: track.duration_ms,
        isDownloaded: true,
        localAudioPath: track.localAudioPath,
      }))}
    />
  );
};
