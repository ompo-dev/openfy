import * as React from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import {
  getLibraryTracks,
  groupLocalAlbums,
  prefetchArtistData,
  type LocalAlbumCollection,
} from '@services';
import { useDetailNavigation } from '@hooks';
import { CollectionDetail } from '../CollectionDetail';

export const LocalAlbum = ({ albumId }: { albumId: string }) => {
  const { openDetail } = useDetailNavigation();
  const [album, setAlbum] = React.useState<LocalAlbumCollection | null>(null);

  const loadAlbum = React.useCallback(async () => {
    const tracks = await getLibraryTracks();
    const nextAlbum = groupLocalAlbums(tracks).find((candidate) => candidate.id === albumId) || null;
    setAlbum(nextAlbum);
    if (nextAlbum) {
      const artists = new Map<string, { id?: string; name: string }>();
      nextAlbum.tracks.forEach((track) => {
        const refs = track.artists?.length
          ? track.artists
          : [{ id: '', name: track.artistName }];
        refs.forEach((artist) => {
          if (artist.name && !artists.has(artist.id || artist.name.toLocaleLowerCase())) {
            artists.set(artist.id || artist.name.toLocaleLowerCase(), artist);
          }
        });
      });
      prefetchArtistData([...artists.values()]);
    }
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
      disableTrackArtistLinks
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
