import * as React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import {
  prefetchArtistData,
} from '@services';
import { useDetailNavigation } from '@hooks';
import { CollectionDetail } from '../CollectionDetail';
import { resolveLocalAlbum } from '../../services/library/resolveLocalAlbum';

export const LocalAlbum = ({ albumId }: { albumId: string }) => {
  const { openDetail } = useDetailNavigation();
  const [album, setAlbum] = React.useState<Awaited<ReturnType<typeof resolveLocalAlbum>> | null>(null);
  const [error, setError] = React.useState('');
  const loadedId = React.useRef('');

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      if (loadedId.current !== albumId) setAlbum(null);
      setError('');
      void resolveLocalAlbum(albumId).then((nextAlbum) => {
        if (!active) return;
        loadedId.current = albumId;
        setAlbum(nextAlbum);
        prefetchArtistData(nextAlbum.artists);
      }).catch(() => {
        if (active) setError('Não foi possível carregar este álbum.');
      });
      return () => { active = false; };
    }, [albumId])
  );

  if (!album) return <View style={{ flex: 1, backgroundColor: '#101010', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
    {!error ? <ActivityIndicator color="#1ED760" /> : null}
    <Text style={{ color: '#FFFFFF' }}>{error || 'Carregando álbum...'}</Text>
  </View>;

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
      title={album.name}
      imageURL={album.imageURL}
      metadata={`${album.partial ? 'Na biblioteca' : album.artists.map((artist) => artist.name).join(', ')} • ${album.tracks.length} ${
        album.tracks.length === 1 ? 'música' : 'músicas'
      }`}
      trackCount={album.tracks.length}
      disableTrackArtistLinks
      onArtistPress={handleArtistPress}
      artists={album.artists}
      tracks={album.tracks}
    />
  );
};
