import * as React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import {
  findArtistIdByName,
  getArtist,
  getArtistDiscography,
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
  if (!primaryArtist) return false;
  if (primaryArtist.id && primaryArtist.id === artistId) return true;
  return Boolean(
    artistName &&
      primaryArtist.name.trim().toLocaleLowerCase() === artistName.trim().toLocaleLowerCase()
  );
};

const uniqueTracksById = (tracks: TrackModel[]) => {
  const unique = new Map<string, TrackModel>();
  tracks.forEach((track) => {
    if (track.id && !unique.has(track.id)) unique.set(track.id, track);
  });
  return [...unique.values()];
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
    let hasCanonicalSpotifyProfile = false;
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
        void rememberCachedArtistImage(
          searchSeed.artist.name,
          searchSeed.artist.imageURL,
          [artistId]
        );
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
          void getCachedArtistImage(profile.artist.name, () =>
            getSpotifyArtistImage(profile.collection.spotifyArtistId!),
            [profile.collection.id, profile.collection.spotifyArtistId]
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
        if (!active || hasCanonicalSpotifyProfile) return;
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
        void getCachedArtistImage(localProfile.artist.name, () =>
          getYouTubeMusicArtistImage(artistId),
          [artistId]
        ).then((imageURL) => {
          if (active && !hasCanonicalSpotifyProfile && imageURL) {
            setArtist((current) => current ? { ...current, imageURL } : current);
          }
        }).catch(() => {});
      }).catch(() => {});

      const loadYouTubeMusicProfile = () => {
      const finishProfileLoad = log.time('artist', 'youtube music profile load', {
        artistId,
      });
      void getYouTubeMusicArtistProfile(artistId)
        .then(async ({ artist: artistData, tracks, participationTracks: remoteParticipations = [] }) => {
          if (!active) {
            finishProfileLoad({ ok: false, stale: true });
            return;
          }
          const imageURL = await getCachedArtistImage(
            artistData.name,
            () => Promise.resolve(searchSeed?.artist.imageURL || artistData.imageURL || '')
              .then((knownImage) => knownImage || getYouTubeMusicArtistImage(artistId)),
            [artistId, artistData.id]
          );
          if (!active) {
            finishProfileLoad({ ok: false, stale: true });
            return;
          }
          const description = artistData.description || await getYouTubeMusicArtistBiography(artistId);
          if (!active) return;
          setArtist({ ...artistData, imageURL, description });
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
            void getCachedArtistImage(localProfile.artist.name, () =>
              getYouTubeMusicArtistImage(artistId),
              [artistId]
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
      };

      const routeArtistName = getYouTubeMusicArtistRouteName(artistId) || searchSeed?.artist.name || '';
      void (async () => {
        if (routeArtistName) {
          try {
            const spotifyArtistId = await findArtistIdByName(routeArtistName);
            if (!active) return;
            if (spotifyArtistId) {
              const finishProfile = log.time('artist', 'canonical Spotify artist profile load', {
                artistId: spotifyArtistId,
                route: artistId,
              });
              const discographyPromise = getArtistDiscography(spotifyArtistId)
                .catch((error) => {
                  log.error('Spotify artist discography failed', { artistId: spotifyArtistId, error });
                  return null;
                });
              const [artistData, topTracks] = await Promise.all([
                getArtist(spotifyArtistId).catch(() => null),
                getArtistTopTracks(spotifyArtistId).catch(() => []),
              ]);
              if (!active) {
                finishProfile({ ok: false, stale: true });
                return;
              }
              const profileName = artistData?.name || routeArtistName;
              if (artistData?.imageURL) {
                await rememberCachedArtistImage(profileName, artistData.imageURL, [artistId, spotifyArtistId]);
              }
              const imageURL = await getCachedArtistImage(
                profileName,
                () => Promise.resolve(artistData?.imageURL || '')
                  .then((knownImage) => knownImage || getSpotifyArtistImage(spotifyArtistId)),
                [artistId, spotifyArtistId]
              );
              if (!active) {
                finishProfile({ ok: false, stale: true });
                return;
              }
              const popularPrimary = topTracks.filter((track) =>
                isRemotePrimaryArtist(track, spotifyArtistId, profileName)
              );
              const popularFeatured = topTracks.filter((track) =>
                !isRemotePrimaryArtist(track, spotifyArtistId, profileName)
              );
              hasCanonicalSpotifyProfile = true;
              const artistProfile: ArtistModel = {
                id: spotifyArtistId,
                type: 'artist',
                name: profileName,
                imageURL,
                ...(artistData?.description ? { description: artistData.description } : {}),
                ...(artistData?.followers ? { followers: artistData.followers } : {}),
              };
              setArtist(artistProfile);
              setTopTracks(uniqueTracksById(popularPrimary));
              setParticipationTracks(uniqueTracksById(popularFeatured));
              setAlbums([]);
              setArtistError('');
              setIsRefreshing(false);
              finishProfile({
                ok: true,
                topTracks: uniqueTracksById(popularPrimary).length,
                hasImage: Boolean(imageURL),
              });

              const finishDiscography = log.time('artist', 'canonical Spotify artist discography render', {
                artistId: spotifyArtistId,
              });
              const discography = await discographyPromise;
              if (!active) {
                finishDiscography({ ok: false, stale: true });
                return;
              }
              if (discography) {
                const primaryTracks = discography.tracks.filter((track) =>
                  isRemotePrimaryArtist(track, spotifyArtistId, profileName)
                );
                const featuredTracks = discography.tracks.filter((track) =>
                  !isRemotePrimaryArtist(track, spotifyArtistId, profileName)
                );
                setTopTracks((current) => uniqueTracksById([...current, ...primaryTracks]));
                setParticipationTracks((current) => uniqueTracksById([...current, ...featuredTracks]));
                setAlbums(discography.albums);
                finishDiscography({
                  ok: true,
                  albums: discography.albums.length,
                  primaryTracks: primaryTracks.length,
                  participations: featuredTracks.length,
                });
              } else {
                finishDiscography({ ok: false });
              }
              return;
            }
          } catch (error) {
            log.artist('Spotify identity lookup unavailable for YouTube artist route', {
              artistId,
              error: String(error),
            });
          }
        }
        if (active) loadYouTubeMusicProfile();
      })();
      return () => {
        active = false;
      };
    }

    const artistRequest = getArtist(artistId)
      .then(async (artistData) => {
        if (!active) return undefined;
        if (artistData.imageURL) {
          await rememberCachedArtistImage(artistData.name, artistData.imageURL, [artistId]);
        }
        const imageURL = await getCachedArtistImage(
          artistData.name,
          () => Promise.resolve(artistData.imageURL || '')
            .then((knownImage) => knownImage || getSpotifyArtistImage(artistId)),
          [artistId]
        );
        if (!active) return undefined;
        setArtist({ ...artistData, imageURL });
        setArtistError('');
        log.artist('profile loaded', { artistId, source: 'spotify', hasImage: Boolean(imageURL) });
        return { ...artistData, imageURL };
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
            void getCachedArtistImage(localProfile.artist.name, () =>
              getSpotifyArtistImage(spotifyArtistId),
              [spotifyArtistId, artistId]
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
          void getCachedArtistImage(fallbackArtistName, () =>
            getSpotifyArtistImage(artistId),
            [artistId]
          ).then((imageURL) => {
            if (active && imageURL) {
              setArtist((current) => current ? { ...current, imageURL } : current);
            }
          }).catch(() => {});
        }
        setTopTracks((current) => uniqueTracksById([
          ...current,
          ...trackData.filter((track) => isRemotePrimaryArtist(track, artistId)),
        ]));
        setParticipationTracks((current) => uniqueTracksById([
          ...current,
          ...trackData.filter((track) => !isRemotePrimaryArtist(track, artistId)),
        ]));
      })
      .catch((error) => console.error('Failed to get artist top tracks:', error));

    const discographyRequest = getArtistDiscography(artistId)
      .then(async (discography) => {
        if (!active) return;
        const artistData = await artistRequest;
        if (!active) return;
        const artistName = artistData?.name || '';
        const primaryTracks = discography.tracks.filter((track) =>
          isRemotePrimaryArtist(track, artistId, artistName)
        );
        const featuredTracks = discography.tracks.filter((track) =>
          !isRemotePrimaryArtist(track, artistId, artistName)
        );
        setTopTracks((current) => uniqueTracksById([...current, ...primaryTracks]));
        setParticipationTracks((current) => uniqueTracksById([...current, ...featuredTracks]));
        setAlbums(discography.albums);
        log.artist('Spotify discography loaded without YouTube artist search', {
          artistId,
          albums: discography.albums.length,
          primaryTracks: primaryTracks.length,
          participations: featuredTracks.length,
        });
      })
      .catch((error) => log.error('Spotify artist discography failed', { artistId, error }));

    void Promise.allSettled([artistRequest, tracksRequest, discographyRequest]).finally(() => {
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
    const candidateContext = [
      ...(currentTrack ? [toCurrentTrackModel(currentTrack)] : []),
      ...contextualTracks,
    ];
    const profileArtistId = artist.id || artistId;
    const profileContext = /^[A-Za-z0-9]{22}$/.test(profileArtistId)
      ? candidateContext.filter((track) => /^[A-Za-z0-9]{22}$/.test(track.id))
      : candidateContext;
    return mergeArtistProfileTracks({
      artistId: profileArtistId,
      artistName: artist.name,
      contextualTracks: profileContext,
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
