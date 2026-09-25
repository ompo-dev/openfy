import * as React from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import {
  getLibraryTracks,
  groupLocalAlbums,
  type LocalAlbumCollection,
} from '@services';
import { useDetailNavigation } from '@hooks';
import { CollectionDetail } from '../CollectionDetail';

export const LocalAlbum = ({ albumId }: { albumId: string }) => {
  const { openDetail } = useDetailNavigation();
  const [album, setAlbum] = React.useState<LocalAlbumCollection | null>(null);

  const loadAlbum = React.useCallback(async () => {
    const tracks = await getLibraryTracks();
    setAlbum(groupLocalAlbums(tracks).find((candidate) => candidate.id === albumId) || null);
  }, [albumId]);

  useFocusEffect(
    React.useCallback(() => {
      void loadAlbum();
    }, [loadAlbum])
  );

  if (!album) return <View style={{ flex: 1, backgroundColor: '#101010' }} />;

  const handleArtistPress = (artistId: string, artistName: string) => {
    const targetArtistId = artistId
      ? artistId
      : `local_artist_${encodeURIComponent(artistName)}`;
    openDetail('artist', targetArtistId, 'library');
  };

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
      onArtistPress={handleArtistPress}
      tracks={album.tracks.map((track) => ({
        ...track,
        id: track.spotifyId,
        title: track.title,
        subtitle: track.artistName,
        albumName: track.albumName,
        imageURL: track.localImagePath || track.imageURL,
        durationMs: track.duration_ms,
        isDownloaded: track.isDownloaded,
        localAudioPath: track.localAudioPath,
      }))}
    />
  );
};
