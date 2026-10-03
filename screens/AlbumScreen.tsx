import * as React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { CollectionDetail, LocalAlbum } from '@components';
import {
  findArtistIdByName,
  getAlbum,
  getArtist,
  getYouTubeMusicAlbum,
  isYouTubeMusicAlbumId,
  type YouTubeMusicAlbum,
} from '@api';
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

const AlbumLoadingState = ({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) => (
  <View style={{ flex: 1, backgroundColor: '#101010', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
    <ActivityIndicator color="#1ED760" />
    <Text style={{ color: '#FFFFFF', fontSize: 16 }}>
      {error || 'Carregando álbum...'}
    </Text>
    {error ? (
      <Pressable onPress={onRetry} accessibilityRole="button">
        <Text style={{ color: '#1ED760', fontSize: 16, fontWeight: '700' }}>
          Tentar novamente
        </Text>
      </Pressable>
    ) : null}
  </View>
);

export const AlbumScreen = ({ albumId }: AlbumScreenPropsType) =>
  albumId.startsWith(LOCAL_ALBUM_PREFIX) ? (
    <LocalAlbum albumId={getLocalAlbumId(albumId)} />
  ) : isYouTubeMusicAlbumId(albumId) ? (
    <YouTubeMusicAlbumScreen albumId={albumId} />
  ) : (
    <RemoteAlbumScreen albumId={albumId} />
  );

const YouTubeMusicAlbumScreen = ({ albumId }: AlbumScreenPropsType) => {
  const { openDetail } = useDetailNavigation();
  const [album, setAlbum] = React.useState<YouTubeMusicAlbum | null>(null);
  const [error, setError] = React.useState('');
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [refreshSequence, setRefreshSequence] = React.useState(0);
  const refresh = React.useCallback(() => {
    setIsRefreshing(true);
    setRefreshSequence((sequence) => sequence + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    setError('');
    void getYouTubeMusicAlbum(albumId)
      .then((albumData) => {
        if (active) setAlbum(albumData);
      })
      .catch(() => {
        if (active) {
          setAlbum(null);
          setError('Não foi possível carregar este álbum.');
        }
      })
      .finally(() => {
        if (active) setIsRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [albumId, refreshSequence]);

  if (!album) return <AlbumLoadingState error={error} onRetry={refresh} />;

  const releaseLabel = album.releaseType === 'single'
    ? 'single'
    : album.releaseType === 'compilation'
      ? 'EP'
      : 'álbum';
  const duration = album.tracks.reduce((total, track) => total + (track.durationMs || 0), 0);
  const metadata = [
    album.releaseDate,
    releaseLabel,
    `${album.tracks.length} ${album.tracks.length === 1 ? 'música' : 'músicas'}`,
  ].filter(Boolean).join(' · ');

  return (
    <CollectionDetail
      kind="album"
      collectionId={album.id}
      title={album.name}
      imageURL={album.imageURL}
      description=""
      metadata={metadata}
      trackCount={album.tracks.length}
      totalDurationMs={duration}
      tracks={album.tracks}
      artists={album.artists}
      onArtistPress={(artistId) => openDetail('artist', artistId)}
      onRefresh={refresh}
      refreshing={isRefreshing}
    />
  );
};

const RemoteAlbumScreen = ({ albumId }: AlbumScreenPropsType) => {
  const { openDetail } = useDetailNavigation();
  const [album, setAlbum] = React.useState<AlbumModel | null>(null);
  const [artists, setArtists] = React.useState<ArtistModel[]>([]);
  const [error, setError] = React.useState('');
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [refreshSequence, setRefreshSequence] = React.useState(0);
  const refresh = React.useCallback(() => {
    setIsRefreshing(true);
    setRefreshSequence((sequence) => sequence + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    setError('');

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
          setError('Não foi possível carregar este álbum.');
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

  if (!album) return <AlbumLoadingState error={error} onRetry={refresh} />;

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
      artists={artists.map(({ id, name, imageURL }) => ({ id, name, imageURL }))}
      onArtistPress={handleArtistPress}
      onRefresh={refresh}
      refreshing={isRefreshing}
    />
  );
};
