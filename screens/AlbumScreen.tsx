import * as React from 'react';
import { View } from 'react-native';
import { Href, useRouter, useSegments } from 'expo-router';

import { CollectionDetail, LocalAlbum } from '@components';
import { getAlbum, getArtist } from '@api';
import { AlbumModel, ArtistModel } from '@models';
import { getDisplayTime } from '@utils';

export type AlbumScreenPropsType = {
  albumId: string;
};

const LOCAL_ALBUM_PREFIX = 'local_album_';

const getLocalAlbumId = (albumId: string): string => {
  const encodedId = albumId.slice(LOCAL_ALBUM_PREFIX.length);
  try {
    return decodeURIComponent(encodedId);
  } catch {
    return encodedId;
  }
};

export const AlbumScreen = ({ albumId }: AlbumScreenPropsType) =>
  albumId.startsWith(LOCAL_ALBUM_PREFIX) ? (
    <LocalAlbum albumId={getLocalAlbumId(albumId)} />
  ) : (
    <RemoteAlbumScreen albumId={albumId} />
  );

const RemoteAlbumScreen = ({ albumId }: AlbumScreenPropsType) => {
  const router = useRouter();
  const segments = useSegments();
  const [album, setAlbum] = React.useState<AlbumModel | null>(null);
  const [artists, setArtists] = React.useState<ArtistModel[]>([]);

  React.useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const albumData = await getAlbum(albumId);
        const artistData = await Promise.all(
          albumData.artists.map(({ id }) => getArtist(id))
        );
        if (!active) return;
        setAlbum(albumData);
        setArtists(artistData);
      } catch (error) {
        if (active) {
          setAlbum(null);
          setArtists([]);
        }
        console.error('Failed to get album data:', error);
      }
    })();

    return () => {
      active = false;
    };
  }, [albumId]);

  const handleArtistPress = React.useCallback(
    (artistId: string) => {
      const section = segments.join('/').includes('library') ? 'library' : 'home';
      router.push(`/(tabs)/${section}/artist/${artistId}` as Href);
    },
    [router, segments]
  );

  if (!album) return <View style={{ flex: 1, backgroundColor: '#101010' }} />;

  const metadata = [
    album.genres[0],
    album.releaseDate.split('-')[0],
    `${album.tracks.total} ${album.tracks.total === 1 ? 'música' : 'músicas'}`,
    getDisplayTime(album.duration),
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <CollectionDetail
      kind="album"
      collectionId={album.id}
      title={album.name}
      imageURL={album.imageURL}
      description={album.label || album.genres.join(' · ')}
      metadata={metadata}
      trackCount={album.tracks.total}
      totalDurationMs={album.duration}
      tracks={album.tracks.items}
      artists={artists.map(({ id, name }) => ({ id, name }))}
      onArtistPress={handleArtistPress}
    />
  );
};
