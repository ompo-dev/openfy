import * as React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import {
  findArtistIdByName,
  getAlbum,
  getArtist,
  getArtistCatalogImage,
  getArtistDiscography,
  getArtistTopTracks,
  getCachedArtist,
  getCachedYouTubeMusicArtistProfile,
  subscribeYouTubeMusicArtistProfile,
  subscribeArtistDiscography,
  getCachedArtistSearchSeed,
  getYouTubeMusicArtistBiography,
  getYouTubeMusicAlbum,
  getYouTubeMusicArtistProfile,
  isYouTubeMusicAlbumId,
} from '@api';
import { CollectionDetail } from '@components';
import { usePlayer, type PlayerTrack } from '@context';
import { ArtistModel, LibraryItemModel, TrackModel, albumAssociationsForTrack, mergeAlbumAssociations } from '@models';
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
import { Slider } from '../components/Slider';
import {
  getYouTubeMusicArtistRouteName,
  toYouTubeMusicArtistRouteId,
} from '../services/youtubeMusicClient';
import { log } from '../utils/appLogger';
import { mergeArtistReleases, normalizeReleaseTitle } from '../services/library/artistReleases';
import { getDetailPreview } from '../services/navigation/detailPreview';

export type ArtistScreenPropsType = {
  artistId: string;
};

const MIN_TRACKS_BEFORE_PUBLIC_CATALOG_SUPPLEMENT = 40;

const toTrackModel = (track: LibraryTrack): TrackModel => ({
  ...track,
  id: track.spotifyId,
  title: track.title,
  subtitle: track.artistName,
  imageURL: track.localImagePath || track.imageURL,
  albumName: track.albumName,
  albumId: track.albumId,
  albumAssociations: track.albumAssociations,
  albumArtists: track.albumArtists,
  trackNumber: track.trackNumber,
  discNumber: track.discNumber,
  durationMs: track.duration_ms,
  artists: track.artists,
  youtubeVideoId: track.youtubeVideoId,
  youtubeUrl: track.youtubeUrl,
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
  track: PlayerTrack
): TrackModel => ({
  id: track.spotifyId,
  title: track.title,
  subtitle: track.artistName,
  imageURL: track.localImagePath || track.imageURL,
  albumName: track.albumName,
  albumId: track.albumId,
  albumAssociations: track.albumAssociations,
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
    if (!track.id) return;
    const previous = unique.get(track.id);
    unique.set(track.id, previous ? {
      ...previous, ...track,
      albumAssociations: mergeAlbumAssociations(albumAssociationsForTrack(previous), albumAssociationsForTrack(track)),
    } : track);
  });
  return [...unique.values()];
};

const splitArtistReleases = (releases: LibraryItemModel[]) => ({
  albums: releases.filter((release) =>
    release.releaseType !== 'single' &&
    release.releaseType !== 'ep' &&
    release.releaseType !== 'compilation'
  ),
  singlesAndEps: releases.filter((release) =>
    release.releaseType === 'single' ||
    release.releaseType === 'ep' ||
    release.releaseType === 'compilation'
  ),
});

const mergeCatalogTracks = (
  artistId: string,
  artistName: string,
  primaryTracks: TrackModel[],
  participationTracks: TrackModel[]
) => mergeArtistProfileTracks({
  artistId,
  artistName,
  contextualTracks: [],
  primaryTracks,
  participationTracks,
});

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
    isTrackPrimaryArtist(track, collection.title)
  );
  const participationTracks = collection.tracks.filter((track) =>
    isTrackParticipantArtist(track, collection.title)
  );
  const albums = groupLocalAlbums(
    featuredTracks.filter((track) => artistMatchesAlbumPrimary(track, collection.title))
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
    singlesAndEps: [],
  };
};

