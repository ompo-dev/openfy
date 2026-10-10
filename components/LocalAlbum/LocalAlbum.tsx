import * as React from 'react';
import { useFocusEffect } from 'expo-router';

import {
  prefetchArtistData,
} from '@services';
import { useDetailNavigation } from '@hooks';
import { CollectionDetail } from '../CollectionDetail';
import { resolveLocalAlbum } from '../../services/library/resolveLocalAlbum';
import { PendingCollectionDetail } from '../CollectionDetail/PendingCollectionDetail';

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
      void resolveLocalAlbum(albumId, (preview) => {
        if (active) setAlbum(preview);
      }).then((nextAlbum) => {
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

  if (!album) return <PendingCollectionDetail kind="album" collectionId={`local_album_${encodeURIComponent(albumId)}`} error={error}
    resolveTracksForPlayback={() => resolveLocalAlbum(albumId).then((data) => data.tracks)} />;

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
