import * as React from 'react';
import { View } from 'react-native';

import { CollectionDetail, LocalAlbum } from '@components';
import { findArtistIdByName, getAlbum, getArtist } from '@api';
import { useDetailNavigation } from '@hooks';
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
  const { openDetail } = useDetailNavigation();
  const [album, setAlbum] = React.useState<AlbumModel | null>(null);
  const [artists, setArtists] = React.useState<ArtistModel[]>([]);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [refreshSequence, setRefreshSequence] = React.useState(0);
  const refresh = React.useCallback(() => {
    setIsRefreshing(true);
    setRefreshSequence((sequence) => sequence + 1);
  }, []);

  React.useEffect(() => {
    let active = true;

    void getAlbum(albumId)
      .then((albumData) => {
        if (!active) return;
        setAlbum(albumData);
        setArtists([]);
        void Promise.all(albumData.artists.map(({ id }) => getArtist(id)))
          .then((artistData) => {
            if (active) setArtists(artistData);
          })
          .catch(() => {});
      })
      .catch((error) => {
        if (active) {
          setAlbum(null);
          setArtists([]);
        }
        console.error('Failed to get album data:', error);
      })
      .finally(() => {
        if (active) setIsRefreshing(false);
      });

    return () => {
      active = false;
    };
  }, [albumId, refreshSequence]);

  const handleArtistPress = React.useCallback(
    async (artistId: string, artistName: string) => {
      const targetArtistId =
        artistId || (await findArtistIdByName(artistName));
      if (targetArtistId) openDetail('artist', targetArtistId);
    },
    [openDetail]
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
      onRefresh={refresh}
      refreshing={isRefreshing}
    />
  );
};
