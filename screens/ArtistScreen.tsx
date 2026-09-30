import * as React from 'react';
import { View } from 'react-native';

import {
  getArtist,
  getArtistAlbums,
  getArtistTopTracks,
  getYouTubeMusicArtistProfile,
} from '@api';
import { CollectionDetail } from '@components';
import { usePlayer } from '@context';
import { ArtistModel, LibraryItemModel, TrackModel } from '@models';
import { Shapes, Sizes } from '@config';
import {
  getCachedArtistImage,
  getLibraryTracks,
  getUserProfile,
  groupLocalAlbums,
  groupLocalArtists,
  isTrackParticipantArtist,
  isTrackPrimaryArtist,
  mergeArtistProfileTracks,
  type LibraryTrack,
} from '@services';
import { getSpotifyArtistImage } from '../services/metadata/spotifyMetadata';
import { Slider } from '../components/Slider';

export type ArtistScreenPropsType = {
  artistId: string;
};

const toTrackModel = (track: LibraryTrack): TrackModel => ({
  ...track,
  id: track.spotifyId,
  title: track.title,
  subtitle: track.artistName,
  imageURL: track.localImagePath || track.imageURL,
  albumName: track.albumName,
  durationMs: track.duration_ms,
  isDownloaded: track.isDownloaded,
});

const toHistoryTrackModel = (
  track: Awaited<
    ReturnType<typeof getUserProfile>
  >['recentlyPlayedTracks'][number]['track']
): TrackModel => ({
  id: track.spotifyId,
  title: track.title,
  subtitle: track.artists.join(', ') || track.primaryArtist,
  imageURL: track.imageURL,
  albumName: track.albumName,
  durationMs: track.durationMs,
  artists: track.artists.map((name) => ({ id: '', name })),
  isDownloaded: Boolean(track.localAudioPath),
});

const toCurrentTrackModel = (
  track: NonNullable<ReturnType<typeof usePlayer>['currentTrack']>
): TrackModel => ({
  id: track.spotifyId,
  title: track.title,
  subtitle: track.artistName,
  imageURL: track.localImagePath || track.imageURL,
  albumName: track.albumName,
  albumId: track.albumId,
  albumArtists: track.albumArtists,
  youtubeVideoId: track.youtubeVideoId,
  youtubeUrl: track.youtubeUrl,
  durationMs: track.duration_ms,
  artists: track.artists,
  isDownloaded: Boolean(track.localAudioPath),
});

const isRemotePrimaryArtist = (
  track: TrackModel,
  artistId: string,
  artistName?: string
) => {
  const primaryArtist = track.artists?.[0];
  if (!primaryArtist) return true;
  if (primaryArtist.id && primaryArtist.id === artistId) return true;
  return Boolean(
    artistName &&
      primaryArtist.name.toLocaleLowerCase() === artistName.toLocaleLowerCase()
  );
};

const artistMatchesAlbumPrimary = (
  track: LibraryTrack,
  artistIdOrName: string
) => {
  const albumPrimary = track.albumArtists?.[0];
  if (!albumPrimary) return isTrackPrimaryArtist(track, artistIdOrName);
  const target = artistIdOrName.toLocaleLowerCase();
  return (
    `spotify:${albumPrimary.id}`.toLocaleLowerCase() === target ||
    albumPrimary.name.toLocaleLowerCase() === target
  );
};

