import * as React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import {
  getArtist,
  getArtistAlbums,
  getArtistTopTracks,
  getCachedArtistSearchSeed,
  getYouTubeMusicArtistBiography,
  getYouTubeMusicArtistImage,
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
  rememberCachedArtistImage,
  type LibraryTrack,
} from '@services';
import { getSpotifyArtistImage } from '../services/metadata/spotifyMetadata';
import { Slider } from '../components/Slider';
import { getYouTubeMusicArtistRouteName } from '../services/youtubeMusicClient';
import { log } from '../utils/appLogger';

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

const buildLocalArtistProfile = (
  tracks: LibraryTrack[],
  routeId: string,
  lookup: string
) => {
  const normalizedLookup = lookup.toLocaleLowerCase();
  const collection = groupLocalArtists(tracks).find((candidate) =>
    candidate.id.toLocaleLowerCase() === normalizedLookup ||
    candidate.id.toLocaleLowerCase() === `spotify:${normalizedLookup}` ||
    candidate.spotifyArtistId?.toLocaleLowerCase() === normalizedLookup ||
    candidate.title.toLocaleLowerCase() === normalizedLookup
  );
  if (!collection) return null;

  const featuredTracks = collection.tracks.filter((track) =>
    isTrackPrimaryArtist(track, collection.id)
  );
  const participationTracks = collection.tracks.filter((track) =>
    isTrackParticipantArtist(track, collection.id)
  );
  const albums = groupLocalAlbums(
    featuredTracks.filter((track) => artistMatchesAlbumPrimary(track, collection.id))
  ).map((album) => ({
    id: `local_album_${encodeURIComponent(album.id)}`,
    type: 'album' as const,
    title: album.title,
    subtitle: album.subtitle,
    imageURL: album.imageURL,
  }));

  return {
    collection,
    artist: {
      id: routeId,
      type: 'artist' as const,
      name: collection.title,
      imageURL: '',
    },
    topTracks: featuredTracks.map(toTrackModel),
    participationTracks: participationTracks.map(toTrackModel),
    albums,
  };
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
  const [artistError, setArtistError] = React.useState('');
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [refreshSequence, setRefreshSequence] = React.useState(0);
  const activeArtistId = React.useRef(artistId);
  const refresh = React.useCallback(() => {
    setArtistError('');
    setIsRefreshing(true);
    setRefreshSequence((sequence) => sequence + 1);
  }, []);
  const localArtistName = artistId.startsWith('local_artist_')
    ? decodeURIComponent(artistId.slice('local_artist_'.length))
    : '';
  const isYouTubeArtist = artistId.startsWith('ytartist_');

  React.useEffect(() => {
    let active = true;
    setArtistError('');
    const searchSeed = isYouTubeArtist
      ? getCachedArtistSearchSeed(artistId)
      : null;
    if (activeArtistId.current !== artistId) {
      activeArtistId.current = artistId;
      setArtist(null);
      setTopTracks([]);
      setParticipationTracks([]);
      setContextualTracks([]);
      setAlbums([]);
    }
    if (searchSeed) {
      setArtist(searchSeed.artist);
      setTopTracks([]);
      setContextualTracks(searchSeed.tracks);
      if (searchSeed.artist.imageURL) {
        void rememberCachedArtistImage(artistId, searchSeed.artist.imageURL);
      }
      log.artist('profile seeded from search results', {
        artistId,
        tracks: searchSeed.tracks.length,
        hasImage: Boolean(searchSeed.artist.imageURL),
      });
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
          ...(searchSeed?.tracks || []),
        ]);
      }
    ).catch(() => {});

    if (localArtistName) {
      void libraryPromise.then((downloaded) => {
        if (!active) return;
        const profile = buildLocalArtistProfile(downloaded, artistId, localArtistName);
        if (!profile) {
          setArtistError('Não encontrei músicas deste artista na biblioteca.');
          setIsRefreshing(false);
          return;
        }
        setArtist(profile.artist);
        setTopTracks(profile.topTracks);
        setParticipationTracks(profile.participationTracks);
        setAlbums(profile.albums);
        setIsRefreshing(false);
        if (profile.collection.spotifyArtistId && /^[A-Za-z0-9]{22}$/.test(profile.collection.spotifyArtistId)) {
          void getCachedArtistImage(profile.collection.id, () =>
            getSpotifyArtistImage(profile.collection.spotifyArtistId!)
          ).then((imageURL) => {
            if (active && imageURL) {
              setArtist((current) => current ? { ...current, imageURL } : current);
            }
          }).catch(() => {});
        }
      }).catch(() => {
        if (active) {
          setArtistError('Não foi possível carregar as músicas deste artista.');
          setIsRefreshing(false);
        }
      });
      return () => {
        active = false;
      };
    }

    if (isYouTubeArtist) {
      log.artist('profile request started', { artistId, source: 'youtube-music' });
      void libraryPromise.then((downloaded) => {
        if (!active) return;
        const artistName = getYouTubeMusicArtistRouteName(artistId);
        const localProfile = artistName
          ? buildLocalArtistProfile(downloaded, artistId, artistName)
          : null;
        if (!localProfile) return;
        setArtist({
          ...localProfile.artist,
          imageURL: searchSeed?.artist.imageURL || localProfile.artist.imageURL,
        });
        setTopTracks(localProfile.topTracks);
        setParticipationTracks(localProfile.participationTracks);
        setAlbums(localProfile.albums);
        log.artist('profile rendered from local library', {
          artistId,
          tracks: localProfile.topTracks.length,
          participations: localProfile.participationTracks.length,
        });
        void getCachedArtistImage(artistId, () =>
          getYouTubeMusicArtistImage(artistId)
        ).then((imageURL) => {
          if (active && imageURL) {
            setArtist((current) => current ? { ...current, imageURL } : current);
          }
        }).catch(() => {});
      }).catch(() => {});

      const finishProfileLoad = log.time('artist', 'youtube music profile load', {
        artistId,
      });
      void getYouTubeMusicArtistProfile(artistId)
        .then(async ({ artist: artistData, tracks, participationTracks: remoteParticipations = [] }) => {
          if (!active) {
            finishProfileLoad({ ok: false, stale: true });
            return;
          }
          const imageURL = searchSeed?.artist.imageURL || artistData.imageURL || await getYouTubeMusicArtistImage(artistId).catch(() => '') || await getCachedArtistImage(
            artistId,
            () => getYouTubeMusicArtistImage(artistId)
          );
          if (!active) {
            finishProfileLoad({ ok: false, stale: true });
            return;
          }
          const description = artistData.description || await getYouTubeMusicArtistBiography(artistId);
          if (!active) return;
          setArtist({ ...artistData, imageURL, description });
          if (imageURL) {
            void rememberCachedArtistImage(artistId, imageURL);
          }
          setTopTracks(tracks);
          setParticipationTracks(remoteParticipations);
          setArtistError('');
          log.artist('profile loaded', {
            artistId,
            tracks: tracks.length,
            participations: remoteParticipations.length,
            hasImage: Boolean(imageURL),
          });
          finishProfileLoad({
            ok: true,
            tracks: tracks.length,
            participations: remoteParticipations.length,
            hasImage: Boolean(imageURL),
          });
        })
        .catch(async (error) => {
          finishProfileLoad({ ok: false, error: String(error) });
          log.error('youtube music artist profile failed', { artistId, error });
          const artistName = getYouTubeMusicArtistRouteName(artistId);
          const downloaded = await libraryPromise.catch(() => []);
          if (!active) return;
          const localProfile = artistName
            ? buildLocalArtistProfile(downloaded, artistId, artistName)
            : null;
          if (localProfile) {
            setArtist({
              ...localProfile.artist,
              imageURL: searchSeed?.artist.imageURL || localProfile.artist.imageURL,
            });
            setTopTracks(localProfile.topTracks);
            setParticipationTracks(localProfile.participationTracks);
            setAlbums(localProfile.albums);
            setArtistError('');
            void getCachedArtistImage(artistId, () =>
              getYouTubeMusicArtistImage(artistId)
            ).then((imageURL) => {
              if (active && imageURL) {
                setArtist((current) => current ? { ...current, imageURL } : current);
              }
            }).catch(() => {});
          } else if (searchSeed) {
            setArtist(searchSeed.artist);
            setTopTracks([]);
            setArtistError('');
            log.artist('profile kept search results after remote failure', {
              artistId,
              tracks: searchSeed.tracks.length,
            });
          } else {
            setArtistError('Não foi possível carregar o perfil agora. Verifique a conexão e tente novamente.');
          }
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
        if (!active) return undefined;
        setArtist(artistData);
        setArtistError('');
        log.artist('profile loaded', { artistId, source: 'spotify', hasImage: Boolean(artistData.imageURL) });
        return artistData;
      })
      .catch(async (error) => {
        log.error('spotify artist profile failed', { artistId, error });
        const downloaded = await libraryPromise.catch(() => []);
        if (!active) return null;
        const localProfile = buildLocalArtistProfile(downloaded, artistId, artistId);
        if (localProfile) {
          setArtist(localProfile.artist);
          setTopTracks(localProfile.topTracks);
          setParticipationTracks(localProfile.participationTracks);
          setAlbums(localProfile.albums);
          const spotifyArtistId = localProfile.collection.spotifyArtistId ||
            (/^[A-Za-z0-9]{22}$/.test(artistId) ? artistId : '');
          if (spotifyArtistId) {
            void getCachedArtistImage(spotifyArtistId, () =>
              getSpotifyArtistImage(spotifyArtistId)
            ).then((imageURL) => {
              if (active && imageURL) {
                setArtist((current) => current ? { ...current, imageURL } : current);
              }
            }).catch(() => {});
          }
        } else {
          setArtistError('Não foi possível carregar o perfil deste artista. Tente novamente.');
        }
        return null;
      });

    const tracksRequest = getArtistTopTracks(artistId)
      .then((trackData) => {
        if (!active) return;
        const fallbackArtistName = trackData[0]?.artists?.find(
          (candidate) => candidate.id === artistId
        )?.name || trackData[0]?.artists?.[0]?.name;
        if (fallbackArtistName) {
          setArtist((current) => current || {
            id: artistId,
            type: 'artist',
            name: fallbackArtistName,
            imageURL: '',
          });
          setArtistError('');
          void getCachedArtistImage(artistId, () =>
            getSpotifyArtistImage(artistId)
          ).then((imageURL) => {
            if (active && imageURL) {
              setArtist((current) => current ? { ...current, imageURL } : current);
            }
          }).catch(() => {});
        }
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

    const catalogRequest = artistRequest.then(async (artistData) => {
      if (!active || !artistData) return;
      const routeId = `ytartist_name_${encodeURIComponent(artistData.name)}`;
      try {
        const profile = await getYouTubeMusicArtistProfile(routeId);
        if (!active) return;
        setArtist((current) => current
          ? { ...current, description: current.description || profile.artist.description }
          : current
        );
        setTopTracks((current) => {
          const byId = new Map([...profile.tracks, ...current].map((track) => [track.id, track]));
          return [...byId.values()];
        });
        setParticipationTracks((current) => {
          const byId = new Map([...profile.participationTracks, ...current].map((track) => [track.id, track]));
          return [...byId.values()];
        });
        log.artist('youtube music catalog merged into spotify artist profile', {
          artistId,
          catalogTracks: profile.tracks.length,
          catalogParticipations: profile.participationTracks.length,
        });
      } catch (error) {
        log.artist('youtube music catalog unavailable for spotify artist', {
          artistId,
          error: String(error),
        });
      }
    });

    const albumsRequest = getArtistAlbums(artistId, 'album,single', 20)
      .then((albumData) => {
        if (active) setAlbums(albumData);
      })
      .catch((error) => console.error('Failed to get artist albums:', error));

    void Promise.allSettled([artistRequest, tracksRequest, catalogRequest, albumsRequest]).finally(() => {
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

  if (!artist) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          paddingHorizontal: 28,
          backgroundColor: '#101010',
        }}
      >
        {artistError ? (
          <>
            <Text style={{ color: '#D0D0D0', fontSize: 15, textAlign: 'center' }}>
              {artistError}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tentar carregar perfil novamente"
              onPress={refresh}
              style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: '#262626' }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 14 }}>Tentar novamente</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color="#1DB954" />
        )}
      </View>
    );
  }

  const metadata = artist.followers
    ? `${artist.followers.toLocaleString('pt-BR')} seguidores`
    : '';

  return (
    <CollectionDetail
      kind="artist"
      collectionId={artist.id}
      title={artist.name}
      imageURL={artist.imageURL}
      description=""
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