export const ArtistScreen = ({ artistId }: ArtistScreenPropsType) => {
  const { currentTrack } = usePlayer((state) => ({ currentTrack: state.currentTrack }));
  const preview = getDetailPreview('artist', artistId);
  const [artist, setArtist] = React.useState<ArtistModel | null>(() =>
    getCachedArtist(artistId) || getCachedYouTubeMusicArtistProfile(artistId)?.artist ||
    (preview ? { id: artistId, type: 'artist', name: preview.title, imageURL: preview.imageURL || '' } : null));
  const [topTracks, setTopTracks] = React.useState<TrackModel[]>([]);
  const [participationTracks, setParticipationTracks] = React.useState<TrackModel[]>([]);
  const [contextualTracks, setContextualTracks] = React.useState<TrackModel[]>(
    []
  );
  const [albums, setAlbums] = React.useState<LibraryItemModel[]>([]);
  const [singlesAndEps, setSinglesAndEps] = React.useState<LibraryItemModel[]>([]);
  const [isProfileReady, setIsProfileReady] = React.useState(false);
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
  const currentTrackArtistName = currentTrack?.artists?.find(
    (candidate) => candidate.id === artistId
  )?.name || '';
  const playbackArtistNameRef = React.useRef(currentTrackArtistName);
  playbackArtistNameRef.current = currentTrackArtistName;

  // Release cards only contain the release id. Warm their credited artists
  // after the profile shell is visible so opening an album can render avatars
  // from the shared artist-image cache immediately.
  React.useEffect(() => {
    let active = true;
    const releases = [...albums, ...singlesAndEps].slice(0, 6);
    if (!releases.length) return () => { active = false; };

    type ArtistRef = { id: string; name?: string };
    const warm = async () => {
      const seenArtists = new Set<string>();
      const warmArtists = async (refs: ArtistRef[]) => {
        for (const ref of refs) {
          if (!active) return;
          const key = ref.id || ref.name?.toLocaleLowerCase() || '';
          if (!key || seenArtists.has(key)) continue;
          seenArtists.add(key);
          try {
            const name = ref.name || (await getArtist(ref.id))?.name;
            if (name && active) await getCachedArtistImage(name,
              () => getArtistCatalogImage(ref.id, name), [ref.id]);
          } catch {
            // A missing portrait must not hold up the next release.
          }
        }
      };
      let cursor = 0;
      const loadRelease = async () => {
        while (active && cursor < releases.length) {
          const release = releases[cursor++];
          try {
            if (isYouTubeMusicAlbumId(release.id)) {
              const album = await getYouTubeMusicAlbum(release.id);
              await warmArtists(album.artists);
            } else if (/^[A-Za-z0-9]{22}$/.test(release.id)) {
              const album = await getAlbum(release.id);
              await warmArtists(album.artists);
            }
          } catch {
            // A single unavailable release must not affect the profile.
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(2, releases.length) }, () => loadRelease())
      );
    };

    void warm().catch(() => {});
    return () => { active = false; };
  }, [albums, singlesAndEps]);

  React.useEffect(() => {
    let active = true;
    let hasRemoteArtistProfile = false;
    let waitingForSupplement = false;
    const subscriptions: (() => void)[] = [];
    const cleanup = () => { active = false; subscriptions.forEach((unsubscribe) => unsubscribe()); };
    const watchCatalog = (routeId: string, targetId = artistId) => {
      subscriptions.push(subscribeYouTubeMusicArtistProfile(routeId, (profile) => {
        if (!active) return;
        setArtist((current) => ({ ...current, ...profile.artist, id: targetId,
          imageURL: profile.artist.imageURL || current?.imageURL || '',
        }));
        setTopTracks((current) => uniqueTracksById([...current, ...profile.tracks]));
        setParticipationTracks((current) => uniqueTracksById([...current, ...profile.participationTracks]));
        setAlbums((current) => mergeArtistReleases(current, profile.albums));
        setSinglesAndEps((current) => mergeArtistReleases(current, profile.singlesAndEps));
      }));
    };
    const watchDiscography = (id: string, name = '') => {
      subscriptions.push(subscribeArtistDiscography(id, (profile) => {
        if (!active) return;
        setAlbums(profile.albums);
        setSinglesAndEps(profile.singlesAndEps);
        setTopTracks((current) => uniqueTracksById([...current, ...profile.tracks.filter((track) => isRemotePrimaryArtist(track, id, name))]));
        setParticipationTracks((current) => uniqueTracksById([...current, ...profile.tracks.filter((track) => !isRemotePrimaryArtist(track, id, name))]));
      }));
    };
    // Playback can supply a fallback name, but must not reload this route.
    const playbackArtistName = playbackArtistNameRef.current;
    setArtistError('');
    setIsProfileReady(false);
    const searchSeed = isYouTubeArtist
      ? getCachedArtistSearchSeed(artistId)
      : null;
    if (activeArtistId.current !== artistId) {
      activeArtistId.current = artistId;
      const seed = getDetailPreview('artist', artistId);
      setArtist(getCachedArtist(artistId) || getCachedYouTubeMusicArtistProfile(artistId)?.artist ||
        (seed ? { id: artistId, type: 'artist', name: seed.title, imageURL: seed.imageURL || '' } : null));
      setTopTracks([]);
      setParticipationTracks([]);
      setContextualTracks([]);
      setAlbums([]);
      setSinglesAndEps([]);
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

    const earlyArtistName = isYouTubeArtist
      ? getYouTubeMusicArtistRouteName(artistId) || searchSeed?.artist.name || ''
      : localArtistName || searchSeed?.artist.name || playbackArtistName;
    const earlyArtistImage = earlyArtistName
      ? getCachedArtistImage(
          earlyArtistName,
          () => getArtistCatalogImage(artistId, earlyArtistName),
          [artistId]
        ).catch(() => '')
      : null;
    if (earlyArtistName) {
      setArtist((current) => current?.id === artistId ? current : {
        ...(searchSeed?.artist || {}),
        id: artistId,
        type: 'artist',
        name: earlyArtistName,
        imageURL: searchSeed?.artist.imageURL || '',
      });
      if (earlyArtistImage) {
        void earlyArtistImage.then((imageURL) => {
          if (active && imageURL) {
            setArtist((current) => current?.id === artistId
              ? { ...current, imageURL }
              : current);
          }
        });
      }
    }

    type LocalArtistProfile = NonNullable<ReturnType<typeof buildLocalArtistProfile>>;
    const applyLocalArtistProfile = (profile: LocalArtistProfile) => {
      setArtist(profile.artist);
      setTopTracks(profile.topTracks);
      setParticipationTracks(profile.participationTracks);
      setAlbums(profile.albums);
      setSinglesAndEps(profile.singlesAndEps);
    };

    const libraryPromise = getLibraryTracks();
    const supplementFromPublicCatalog = (
      artistName: string,
      routeId: string,
      localProfile?: LocalArtistProfile,
      additionalPrimaryTracks: TrackModel[] = [],
      additionalParticipationTracks: TrackModel[] = []
    ) => {
      waitingForSupplement = true;
      const catalogRouteId = toYouTubeMusicArtistRouteId(undefined, artistName);
      watchCatalog(catalogRouteId, routeId);
      void getYouTubeMusicArtistProfile(catalogRouteId).then((catalogProfile) => {
        if (!active) return;
        waitingForSupplement = false;
        hasRemoteArtistProfile = true;
        const merged = mergeCatalogTracks(
          catalogProfile.artist.id,
          catalogProfile.artist.name,
          [...catalogProfile.tracks, ...(localProfile?.topTracks || []), ...additionalPrimaryTracks],
          [...catalogProfile.participationTracks, ...(localProfile?.participationTracks || []), ...additionalParticipationTracks]
        );
        setArtist((current) => ({
          ...catalogProfile.artist,
          id: routeId,
          imageURL: current?.imageURL || catalogProfile.artist.imageURL || localProfile?.artist.imageURL || '',
          ...(catalogProfile.artist.description || current?.description
            ? { description: catalogProfile.artist.description || current?.description }
            : {}),
          ...(current?.followers ? { followers: current.followers } : {}),
        }));
        setTopTracks(merged.primaryTracks);
        setParticipationTracks(merged.participationTracks);
        const publicReleases = splitArtistReleases(mergeArtistReleases(
          [...(localProfile?.albums || []), ...(localProfile?.singlesAndEps || [])],
          [...(catalogProfile.albums || []), ...(catalogProfile.singlesAndEps || [])]
        ));
        setAlbums((current) => mergeArtistReleases(current, publicReleases.albums)
          .filter((release) => !release.id.startsWith('local_album_') ||
            !publicReleases.singlesAndEps.some((single) => normalizeReleaseTitle(single.title) === normalizeReleaseTitle(release.title))));
        setSinglesAndEps((current) => mergeArtistReleases(current, publicReleases.singlesAndEps)
          .filter((release) => !release.id.startsWith('local_album_') ||
            !publicReleases.albums.some((album) => normalizeReleaseTitle(album.title) === normalizeReleaseTitle(release.title))));
        setIsProfileReady(true);
        setArtistError('');
        log.artist('public artist catalog supplemented local profile', {
          artist: catalogProfile.artist.name,
          tracks: merged.primaryTracks.length,
          participations: merged.participationTracks.length,
        });
      }).catch((error) => {
        waitingForSupplement = false;
        if (active) {
          if (localProfile) applyLocalArtistProfile(localProfile);
          setIsProfileReady(true);
        }
        log.artist('public artist catalog fallback failed', {
          artist: artistName,
          error: String(error),
        });
      });
    };
    void libraryPromise.then((libraryTracks) => {
      if (active) setContextualTracks((current) => uniqueTracksById([...current, ...libraryTracks.map(toTrackModel)]));
    }).catch(() => {});
    void getUserProfile().then((profile) => {
      if (active) setContextualTracks((current) => uniqueTracksById([...current,
        ...profile.recentlyPlayedTracks.map((entry) => toHistoryTrackModel(entry.track))]));
    }).catch(() => {});

    if (localArtistName) {
      void libraryPromise.then((downloaded) => {
        if (!active) return;
        const profile = buildLocalArtistProfile(downloaded, artistId, localArtistName);
        if (!profile) {
          setArtistError('Não encontrei músicas deste artista na biblioteca.');
          setIsProfileReady(true);
          setIsRefreshing(false);
          return;
        }
        applyLocalArtistProfile(profile);
        setIsProfileReady(false);
        setIsRefreshing(false);
        if (profile.collection.spotifyArtistId && /^[A-Za-z0-9]{22}$/.test(profile.collection.spotifyArtistId)) {
          void getCachedArtistImage(profile.artist.name, () =>
            getArtistCatalogImage(profile.collection.spotifyArtistId!, profile.artist.name),
            [profile.collection.id, profile.collection.spotifyArtistId]
          ).then((imageURL) => {
            if (active && imageURL) {
              setArtist((current) => current ? { ...current, imageURL } : current);
            }
          }).catch(() => {});
        }
        supplementFromPublicCatalog(profile.artist.name, artistId, profile);
      }).catch(() => {
        if (active) {
          setIsProfileReady(true);
          setArtistError('Não foi possível carregar as músicas deste artista.');
          setIsRefreshing(false);
        }
      });
      return cleanup;
    }

    if (isYouTubeArtist) {
      log.artist('profile request started', { artistId, source: 'youtube-music' });

      const loadYouTubeMusicProfile = (profileRouteId = artistId) => {
      watchCatalog(profileRouteId);
      const finishProfileLoad = log.time('artist', 'youtube music profile load', {
        artistId: profileRouteId,
      });
      void getYouTubeMusicArtistProfile(profileRouteId)
        .then(async ({
          artist: artistData,
          tracks,
          participationTracks: remoteParticipations = [],
          albums: remoteAlbums = [],
          singlesAndEps: remoteSinglesAndEps = [],
        }) => {
          if (!active) {
            finishProfileLoad({ ok: false, stale: true });
            return;
          }
          hasRemoteArtistProfile = true;
          const imageURL = artistData.imageURL || searchSeed?.artist.imageURL || '';
          setArtist((current) => ({
            ...artistData,
            id: artistId,
            imageURL: imageURL || current?.imageURL || '',
            ...(current?.description ? { description: current.description } : {}),
          }));
          setTopTracks(tracks);
          setParticipationTracks(remoteParticipations);
          setAlbums(remoteAlbums);
          setSinglesAndEps(remoteSinglesAndEps);
          setIsProfileReady(true);
          setArtistError('');
          if (!imageURL) {
            void (earlyArtistImage || getCachedArtistImage(
              artistData.name,
              () => getArtistCatalogImage(artistData.id, artistData.name),
              [artistId, artistData.id]
            )).then((resolvedImage) => {
              if (active && resolvedImage) {
                setArtist((current) => current?.id === artistId
                  ? { ...current, imageURL: resolvedImage }
                  : current);
              }
            }).catch(() => {});
          }
          if (!artistData.description) {
            void getYouTubeMusicArtistBiography(artistId).then((description) => {
              if (active && description) {
                setArtist((current) => current?.id === artistId
                  ? { ...current, description }
                  : current);
              }
            }).catch(() => {});
          }
          log.artist('profile loaded', {
            artistId: profileRouteId,
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
          log.error('youtube music artist profile failed', { artistId: profileRouteId, error });
          if (hasRemoteArtistProfile) return;
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
            setSinglesAndEps(localProfile.singlesAndEps);
            setIsProfileReady(true);
            setArtistError('');
            void getCachedArtistImage(localProfile.artist.name, () =>
              getArtistCatalogImage(artistId, localProfile.artist.name),
              [artistId]
            ).then((imageURL) => {
              if (active && imageURL) {
                setArtist((current) => current ? { ...current, imageURL } : current);
              }
            }).catch(() => {});
          } else if (searchSeed) {
            setArtist(searchSeed.artist);
            setTopTracks(searchSeed.tracks);
            setParticipationTracks([]);
            setIsProfileReady(true);
            setArtistError('');
            log.artist('profile kept search results after remote failure', {
              artistId,
              tracks: searchSeed.tracks.length,
            });
          } else {
            setIsProfileReady(true);
            setArtistError('Não foi possível carregar o perfil agora. Verifique a conexão e tente novamente.');
          }
        })
        .finally(() => {
          if (active) setIsRefreshing(false);
        });
      };

      const routeArtistName = earlyArtistName;
      void (async () => {
        if (routeArtistName) {
          try {
            const spotifyArtistId = await findArtistIdByName(routeArtistName);
            if (!active) return;
            if (spotifyArtistId) {
              log.artist('canonical Spotify identity resolved for artist route', {
                routeArtistId: artistId,
                spotifyArtistId,
                artist: routeArtistName,
              });
              const finishProfile = log.time('artist', 'canonical Spotify artist profile load', {
                artistId: spotifyArtistId,
                route: artistId,
              });
              const [artistData, topTracks] = await Promise.all([
                getArtist(spotifyArtistId).then((data) => {
                  if (active && data) setArtist(data);
                  return data;
                }).catch(() => null),
                getArtistTopTracks(spotifyArtistId).catch(() => []),
              ]);
              if (!active) {
                finishProfile({ ok: false, stale: true });
                return;
              }
              if (artistData || topTracks.length) {
                const profileName = artistData?.name || routeArtistName;
                const popularPrimary = topTracks.filter((track) =>
                  isRemotePrimaryArtist(track, spotifyArtistId, profileName)
                );
                const popularFeatured = topTracks.filter((track) =>
                  !isRemotePrimaryArtist(track, spotifyArtistId, profileName)
                );
                const artistProfile: ArtistModel = {
                  id: spotifyArtistId,
                  type: 'artist',
                  name: profileName,
                  imageURL: artistData?.imageURL || searchSeed?.artist.imageURL || '',
                  ...(artistData?.description ? { description: artistData.description } : {}),
                  ...(artistData?.followers ? { followers: artistData.followers } : {}),
                };
                setArtist(artistProfile);
                setTopTracks(uniqueTracksById(popularPrimary));
                setParticipationTracks(uniqueTracksById(popularFeatured));
                setArtistError('');
                setIsProfileReady(true);
                setIsRefreshing(false);
                finishProfile({
                  ok: true,
                  topTracks: uniqueTracksById(popularPrimary).length,
                  hasImage: Boolean(artistProfile.imageURL),
                });

                // The profile shell is usable immediately. Discography is the
                // expensive request and enriches the already visible screen.
                const finishDiscography = log.time('artist', 'canonical Spotify artist discography render', {
                  artistId: spotifyArtistId,
                });
                watchDiscography(spotifyArtistId, profileName);
                void getArtistDiscography(spotifyArtistId)
                  .then((discography) => {
                    if (!active) {
                      finishDiscography({ ok: false, stale: true });
                      return;
                    }
                    const primaryTracks = discography.tracks.filter((track) =>
                      isRemotePrimaryArtist(track, spotifyArtistId, profileName)
                    );
                    const featuredTracks = discography.tracks.filter((track) =>
                      !isRemotePrimaryArtist(track, spotifyArtistId, profileName)
                    );
                    setTopTracks((current) => uniqueTracksById([...current, ...primaryTracks]));
                    setParticipationTracks((current) => uniqueTracksById([...current, ...featuredTracks]));
                    const updatedReleases = splitArtistReleases([
                      ...discography.albums,
                      ...(discography.singlesAndEps || []),
                    ]);
                    setAlbums(updatedReleases.albums);
                    setSinglesAndEps(updatedReleases.singlesAndEps);
                    finishDiscography({
                      ok: true,
                      albums: updatedReleases.albums.length,
                      primaryTracks: primaryTracks.length,
                      participations: featuredTracks.length,
                    });
                    const knownTrackCount = discography.tracks.length + topTracks.length;
                    if (!discography.albums.length || knownTrackCount < MIN_TRACKS_BEFORE_PUBLIC_CATALOG_SUPPLEMENT) {
                      supplementFromPublicCatalog(
                        profileName,
                        spotifyArtistId,
                        undefined,
                        [...popularPrimary, ...primaryTracks],
                        [...popularFeatured, ...featuredTracks]
                      );
                    }
                  })
                  .catch((error) => {
                    if (!active) {
                      finishDiscography({ ok: false, stale: true });
                      return;
                    }
                    finishDiscography({ ok: false });
                    log.error('Spotify artist discography failed', { artistId: spotifyArtistId, error });
                    supplementFromPublicCatalog(
                      profileName,
                      spotifyArtistId,
                      undefined,
                      popularPrimary,
                      popularFeatured
                    );
                  });

                void getCachedArtistImage(
                  profileName,
                  () => getArtistCatalogImage(spotifyArtistId, profileName)
                    .then((knownImage) => knownImage || artistData?.imageURL || ''),
                  [artistId, spotifyArtistId]
                ).then((imageURL) => {
                  if (active && imageURL) {
                    setArtist((current) => current?.id === spotifyArtistId
                      ? { ...current, imageURL }
                      : current);
                  }
                }).catch(() => {});
                return;
              }
              finishProfile({ ok: false, fallback: 'youtube-music' });
              log.artist('Spotify artist catalog unavailable; loading public YouTube Music catalog', {
                artist: routeArtistName,
                artistId: spotifyArtistId,
              });
            }
          } catch (error) {
            log.artist('Spotify identity lookup unavailable for YouTube artist route', {
              artistId,
              error: String(error),
            });
          }
        }
        if (active) {
          // A channel route can point to a sparse topic/legacy page. When the
          // canonical Spotify request is unavailable, resolve by name so the
          // public catalog can select the complete artist page instead.
          const fallbackRoute = routeArtistName
            ? toYouTubeMusicArtistRouteId(undefined, routeArtistName)
            : artistId;
          loadYouTubeMusicProfile(fallbackRoute);
        }
      })();
      return cleanup;
    }

    const artistRequest = getArtist(artistId)
      .then(async (artistData) => {
        if (!active) return undefined;
        setArtist({
          ...artistData,
          imageURL: artistData.imageURL || searchSeed?.artist.imageURL || '',
        });
        setArtistError('');
        void getCachedArtistImage(
          artistData.name,
          () => getArtistCatalogImage(artistId, artistData.name),
          [artistId]
        ).then((imageURL) => {
          if (active && imageURL) {
            setArtist((current) => current?.id === artistId
              ? { ...current, imageURL }
              : current);
          }
        }).catch(() => {});
        log.artist('profile loaded', {
          artistId,
          source: 'spotify',
          hasImage: Boolean(artistData.imageURL || searchSeed?.artist.imageURL),
        });
        return artistData;
      })
      .catch(async (error) => {
        log.error('spotify artist profile failed', { artistId, error });
        const downloaded = await libraryPromise.catch(() => []);
        if (!active) return null;
        const localProfile = buildLocalArtistProfile(downloaded, artistId, artistId);
        if (localProfile) {
            applyLocalArtistProfile(localProfile);
            setIsProfileReady(false);
            supplementFromPublicCatalog(localProfile.artist.name, artistId, localProfile);
        } else {
          const currentArtistName = playbackArtistName;
          if (currentArtistName) {
            setArtist({ id: artistId, type: 'artist', name: currentArtistName, imageURL: '' });
            setTopTracks([]);
            setParticipationTracks([]);
            setArtistError('');
            supplementFromPublicCatalog(currentArtistName, artistId);
          } else {
            setArtistError('Não foi possível carregar o perfil deste artista. Tente novamente.');
          }
        }
        return null;
      });

    const topTracksPromise = getArtistTopTracks(artistId)
      .catch((error) => {
        console.error('Failed to get artist top tracks:', error);
        return [];
      });

    const tracksRequest = topTracksPromise
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
            getArtistCatalogImage(artistId, fallbackArtistName),
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
      });

    const discographyRequest = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (!active) { resolve(); return; }
        watchDiscography(artistId, earlyArtistName);
        void getArtistDiscography(artistId)
      .then(async (discography) => {
        if (!active) return;
        const [artistData, popularTracks] = await Promise.all([
          artistRequest,
          topTracksPromise,
        ]);
        if (!active) return;
        const artistName = artistData?.name || '';
        const primaryTracks = uniqueTracksById([
          ...discography.tracks.filter((track) =>
            isRemotePrimaryArtist(track, artistId, artistName)
          ),
          ...popularTracks.filter((track) =>
            isRemotePrimaryArtist(track, artistId, artistName)
          ),
        ]);
        const featuredTracks = uniqueTracksById([
          ...discography.tracks.filter((track) =>
            !isRemotePrimaryArtist(track, artistId, artistName)
          ),
          ...popularTracks.filter((track) =>
            !isRemotePrimaryArtist(track, artistId, artistName)
          ),
        ]);
        setTopTracks((current) => uniqueTracksById([...current, ...primaryTracks]));
        setParticipationTracks((current) => uniqueTracksById([...current, ...featuredTracks]));
        const spotifyReleases = splitArtistReleases([
          ...discography.albums,
          ...(discography.singlesAndEps || []),
        ]);
        setAlbums(spotifyReleases.albums);
        setSinglesAndEps(spotifyReleases.singlesAndEps);
        if (
          primaryTracks.length + featuredTracks.length < MIN_TRACKS_BEFORE_PUBLIC_CATALOG_SUPPLEMENT &&
          artistName
        ) {
          supplementFromPublicCatalog(
            artistName,
            artistId,
            undefined,
            primaryTracks,
            featuredTracks
          );
        }
        log.artist('Spotify discography loaded', {
          artistId,
          albums: discography.albums.length,
          primaryTracks: primaryTracks.length,
          participations: featuredTracks.length,
        });
      })
      .catch((error) => log.error('Spotify artist discography failed', { artistId, error }))
      .finally(resolve);
      }, 0);
    });

    // The profile shell and popular tracks are interactive content. Do not keep
    // the whole screen in a loading state while the complete discography is
    // fetched after the first frame.
    void Promise.allSettled([artistRequest, tracksRequest]).finally(() => {
      if (active) {
        setIsRefreshing(false);
        if (!waitingForSupplement) setIsProfileReady(true);
      }
    });

    void discographyRequest;

    return cleanup;
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
    const profileContext = isYouTubeArtist
      ? []
      : /^[A-Za-z0-9]{22}$/.test(profileArtistId)
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
    isYouTubeArtist,
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
      loadingTracks={!isProfileReady}
      loadingError={artistError}
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
        albums.length || singlesAndEps.length ? (
          <>
            {albums.length ? (
              <Slider
                title="Álbuns"
                slides={albums}
                size={Sizes.SMALL}
                shape={Shapes.SQUARE_BORDER}
                withShowAll={false}
              />
            ) : null}
            {singlesAndEps.length ? (
              <Slider
                title="Singles e EPs"
                slides={singlesAndEps}
                size={Sizes.SMALL}
                shape={Shapes.SQUARE_BORDER}
                withShowAll={false}
              />
            ) : null}
          </>
        ) : null
      }
    />
  );
};
