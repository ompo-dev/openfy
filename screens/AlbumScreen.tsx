import * as React from 'react';

import { CollectionDetail, LocalAlbum } from '@components';
import {
  findArtistIdByName,
  getAlbum,
  getCachedAlbum,
  getCachedYouTubeMusicAlbum,
  getArtist,
  getYouTubeMusicAlbum,
  isYouTubeMusicAlbumId,
  type YouTubeMusicAlbum,
} from '@api';
import { useDetailNavigation } from '@hooks';
import { AlbumModel, ArtistModel } from '@models';
import { getDisplayTime } from '@utils';
import { prefetchArtistData } from '@services';
import { withLibraryAlbumTracks } from '../services/library/albumMetadata';
import { PendingCollectionDetail } from '../components/CollectionDetail/PendingCollectionDetail';

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
    <LocalAlbum key={albumId} albumId={getLocalAlbumId(albumId)} />
  ) : isYouTubeMusicAlbumId(albumId) ? (
    <YouTubeMusicAlbumScreen key={albumId} albumId={albumId} />
  ) : (
    <RemoteAlbumScreen key={albumId} albumId={albumId} />
  );

const YouTubeMusicAlbumScreen = ({ albumId }: AlbumScreenPropsType) => {
  const { openDetail } = useDetailNavigation();
  const [album, setAlbum] = React.useState<YouTubeMusicAlbum | null>(() => getCachedYouTubeMusicAlbum(albumId) || null);
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
        if (!active) return;
        setAlbum(albumData);
        prefetchArtistData(albumData.artists);
        void withLibraryAlbumTracks(albumData).then((enriched) => {
          if (active) setAlbum(enriched);
        }).catch(() => {});
      })
      .catch(() => {
        if (active) {
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

  if (!album) return <PendingCollectionDetail kind="album" collectionId={albumId} error={error} onRetry={refresh}
    resolveTracksForPlayback={() => getYouTubeMusicAlbum(albumId).then(withLibraryAlbumTracks).then((data) => data.tracks)} />;

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
      disableTrackArtistLinks
      onArtistPress={(artistId) => openDetail('artist', artistId)}
      onRefresh={refresh}
      refreshing={isRefreshing}
    />
  );
};

const RemoteAlbumScreen = ({ albumId }: AlbumScreenPropsType) => {
  const { openDetail } = useDetailNavigation();
  const [album, setAlbum] = React.useState<AlbumModel | null>(() => getCachedAlbum(albumId) || null);
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
        albumData.artists.forEach(({ id }) => {
          void getArtist(id).then((artistData) => {
            if (!active) return;
            setArtists((current) => [...current.filter((artist) => artist.id !== id), artistData]
              .sort((a, b) => albumData.artists.findIndex((ref) => ref.id === a.id) - albumData.artists.findIndex((ref) => ref.id === b.id)));
            prefetchArtistData([artistData]);
          }).catch(() => {});
        });
      })
      .catch((error) => {
        if (active) {
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

  if (!album) return <PendingCollectionDetail kind="album" collectionId={albumId} error={error} onRetry={refresh}
    resolveTracksForPlayback={() => getAlbum(albumId).then((data) => data.tracks.items)} />;

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
      disableTrackArtistLinks
      onArtistPress={handleArtistPress}
      onRefresh={refresh}
      refreshing={isRefreshing}
    />
  );
};