export const ArtistScreen = ({ artistId }: ArtistScreenPropsType) => {
  const { currentTrack } = usePlayer();
  const [artist, setArtist] = React.useState<ArtistModel | null>(null);
  const [topTracks, setTopTracks] = React.useState<TrackModel[]>([]);
  const [participationTracks, setParticipationTracks] = React.useState<TrackModel[]>([]);
  const [contextualTracks, setContextualTracks] = React.useState<TrackModel[]>(
    []
  );
  const [albums, setAlbums] = React.useState<LibraryItemModel[]>([]);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [refreshSequence, setRefreshSequence] = React.useState(0);
  const activeArtistId = React.useRef(artistId);
  const refresh = React.useCallback(() => {
    setIsRefreshing(true);
    setRefreshSequence((sequence) => sequence + 1);
  }, []);
  const localArtistName = artistId.startsWith('local_artist_')
    ? decodeURIComponent(artistId.slice('local_artist_'.length))
    : '';
  const isYouTubeArtist = artistId.startsWith('ytartist_');

  React.useEffect(() => {
    let active = true;
    if (activeArtistId.current !== artistId) {
      activeArtistId.current = artistId;
      setArtist(null);
      setTopTracks([]);
      setParticipationTracks([]);
      setContextualTracks([]);
      setAlbums([]);
    }

    const libraryPromise = getLibraryTracks();
    void Promise.all([libraryPromise, getUserProfile()]).then(
      ([libraryTracks, profile]) => {
        if (!active) return;
        setContextualTracks([
          ...profile.recentlyPlayedTracks.map((entry) =>
            toHistoryTrackModel(entry.track)
          ),
          ...libraryTracks.map(toTrackModel),
        ]);
      }
    ).catch(() => {});

    if (localArtistName) {
      void libraryPromise.then((downloaded) => {
        const collection = groupLocalArtists(downloaded).find((candidate) =>
          candidate.id === localArtistName ||
          candidate.title.toLocaleLowerCase() === localArtistName.toLocaleLowerCase()
        );
        if (!active) return;
        const collectionTracks = collection?.tracks || [];
        const featuredTracks = collectionTracks.filter((track) =>
          isTrackPrimaryArtist(track, collection?.id || localArtistName)
        );
        const participationOnlyTracks = collectionTracks.filter((track) =>
          isTrackParticipantArtist(track, collection?.id || localArtistName)
        );
        const artistAlbums = groupLocalAlbums(
          featuredTracks.filter((track) =>
            artistMatchesAlbumPrimary(track, collection?.id || localArtistName)
          )
        ).map((album) => ({
          id: `local_album_${encodeURIComponent(album.id)}`,
          type: 'album' as const,
          title: album.title,
          subtitle: album.subtitle,
          imageURL: album.imageURL,
        }));
        setArtist({
          id: artistId,
          type: 'artist',
          name: collection?.title || localArtistName,
          imageURL: '',
        });
        setTopTracks(featuredTracks.map(toTrackModel));
        setParticipationTracks(participationOnlyTracks.map(toTrackModel));
        setAlbums(artistAlbums);
        setIsRefreshing(false);
        if (collection?.spotifyArtistId && /^[A-Za-z0-9]{22}$/.test(collection.spotifyArtistId)) {
          void getCachedArtistImage(collection.id, () =>
            getSpotifyArtistImage(collection.spotifyArtistId!)
          ).then((imageURL) => {
            if (active && imageURL) {
              setArtist((current) => current ? { ...current, imageURL } : current);
            }
          });
        }
      }).catch(() => {
        if (active) setIsRefreshing(false);
      });
      return () => {
        active = false;
      };
    }

    if (isYouTubeArtist) {
      void getYouTubeMusicArtistProfile(artistId)
        .then(({ artist: artistData, tracks }) => {
          if (!active) return;
          setArtist(artistData);
          setTopTracks(tracks);
        })
        .catch((error) => {
          if (active) setArtist(null);
          console.error('Failed to get YouTube Music artist data:', error);
        })
        .finally(() => {
          if (active) setIsRefreshing(false);
        });
      return () => {
        active = false;
      };
    }

    const artistRequest = getArtist(artistId)
      .then((artistData) => {
        if (!active) return;
        setArtist(artistData);
      })
      .catch((error) => {
        if (active) {
          setArtist(null);
        }
        console.error('Failed to get artist data:', error);
      });

    const tracksRequest = getArtistTopTracks(artistId)
      .then((trackData) => {
        if (!active) return;
        setTopTracks(
          trackData.filter((track) =>
            isRemotePrimaryArtist(track, artistId)
          )
        );
        setParticipationTracks(
          trackData.filter(
            (track) => !isRemotePrimaryArtist(track, artistId)
          )
        );
      })
      .catch((error) => console.error('Failed to get artist top tracks:', error));

    const albumsRequest = getArtistAlbums(artistId, 'album,single', 20)
      .then((albumData) => {
        if (active) setAlbums(albumData);
      })
      .catch((error) => console.error('Failed to get artist albums:', error));

    void Promise.allSettled([artistRequest, tracksRequest, albumsRequest]).finally(() => {
      if (active) setIsRefreshing(false);
    });

    return () => {
      active = false;
    };
  }, [artistId, isYouTubeArtist, localArtistName, refreshSequence]);

  const mergedTracks = React.useMemo(() => {
    if (!artist) {
      return { primaryTracks: topTracks, participationTracks };
    }
    return mergeArtistProfileTracks({
      artistId,
      artistName: artist.name,
      contextualTracks: [
        ...(currentTrack ? [toCurrentTrackModel(currentTrack)] : []),
        ...contextualTracks,
      ],
      primaryTracks: topTracks,
      participationTracks,
    });
  }, [
    artist,
    artistId,
    contextualTracks,
    currentTrack,
    participationTracks,
    topTracks,
  ]);

  if (!artist) return <View style={{ flex: 1, backgroundColor: '#101010' }} />;

  const metadata = [
    'Artista',
    artist.followers ? `${artist.followers.toLocaleString('pt-BR')} seguidores` : '',
  ]
    .filter(Boolean)
    .join(' • ');
  const description = artist.genres?.length
    ? `${artist.name} · ${artist.genres.slice(0, 3).join(' · ')}.`
    : `Músicas, álbuns e singles de ${artist.name}.`;

  return (
    <CollectionDetail
      kind="artist"
      collectionId={artist.id}
      title={artist.name}
      imageURL={artist.imageURL}
      description={description}
      metadata={metadata}
      tracks={mergedTracks.primaryTracks}
      disableTrackArtistLinks
      sectionTitle="Músicas em destaque"
      extraTrackSections={[
        {
          id: 'participations',
          title: 'Participações',
          tracks: mergedTracks.participationTracks,
        },
      ]}
      onRefresh={refresh}
      refreshing={isRefreshing}
      footer={
        albums.length ? (
          <Slider
            title="Álbuns e singles"
            slides={albums}
            size={Sizes.SMALL}
            shape={Shapes.SQUARE_BORDER}
            withShowAll={false}
          />
        ) : null
      }
    />
  );
};
